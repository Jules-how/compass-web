import unittest
from signal_evidence import select_signal


def packet(*pages):
    return {'sources': [{'url': url, 'text': text} for url, text in pages]}


class SignalEvidenceTests(unittest.TestCase):
    def test_comfort_replacement_beats_evaporative(self):
        replacement = 'For many years, Comfort Zone has carried out numerous replacements of existing systems – both the complete system and the machinery only, leaving the ducting and zoning in place. This we can do with reverse cycle, evaporative products and even wall-mounted split systems.'
        p = packet(('https://www.comfortzoneairwa.com.au/evaporated-ducted-systems', 'Evaporative Ducted Systems in Perth\nIf you decide to have an evaporative ducted system installed in your Perth home, our team at Comfort Zone Air Conditioning will examine your home and provide you with a free quote.'), ('https://www.comfortzoneairwa.com.au/air-conditioning-system-replacement', 'Air Conditioning Replacement in Perth\n' + replacement))
        result = select_signal(p, {'icp_fit': True})
        self.assertEqual(result['quote'], replacement)
        self.assertEqual(result['allowed_claims'], [replacement])
        self.assertEqual(result['signal_type'], 'replacement_offer')

    def test_coastline_paragraph_not_heading(self):
        quote = "Whether it's a small split system install, replacement or complete new system upgrade Coastline Cooling Wa is at your service!"
        result = select_signal(packet(('https://www.coastlinecoolingwa.com/installations.html', 'Installations\n' + quote)))
        self.assertEqual(result['quote'], quote)

    def test_heading_and_navigation_not_signal(self):
        self.assertEqual(select_signal(packet(('https://example.com', 'Installations\nSplit System Installation\nSelect a Service Ducted Reverse Cycle Air Conditioning Evaporated Reverse Cycle Evaporated Ducted Systems Installation')))['status'], 'none')

    def test_comparison_does_not_establish_service(self):
        p = packet(('https://example.com/gas-heating', 'Gas heating installation\nWe install gas ducted heating systems that cost less to operate than reverse cycle air conditioning systems.'))
        self.assertEqual(select_signal(p)['status'], 'none')

    def test_review_not_company_offer(self):
        p = packet(('https://example.com', 'Home\nThanks for the great service and a big thank you to the crew who undertook the installations of the Ducted Reverse Cycle Air-conditioning units to three of my properties here in Perth area.'))
        self.assertEqual(select_signal(p)['status'], 'none')

    def test_factual_fallback_and_exact_quote(self):
        quote = 'Our team installs split system air conditioning for homes and businesses throughout the Perth metropolitan area.'
        result = select_signal(packet(('https://example.com/install', 'Our services\n' + quote)))
        self.assertEqual(result['signal_type'], 'basic_relevance')
        self.assertEqual(result['quote'], quote)

    def test_short_installation_inclusion(self):
        quote = 'Free wall brackets or mounting feet on all our installations'
        result = select_signal(packet(('https://www.theaircondude.com.au/', 'Air Conditioning in Perth WA - The Air Con Dude\n' + quote)), {'fit': 'fit'})
        self.assertEqual(result['quote'], quote)
        self.assertEqual(result['signal_type'], 'installation_offer')

    def test_aapl_finance_without_install_verb(self):
        quote = 'Interest-Free** – Online Finance application AAPL Air Conditioning has partnered with humm90 to give you access to a great range of Interest-Free terms.'
        p = packet(('https://aaplairconditioning.com.au/finance-options-available/', 'Air Conditioning Finance Options Available | AAPL Air\n' + quote))
        result = select_signal(p, {'fit': 'fit'})
        self.assertEqual(result['quote'], quote)
        self.assertEqual(result['signal_type'], 'finance')
        self.assertEqual(select_signal(p, {'fit': 'unresolved'})['status'], 'none')

    def test_unrelated_finance_refused(self):
        p = packet(('https://example.com/vehicle-finance', 'Vehicle finance\nWe offer easy payment plans and monthly repayments for your next vehicle purchase.'))
        self.assertEqual(select_signal(p, {'fit': 'fit'})['status'], 'none')
        p['sources'][0]['text'] = 'Air Conditioning Finance\nWe offer easy payment plans and monthly repayments for your next vehicle purchase.'
        self.assertEqual(select_signal(p, {'fit': 'fit'})['status'], 'none')

    def test_total_kooling_removal_not_testimonial(self):
        review = 'From initial visit to receiving a quote, to completing the job of installing a Daikin split system was 2 days. Amazing customer service and value for money.'
        removal = 'We will remove, decommission and dispose of an existing system that’s being replaced, along with any rubbish, at our expense.'
        p = packet(('https://totalkoolingsolutions.com.au/', 'Total Kooling Solutions\n' + review), ('https://totalkoolingsolutions.com.au/buyers-guide/installation-process/', 'Installation Process\n' + removal))
        result = select_signal(p, {'fit': 'fit'})
        self.assertEqual(result['quote'], removal)
        self.assertEqual(len(result['candidates']), 1)

    def test_no_signal_does_not_modify_fit(self):
        fit = {'icp_fit': True, 'facts': [{'value': 'installer'}]}
        self.assertEqual(select_signal(packet(('https://example.com', 'Installations')), fit)['status'], 'none')
        self.assertTrue(fit['icp_fit'])

    def test_negated_and_maps_not_service(self):
        p = packet(('https://example.com', 'We do not install split system air conditioners and only provide cleaning services throughout Perth.'), ('https://www.google.com/maps/search', 'We install split system air conditioning for homes and businesses throughout all of Perth.'))
        self.assertEqual(select_signal(p)['status'], 'none')


if __name__ == '__main__':
    unittest.main()
