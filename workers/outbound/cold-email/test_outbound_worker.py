import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import outbound_worker

class OutboundWorkerTests(unittest.TestCase):
    def test_ready_run_is_not_rendered_or_completed_twice(self):
        calls=[]
        def request(body):
            calls.append(body)
            return {'status':'ready'}
        with patch.object(outbound_worker,'render_preparation_ticket') as render:
            self.assertEqual(outbound_worker.execute('cell','run',request)['status'],'already_prepared')
            render.assert_not_called()
        self.assertEqual(len(calls),1)

    def test_claim_token_is_used_for_heartbeat_and_completion(self):
        calls=[]
        def request(body):
            calls.append(body)
            return {'status':'running','lease_token':'attempt-1'} if body['action']=='claim' else {'ok':True}
        with patch.object(outbound_worker,'render_preparation_ticket',return_value=[{'candidate_id':'one'}]):
            outbound_worker.execute('cell','run',request)
        self.assertEqual([b['action'] for b in calls],['claim','heartbeat','complete'])
        self.assertTrue(all(b['token']=='attempt-1' for b in calls[1:]))
        self.assertEqual(calls[-1]['outputs'],[{'candidate_id':'one'}])

    def test_uncertain_completion_does_not_overwrite_a_committed_attempt(self):
        calls=[]
        def request(body):
            calls.append(body)
            if body['action']=='complete':raise RuntimeError('connection lost')
            return {'status':'running','lease_token':'attempt-1'}
        with patch.object(outbound_worker,'render_preparation_ticket',return_value=[]):
            with self.assertRaises(RuntimeError):outbound_worker.execute('cell','run',request)
        self.assertEqual([b['action'] for b in calls],['claim','heartbeat','complete'])

    def test_cleanup_retains_raw_source_and_receipts(self):
        import generate_openers
        import sys
        sys.path.insert(0,str(Path(__file__).resolve().parent/'list-builds'))
        import filter_leads
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'in').mkdir();raw=root/'in'/'raw.json';raw.write_text('source')
            out=root/'out'/'hvac';out.mkdir(parents=True);receipt=out/'hvac-sydney-instantly-20260909.json';receipt.write_text('receipt')
            with patch.object(generate_openers,'SCRIPT_DIR',root),patch.object(filter_leads,'SCRIPT_DIR',root):
                self.assertEqual(generate_openers.cleanup_temps('hvac','sydney','20260909'),[])
                self.assertEqual(filter_leads.cleanup_temps(out),[])
            self.assertEqual(raw.read_text(),'source');self.assertEqual(receipt.read_text(),'receipt')

if __name__=='__main__':unittest.main()
