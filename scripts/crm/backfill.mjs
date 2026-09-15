/** Bounded compatibility importer. Default is dry-run; no provider calls or lead writes. */
import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {parseEnvFile,resolveConfig} from '../../mcp/lib.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,32)
const args=process.argv.slice(2),apply=args.includes('--apply')
const file=args.find(arg=>!arg.startsWith('--'))
if(!file)throw new Error('Usage: node scripts/crm/backfill.mjs manifest.json [--apply]. Dry-run writes manifest.json.packets.json; apply reads that exact packet file.')
const config=resolveConfig({...parseEnvFile(await fs.readFile(path.join(root,'.env.local'),'utf8')),...process.env})
async function api(route,body) {
  const response=await fetch(config.baseUrl+'/api/agent/crm'+route,{signal:AbortSignal.timeout(45000),method:body?'POST':'GET',headers:{'x-compass-agent-secret':config.secret,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
  const data=await response.json()
  if(!response.ok)throw new Error(`${response.status}: ${data.error||'CRM API failure'}`)
  return data
}
const capability=await api('/capabilities')
if(!capability.enabled||capability.schema_version!=='crm.research.v1')throw new Error('Compatible research schema is not enabled')
const input=JSON.parse(await fs.readFile(file,'utf8'))
if(apply) {
  if(!Array.isArray(input.packets)||input.packets.length>20)throw new Error('Apply requires a reviewed dry-run packet file, maximum 20 packets')
  const receipts=[]
  for(const packet of input.packets) {
    const receipt=await api('/research',packet)
    const readback=await api('/receipts/'+encodeURIComponent(packet.request_id))
    if(receipt.payload_hash!==readback.payload_hash||readback.operations.length!==packet.operations.length)throw new Error('Receipt reconciliation failed')
    receipts.push(readback)
    await fs.writeFile(file+'.receipts.json',JSON.stringify(receipts,null,2),{mode:0o600})
  }
  process.stdout.write(`Reconciled ${receipts.length} packets. Legacy lead and campaign records were not modified.\n`)
}else {
  if(!Array.isArray(input.entries)||input.entries.length<1||input.entries.length>20)throw new Error('Manifest must contain 1–20 explicitly reviewed entries')
  const packets=[],seen=new Set(),issues=[]
  const op=(kind,record)=>({kind,expected_revision:0,record})
  for(const entry of input.entries) {
    if(Object.keys(entry).some(key=>!['lead_id','company_id','source_url','reason'].includes(key))||!entry.lead_id||!entry.company_id||!entry.source_url||!entry.reason)throw new Error('Every mapping requires lead_id, existing company_id, source_url and reason; unknown fields are rejected')
    const {lead,links}=await api('/leads/'+encodeURIComponent(entry.lead_id))
    await api('/companies/'+encodeURIComponent(entry.company_id))
    if(links.some(link=>link.match_state==='confirmed')){issues.push({lead_id:entry.lead_id,reason:'Existing confirmed link; review instead of replacing'});continue}
    const run=digest([entry,lead]),sourceId='legacy-source-'+run,operations=[op('source',{id:sourceId,source_type:'legacy_import',url:entry.source_url,external_id:lead.id,note:'Copied from Compass lead snapshot. Source observation dates remain unknown. '+entry.reason})]
    const primary={}
    let after='',existing=[]
    do {const page=await api(`/collections?collection=candidates&company_id=${encodeURIComponent(entry.company_id)}&limit=100${after?'&after='+encodeURIComponent(after):''}`);existing.push(...page.records);after=page.next_after;if(existing.length>2000)throw new Error('Company has over 2000 routes; use a reviewed targeted import')}while(after)
    for(const kind of ['email','phone']) {
      if(!lead[kind])continue
      const {method}=await api(`/methods?type=${kind}&value=${encodeURIComponent(lead[kind])}`)
      const value=kind==='email'?lead[kind].trim().toLowerCase():lead[kind].trim().replace(/[\s().-]/g,'')
      const methodId=method?.id||'legacy-method-'+digest([kind,value])
      if(!method&&!seen.has(methodId)){operations.push(op('method',{id:methodId,method_type:kind,value:lead[kind],normalized_value:value}));seen.add(methodId)}
      const found=existing.find(candidate=>candidate.method_id===methodId&&!candidate.affiliation_id&&!candidate.location_id)
      const candidateId=found?.id||'legacy-candidate-'+digest([entry.company_id,methodId])
      if(!found&&!seen.has(candidateId)){operations.push(op('candidate',{id:candidateId,company_id:entry.company_id,method_id:methodId,purpose:'unknown',first_origin:'legacy_unknown',state:'unresolved'}));seen.add(candidateId)}
      primary['primary_'+kind+'_candidate_id']=candidateId
      if(kind==='email'&&['valid','invalid','catch_all','unknown','risky'].includes(lead.email_verify_status))operations.push(op('verification',{id:'legacy-check-'+run,method_id:methodId,provider:'legacy_unknown',submitted_address:value,checked_at:lead.email_verified_at||null,attempt_state:'completed',mailbox_result:lead.email_verify_status,raw_status:lead.email_verify_status,legacy_import:true,source_id:sourceId}))
    }
    for(const [index,fact] of (Array.isArray(lead.lead_facts)?lead.lead_facts:[]).entries()) {
      const factSource='legacy-fact-source-'+digest([run,index])
      operations.push(op('source',{id:factSource,source_type:'legacy_import',url:fact.url||null,external_id:lead.id,note:'Legacy lead_facts claim; not an exact website quote.'}),op('observation',{id:'legacy-fact-'+digest([run,index]),company_id:entry.company_id,fact_key:'note',value:`${fact.kind}: ${fact.claim}`,source_id:factSource,locator:`lead_contacts/${lead.id}/lead_facts/${index}`,evidence_type:'legacy_import',review_status:'pending'}))
    }
    operations.push(op('lead_link',{id:'legacy-link-'+digest([lead.id,entry.company_id]),lead_id:lead.id,company_id:entry.company_id,match_state:'confirmed',reason:entry.reason,source_id:sourceId,expected_lead_updated_at:lead.updated_at||null,...primary}))
    packets.push({schema_version:'crm.research.v1',request_id:'legacy-import-'+run,source:'Reviewed legacy compatibility mapping',operations})
  }
  await fs.writeFile(file+'.packets.json',JSON.stringify({packets,issues},null,2),{mode:0o600})
  process.stdout.write(`Dry-run: ${packets.length} packets, ${issues.length} held mappings. No writes performed. Review ${file}.packets.json before a separately authorised apply.\n`)
}
