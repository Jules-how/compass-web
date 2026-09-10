import unittest
from copy_grounding import validate_copy

class CopyGroundingTests(unittest.TestCase):
    def evidence(self, quote):
        return {'status':'selected','quote':quote,'url':'https://example.org/install','allowed_claims':[quote]}
    def test_rejects_original_coastline_hallucination(self):
        source=self.evidence('We install and replace split systems.')
        errors=validate_copy({'subject':'Installation enquiries','opener':'Saw your business provides professional equipment installations for commercial refrigeration and temperature-sensitive operations.'},source)
        self.assertIn('unsupported_claim:refrigeration',errors)
        self.assertIn('unsupported_claim:commercial',errors)
    def test_accepts_supported_replacement_paraphrase(self):
        source=self.evidence('We replace reverse cycle equipment, leaving the existing ducting and zoning in place.')
        self.assertEqual(validate_copy({'subject':'Your reverse cycle replacements','opener':'Saw you replace reverse cycle equipment while retaining the existing ducting and zoning.'},source),[])
    def test_subject_is_checked_too(self):
        self.assertIn('unsupported_brand:daikin',validate_copy({'subject':'Daikin installations','opener':'Saw you install split systems.'},self.evidence('We install split systems.')))
    def test_rejects_invented_scope_number_and_customer(self):
        errors=validate_copy({'subject':'Your six zone packages','opener':'Saw you install all six zone ducted packages for homeowners with a 10 year warranty.'},self.evidence('We install ducted systems.'))
        for reason in ['unsupported_claim:residential','unsupported_claim:warranty','unsupported_scope:all','unsupported_number:10']:
            self.assertIn(reason,errors)
    def test_missing_signal_never_qualifies_copy(self):
        self.assertEqual(validate_copy({'subject':'Installation','opener':'Saw you install split systems.'},{'status':'none'}),['no_usable_opener_evidence'])
    def test_allowed_claim_cannot_be_fabricated(self):
        source=self.evidence('We install split systems.');source['allowed_claims']=['We offer finance.']
        self.assertIn('claim_not_in_selected_quote',validate_copy({'subject':'Your finance','opener':'Saw you offer finance for installations.'},source))

if __name__=='__main__':unittest.main()
