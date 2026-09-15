import { parseLeadFacts } from './lead-facts'
import { applyLeadIcpFields } from './lead-icp'
import { mapLegacyEmailOrigin, mapLegacyEnrichStatus, mapLegacyIcpStatus } from './lead-import-shared'

export class LeadWriteValidationError extends Error {
  constructor(public issues: Array<{path:string;message:string}>) { super(issues.map(x=>`${x.path}: ${x.message}`).join('; ')); this.name='LeadWriteValidationError' }
}
export const LEAD_COMMIT_KEYS = new Set(['id','contact_source_key','phone_source_url','email','company','name','phone','role','city','state','linkedin','website','tags','opener','opener_track','opener_kind','lead_facts','icp_status','vertical','source','cohort_tag','pipeline_campaign_id','enrich_status','outbound_status','review_count','hours_label','after_hours','capture_crack','email_origin','company_domain','import_batch_id','lead_status_source','email_verify_status','email_verified_at','identity_review'])
export const LEAD_SHARED_MARK_KEYS = new Set(['pipeline_campaign_id','cohort_tag','enrich_status','outbound_status','instantly_lead_id','instantly_campaign_id','instantly_campaign_name','instantly_campaign','instantly_uploaded_at','email_verify_status','email_verified','email_verified_at'])
export const LEAD_ICP_KEYS = ['icp_status','review_count','hours_label','after_hours','capture_crack','email_origin']
export function assertKnownFields(input: unknown, keys: Set<string>, path: string): asserts input is Record<string, unknown> {
  if (!input || typeof input!=='object' || Array.isArray(input)) throw new LeadWriteValidationError([{path,message:'Object required'}])
  const extra=Object.keys(input).filter(k=>!keys.has(k))
  if (extra.length) throw new LeadWriteValidationError(extra.map(k=>({path:`${path}.${k}`,message:'Unsupported field; nothing was saved'})))
}
export function validateLeadCommitInput(input: unknown, path: string) {
  assertKnownFields(input,LEAD_COMMIT_KEYS,path)
  const issues: LeadWriteValidationError['issues']=[]
  const fail=(key:string,message:string)=>issues.push({path:`${path}.${key}`,message})
  for (const [key,value] of Object.entries(input)) {
    if (value==null || ['lead_facts','review_count','after_hours','identity_review'].includes(key)) continue
    if (typeof value!=='string') fail(key,'Text or null required')
  }
  if (input.lead_facts!==undefined) { const facts=parseLeadFacts(input.lead_facts); if (!facts.ok) fail('lead_facts',facts.error) }
  const normalized={...input}
  if (input.icp_status!==undefined) normalized.icp_status=mapLegacyIcpStatus(input.icp_status as string|null)
  if (input.email_origin!==undefined) normalized.email_origin=mapLegacyEmailOrigin(input.email_origin as string|null)
  const icp=applyLeadIcpFields(normalized,{})
  if (!icp.ok) fail('icp',icp.error)
  if (input.enrich_status!=null && !['none','queued','enriched','thin','opener_ready','uploaded'].includes(mapLegacyEnrichStatus(String(input.enrich_status)) ?? '')) fail('enrich_status','Invalid enrichment state')
  if (input.email_verify_status!=null && !['','none','valid','catch_all','invalid','unknown','risky'].includes(String(input.email_verify_status))) fail('email_verify_status','Invalid mailbox state')
  if (input.email_verified_at!=null && !Number.isFinite(Date.parse(String(input.email_verified_at)))) fail('email_verified_at','Invalid verification date')
  if (input.identity_review!==undefined) {
    assertKnownFields(input.identity_review,new Set(['kind','existing_id','expected_email','source_url','reason','reviewed_at','email_verified_at','prior_contact_checked','prior_contact_found']),`${path}.identity_review`)
  }
  if (issues.length) throw new LeadWriteValidationError(issues)
}
