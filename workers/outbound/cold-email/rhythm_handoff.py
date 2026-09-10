"""Commit reviewed calling candidates to Compass; never send, dial or select a cadence.
Usage: python3 cold-email/rhythm_handoff.py --register JOB/register.json
Use --commit to write through the supported agent API and verify returned IDs.
"""
import argparse,json,os,urllib.request
from pathlib import Path

def payloads(register):
    rows=[]
    for r in register:
        if r.get('route')!='cold_call_fit' or not r.get('phone') or r.get('assessment',{}).get('fit')!='fit':continue
        sources=r.get('sources',[])
        original=r.get('original_row',{})
        source=original.get('url') or original.get('googleMapsUrl')
        if not source:
            source=next((s.get('url') for s in sources if str(r['phone']) in s.get('text','')),None)
        if not source:continue
        row={'company':r['company'],'phone':r['phone'],'phone_source_url':source,'city':r.get('city'),'website':r.get('website'),'icp_status':'pass','source':'city_pipeline','contact_source_key':'city_pipeline:'+str(r['source_id']),'vertical':'hvac'}
        if r.get('lead_id'):row['id']=r['lead_id']
        # Invalid or unknown email is not needed to create a calling identity.
        rows.append(row)
    return rows

def main():
    p=argparse.ArgumentParser();p.add_argument('--register',required=True);p.add_argument('--commit',action='store_true');args=p.parse_args()
    file=Path(args.register);rows=payloads(json.loads(file.read_text()));out=file.parent/'compass-call-commit.json';out.write_text(json.dumps({'rows':rows},indent=2))
    if not args.commit:print(json.dumps({'prepared':len(rows),'payload':str(out),'committed':False}));return
    env=dict(os.environ)
    envfile=Path(__file__).resolve().parent.parent/'compass-web/.env.local'
    for line in (envfile.read_text().splitlines() if envfile.exists() else []):
        if '=' in line and not line.lstrip().startswith('#'):
            k,v=line.split('=',1);env.setdefault(k.strip(),v.strip().strip('\"').strip("'"))
    base=env.get('COMPASS_BASE_URL','https://compass-web-eosin.vercel.app')
    def request(path,body=None):
        req=urllib.request.Request(base+path,data=json.dumps(body).encode() if body is not None else None,headers={'Authorization':'Bearer '+env['COMPASS_AGENT_SECRET'],'Content-Type':'application/json'})
        return json.load(urllib.request.urlopen(req,timeout=45))
    if not rows:print(json.dumps({'prepared':0,'committed':False}));return
    result=request('/api/agent/leads',{'rows':rows});(file.parent/'compass-call-receipt.json').write_text(json.dumps(result,indent=2))
    checked=[]
    for rec in result.get('receipts',[]):
        lead=request('/api/agent/outbound/rhythm?lead='+rec['id'])['lead']
        checked.append({'id':lead['id'],'company':lead['company'],'phone':lead['phone'],'email':lead['email'],'contact_source_key':lead.get('contact_source_key')})
    (file.parent/'compass-call-readback.json').write_text(json.dumps(checked,indent=2))
    print(json.dumps({'ok':result.get('ok'),'inserted':result.get('inserted'),'updated':result.get('updated'),'skipped':result.get('skipped'),'read_back':len(checked)}))
if __name__=='__main__':main()
