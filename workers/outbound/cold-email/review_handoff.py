"""Existing Compass preparation payload shape; no networking or write authority."""

def preparation_rows(results):
    output=[]
    for row in results:
        assessment=row.get('assessment',{})
        evidence=[]
        for kind in ['service','service_area','operating','email','person_name']:
            choices=[f for f in assessment.get('facts',[]) if f.get('kind')==kind]
            if not choices:continue
            fact=max(choices,key=lambda f:len(f.get('quote','')))
            evidence.append({k:str(fact.get(k,'')) for k in ['kind','value','quote','url']})
        selected=row.get('opener_evidence',{})
        if selected.get('status')=='selected':
            evidence.append({'kind':'opener_signal','value':selected['quote'],'quote':selected['quote'],'url':selected['url']})
        stamps={s.get('url'):s.get('observed_at','') for s in row.get('sources',[])}
        for fact in evidence:fact['observed_at']=stamps.get(fact['url'],'')
        route=row.get('route','unresolved')
        result={k:row.get(k) for k in ['company','website','email','lead_id']}
        result.update(source_id=row.get('source_id'),identity_reviewed=row.get('identity_reviewed') is True,
                      evidence=evidence,verification={'status':row.get('verification',{}).get('status') or row.get('verification',{}).get('result','unknown'),'provider':row.get('verification',{}).get('provider',''),'checked_at':row.get('verification',{}).get('checked_at','')},
                      outreach_review={k:row.get('outreach_review',{}).get(k,'') for k in ['status','source','checked_at']},
                      hold_reason='' if route=='email_review' else row.get('hold_reason') or route,
                      exclude_reason=assessment.get('reason','not_fit') if route=='not_fit' else '',
                      selection_audit=selected,copy_validation=row.get('copy_validation',{}))
        if route=='email_review' and assessment.get('subject') and assessment.get('opener'):
            result['draft']={k:assessment.get(k,'') for k in ['subject','opener','signal_type','offer_connection']}
            result['draft']['evidence_kinds']=['service','opener_signal']
        output.append(result)
    return output
