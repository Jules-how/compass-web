import unittest
from review_handoff import preparation_rows


class ReviewHandoffTests(unittest.TestCase):
    def row(self, route='email_review'):
        return dict(company='Example AC', route=route, assessment={
            'fit': 'high', 'subject': 'Split installation',
            'opener': 'Saw you install split systems.',
            'signal_type': 'basic_relevance', 'facts': []},
            opener_evidence={'status': 'selected', 'quote': 'We install split systems.',
                             'url': 'https://example.test/install'},
            verification={'result': 'valid'},
            sources=[{'url': 'https://example.test/install', 'observed_at': '2026-09-10'}])

    def test_supported_quote_and_verification_survive_handoff(self):
        result = preparation_rows([self.row()])[0]
        evidence = result['evidence'][0]
        self.assertEqual(evidence['value'], evidence['quote'])
        self.assertEqual(evidence['observed_at'], '2026-09-10')
        self.assertEqual(result['verification']['status'], 'valid')
        self.assertIn('opener_signal', result['draft']['evidence_kinds'])
        self.assertFalse(result['identity_reviewed'])

    def test_hold_never_exports_draft_or_changes_original_fit(self):
        row = self.row('writing_hold')
        row['hold_reason'] = 'unsupported claim'
        result = preparation_rows([row])[0]
        self.assertNotIn('draft', result)
        self.assertEqual(result['hold_reason'], 'unsupported claim')
        self.assertEqual(row['assessment']['fit'], 'high')


if __name__ == '__main__':
    unittest.main()
