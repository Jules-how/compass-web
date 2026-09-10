import concurrent.futures as cf
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
from outbound_pipeline import Pipeline, validate_assessment, save, read, fresh, now, useful_links, protected_contacts, indexed_evidence, materialize_evidence

class PipelineTests(unittest.TestCase):
    def test_public_email_encoding_is_decoded_from_retained_html(self):
        email='quotes@example.org';key=43;encoded=bytes([key]+[ord(c)^key for c in email]).hex()
        self.assertEqual(protected_contacts('<a data-cfemail="'+encoded+'">email</a>')[0]['email'],email)
        self.assertEqual(protected_contacts('<a data-cfemail="invalid">email</a>'),[])
    def test_indexed_contacts_restore_exact_website_source_and_reject_maps_only(self):
        packet={'sources':[{'url':'https://example.org','text':'We install split systems in Perth.\nquotes@example.org'},{'url':'https://www.google.com/maps/test','text':'maps-only@example.org'}]}
        entries=indexed_evidence(packet);wrong=next(x['id'] for x in entries if not x['website'])
        result={'selected_email':'quotes@example.org','contact_name':'','facts':[{'kind':'email','evidence_id':wrong}]}
        fixed=materialize_evidence(result,entries);self.assertEqual(fixed['facts'][0]['url'],'https://example.org')
        result['selected_email']='maps-only@example.org';fixed=materialize_evidence(result,entries)
        self.assertEqual(fixed['selected_email'],'');self.assertEqual(fixed['facts'],[])
    def test_failed_model_response_is_not_retried_on_unchanged_resume(self):
        with tempfile.TemporaryDirectory() as d,patch('outbound_pipeline.config_secrets',return_value={}):
            p=Pipeline({**self.config(),'model_provider':'parallel'},d)
            with patch('outbound_pipeline.request_json',side_effect=RuntimeError('provider_http_401')) as request:
                packet={'source_id':'one','company':'One','sources':[],'body':'Fixed body'}
                first=p.assess(packet);self.assertEqual(first['status'],'assessment_error');self.assertEqual(p.assess(packet),first);self.assertEqual(request.call_count,1)
    def config(self):
        return dict(city='Perth',limit=4,body='Fixed body',followup='Fixed follow-up',model_provider='handoff',verification_batch=1)
    def test_source_gate_rejects_invented_email_and_unquoted_claim(self):
        packet={'sources':[{'url':'https://example.org','text':'We install split systems in Perth.'}]}
        a={'fit':'fit','system_types':['single_split'],'facts':[{'kind':k,'value':'install','quote':'We install split systems in Perth.','url':'https://example.org'} for k in ['service','service_area','operating']], 'selected_email':'fake@example.org','subject':'Split installs','opener':'Saw your split installation service.'}
        self.assertIn('email_not_published',validate_assessment(a,packet))
        a['facts'][0]['quote']='We offer finance';self.assertIn('quote_not_in_source:service',validate_assessment(a,packet))
    def test_tracking_homepage_is_not_fetched_twice(self):
        page={'url':'https://example.org/?utm_source=maps','html':'<a href="/">Home</a><a href="/contact">Contact</a><a href="/split-installation">Install</a><a href="/resources">Blog</a>'}
        self.assertEqual(useful_links(page),['https://example.org/contact','https://example.org/split-installation'])
    def test_streaming_overlap_routes_and_resume(self):
        class Fake(Pipeline):
            def discovery(self,emit=None):
                for i in range(4):
                    if emit:emit({'title':str(i)},i)
                    time.sleep(.04)
                self.discovered_at=time.monotonic();return []
            def research(self,row,i):
                self.first_research=min(getattr(self,'first_research',float('inf')),time.monotonic())
                time.sleep(.02)
                return {'source_id':str(i),'company':str(i),'phone':'0899999999','sources':[]}
            def assess(self,p):
                i=int(p['source_id']);time.sleep(.02)
                return {'status':'assessed','assessment':{'fit':'not_fit' if i==3 else 'fit','selected_email':f'a{i}@example.org' if i<2 else '', 'subject':'Subject','opener':'Observed service'}}
            def eligibility(self,emails):
                for e in emails:self.history_cache[e]={'status':'uncontacted','checked_at':now()}
            def verify(self,emails):
                self.first_verify=min(getattr(self,'first_verify',float('inf')),time.monotonic())
                for e in emails:self.verify_cache[e]={'result':'ok' if e.startswith('a0') else 'invalid','checked_at':now()}
        with tempfile.TemporaryDirectory() as d:
            with patch('outbound_pipeline.config_secrets',return_value={}):p=Fake(self.config(),d)
            rows=p.run()
            self.assertLess(p.first_research,p.discovered_at)
            self.assertLess(p.first_verify,p.discovered_at)
            self.assertEqual([r['route'] for r in rows],['email_review','cold_call_fit','cold_call_fit','not_fit'])
            self.assertTrue(all('Fixed body' in x for x in [Path(d,'review.csv').read_text()]))
    def test_cached_draft_is_revalidated_and_body_changes_invalidate_it(self):
        with tempfile.TemporaryDirectory() as d,patch('outbound_pipeline.config_secrets',return_value={}):
            p=Pipeline(self.config(),d);packet={'source_id':'one','company':'One','sources':[],'body':'Fixed body'}
            a={'fit':'not_fit','selected_email':'','facts':[]}
            save(Path(d,'draft-inputs/one.json'),{'assessment':a,'usage':{'cost':None}})
            first=p.assess(packet);self.assertEqual(first['status'],'assessed')
            self.assertEqual(p.assess(packet),first)
            packet['body']='Different body';self.assertNotEqual(first['input_hash'],p.assess(packet)['input_hash'])
    def test_unknown_history_does_not_purchase_verification(self):
        with tempfile.TemporaryDirectory() as d,patch('outbound_pipeline.config_secrets',return_value={}):
            p=Pipeline(self.config(),d)
            with patch.object(p,'verify') as verify:
                p.eligible_verify(['a@example.org'])
                verify.assert_called_once_with([])
            self.assertEqual(p.history_cache['a@example.org']['status'],'unknown')
    def test_freshness_requires_a_recent_real_date(self):
        self.assertTrue(fresh(now()));self.assertFalse(fresh('2020-01-01T00:00:00Z'));self.assertFalse(fresh(''))

if __name__=='__main__':unittest.main()
