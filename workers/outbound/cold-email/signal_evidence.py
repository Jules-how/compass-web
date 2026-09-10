"""Conservative, offline opener evidence selection; deliberately independent of fit."""
import re
from urllib.parse import urlparse

TARGET = re.compile(r'\breverse[ -]cycle\b|\b(?:multi[ -]?(?:split|head)|(?:wall[ -]mounted |single[ -])?split)(?:[ -]?(?:systems?|air|install|units?))?\b|\brefrigerated ducted\b', re.I)
ACTION = re.compile(r'\binstall(?:ation|ations|ed|ing|s)?\b|\breplac(?:e|es|ement|ements|ing)\b|\bupgrad(?:e|es|ing)\b', re.I)
EXCLUDED = re.compile(r'evaporat(?:ive|ed)|\bgas\b', re.I)
TESTIMONIAL = re.compile(r'\b(?:testimonial|customer review|google review|five.star|5.star)\b|\b(?:thank you|thanks|highly recommend|would recommend|my sincere appreciation|my properties|our installer was|they installed|they replaced|amazing customer service|from initial visit|excellent workmanship|very happy with)\b', re.I)
COMPARISON = re.compile(r'\b(?:than|versus|vs\.?|compared (?:with|to)|unlike)\b', re.I)


def _paragraphs(text):
    # HTTP-to-text preserves paragraphs as lines. Keep complete paragraphs, not
    # headings or arbitrary character windows that detach the service context.
    for match in re.finditer(r'[^\r\n]+', text):
        value = match.group().strip()
        if value:
            yield value


def select_signal(packet, assessment=None):
    """Return selected source-backed evidence or NONE without changing ICP fit.

    allowed_claims are verbatim evidence, not permission to infer buyer needs.
    candidates expose the selected paragraph's page context for review.
    """
    candidates = []
    qualified = (assessment or {}).get('fit') == 'fit' or (assessment or {}).get('icp_fit') is True
    for source in packet.get('sources', []):
        url, text = source.get('url', ''), source.get('text', '')
        if not text or 'google.com/maps' in url or source.get('source') == 'maps':
            continue
        title = source.get('title') or next(iter(_paragraphs(text)), '')
        page_context = urlparse(url).path.replace('-', ' ') + ' ' + title
        excluded_page = bool(EXCLUDED.search(page_context))
        installation_page = bool(re.search(r'install|replac', page_context, re.I))
        ac_page = bool(re.search(r'air[ -]condition|\bducted\b|split[ -]system', page_context, re.I))
        review_page = bool(re.search(r'testimonial|reviews?', page_context, re.I))
        for quote in _paragraphs(text):
            words = quote.split()
            installation_inclusion = bool(qualified and installation_page and re.search(r'\b(?:remove|decommission|dispose|removal|disposal|retain)\b', quote, re.I) and re.search(r'\b(?:system|unit|ducting|equipment)\b', quote, re.I))
            finance_offer = bool(qualified and ac_page and not re.search(r'vehicle|car loan|mortgage|solar.only', quote, re.I) and re.search(r'finance|financing|payment plan|interest.free', quote, re.I) and re.search(r'partnered|provided by|repayments|we offer|we provide|access to|pay no interest', quote, re.I))
            if len(words) < 7 or len(quote) > 2400 or (not ACTION.search(quote) and not finance_offer and not installation_inclusion):
                continue
            if review_page or TESTIMONIAL.search(quote):
                continue
            # Menu/form lists are not published service propositions.
            if re.search(r'select a service|^home\b|^services?\s*[:|]|\bcontact us\b.*@', quote, re.I):
                continue
            target = bool(TARGET.search(quote))
            if EXCLUDED.search(quote) or excluded_page:
                # A comparison mentioning reverse-cycle does not establish an
                # offered reverse-cycle service. Mixed replacement paragraphs
                # may qualify when they explicitly describe both systems.
                if not target or COMPARISON.search(quote):
                    continue
                if excluded_page and not re.search(r'(?:install\w*|replac\w*)[^.!?]{0,90}(?:reverse[ -]cycle|split)|(?:reverse[ -]cycle|split)[^.!?]{0,90}(?:install\w*|replac\w*)', quote, re.I):
                    continue
            if not target and not re.search(r'air[ -]condition|\bducted\b', quote, re.I) and not (qualified and ac_page) and not finance_offer and not installation_inclusion:
                continue
            # Reject negated availability rather than treating a keyword as an offer.
            if re.search(r'\b(?:do not|don.t|no longer|never)\s+(?:offer\s+|provide\s+)?(?:install|replace)|\bnot\s+(?:an?\s+)?installer', quote, re.I):
                continue
            kind, score = 'basic_relevance', 20
            if target:
                score += 15
            if re.search(r'\breplac(?:e|es|ement|ements|ing)\b', quote, re.I):
                kind, score = 'replacement_offer', score + 25
            if re.search(r'\b(?:package|retain|retaining|leaving the ducting|disposal|removal|decommission|dispose)\b|\$\s*\d|\bfree\s+(?:wall|bracket|mounting|removal)|\binclud(?:es|ed|ing)\s+(?:installation|removal|disposal|brackets)', quote, re.I):
                kind, score = ('replacement_offer' if kind == 'replacement_offer' else 'installation_offer'), score + 15
            if re.search(r'\b(?:finance|financing|payment plan|interest.free)\b', quote, re.I):
                kind, score = 'finance', score + 15
            if re.search(r'\b(?:service|maintenance|cleaning)\b', title, re.I) and not re.search(r'install|replac', title, re.I):
                score -= 10
            candidates.append({'signal_type': kind, 'quote': quote, 'url': url,
                               'title': title, 'score': score, 'allowed_claims': [quote]})
    candidates.sort(key=lambda c: (-c['score'], c['url'], c['quote']))
    # Keep the strongest passage for each URL/quote without manufacturing facts.
    unique = list({(c['url'], c['quote']): c for c in candidates}.values())
    if not unique:
        return {'status': 'none', 'signal_type': 'none', 'quote': '', 'url': '',
                'allowed_claims': [], 'reason': 'No substantive in-scope installation passage; fit is unchanged.', 'candidates': []}
    best = unique[0]
    return {'status': 'selected', 'signal_type': best['signal_type'],
            'quote': best['quote'], 'url': best['url'], 'allowed_claims': best['allowed_claims'],
            'reason': 'Substantive installation evidence selected with original paragraph and page context.',
            'candidates': unique[:8]}
