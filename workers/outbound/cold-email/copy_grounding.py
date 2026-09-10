"""Conservative copy checks. These catch known claim drift, not all semantic errors."""
import re
import unicodedata

VERSION = 'copy-grounding-1'


def normal(text):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', str(text)).lower().replace('–', '-').replace('—', '-')).strip()


# Controlled concepts prevent plausible-sounding additions to thin evidence.
CONCEPTS = {
    'refrigeration': r'\brefrigerat\w*',
    'ducted': r'\bducted\b|\bducting\b',
    'split': r'\bsplits?\b',
    'multi_split': r'\bmulti[ -]?(?:split|head)\b',
    'reverse_cycle': r'\breverse[ -]cycle\b',
    'evaporative': r'\bevaporat\w*',
    'gas': r'\bgas\b',
    'finance': r'\bfinanc\w*|\bpayment plans?\b|\bspread (?:the )?cost\b',
    'rebate': r'\brebates?\b|\bgovernment incentive\w*',
    'free': r'\bfree\b|\bno cost\b|\bno charge\b',
    'warranty': r'\bwarrant\w*|\bguarantee\w*',
    'residential': r'\bhome(?:s|owners?)?\b|\bresidential\b|\bhouse(?:s|holds?)?\b|\bapartments?\b',
    'commercial': r'\bcommercial\b|\bbusinesses\b|\boffices?\b|\bindustrial\b',
    'replacement': r'\breplac\w*',
    'removal': r'\bremov\w*|\bdispos\w*|\bdecommission\w*',
    'package': r'\bpackages?\b|\bbundles?\b',
    'retained_ducting': r'\bretain\w*|\bleav\w* (?:the )?(?:existing )?duct',
}
BRANDS = ['daikin', 'mitsubishi', 'fujitsu', 'panasonic', 'haier', 'toshiba', 'humm90', 'airtouch', 'hitachi']


def validate_copy(draft, selected):
    """Return review reasons; passing means guardrails passed, never semantic proof."""
    errors = []
    subject = str(draft.get('subject', ''))
    opener = str(draft.get('opener', ''))
    claims = selected.get('allowed_claims') or []
    evidence = normal(' '.join(claims))
    quote = normal(selected.get('quote', ''))
    if selected.get('status') != 'selected' or not quote or not evidence:
        return ['no_usable_opener_evidence']
    # Allowed claims are literal excerpts, not model-synthesized assertions.
    if any(normal(c) not in quote for c in claims):
        errors.append('claim_not_in_selected_quote')
    text = normal(subject + ' ' + opener)
    if not subject.strip() or len(subject) > 100 or not opener.strip() or len(opener) > 450:
        errors.append('copy_length')
    if re.search(r'[{}]|^\s*(?:re:|fwd:)', subject, re.I) or re.search(r'[{}$—]', opener):
        errors.append('copy_tokens_or_price')
    if re.search(r'\b(?:we|our|us)\b', opener, re.I):
        errors.append('wrong_speaker')
    if re.search(r'\b(?:struggling|losing leads|need more (?:jobs|leads)|spare capacity|not running ads|recently expanded|currently promoting|pushing)\b', text):
        errors.append('unsupported_business_inference')
    if re.search(r'your (?:platform|online presence)|temperature-sensitive|trusted name|commitment to|impressed by|industry-leading', text):
        errors.append('generic_or_unsupported_copy')
    for concept, pattern in CONCEPTS.items():
        if re.search(pattern, text) and not re.search(pattern, evidence):
            errors.append('unsupported_claim:' + concept)
    for brand in BRANDS:
        if re.search(r'\b' + brand + r'\b', text) and not re.search(r'\b' + brand + r'\b', evidence):
            errors.append('unsupported_brand:' + brand)
    number_words={'one':'1','two':'2','three':'3','four':'4','five':'5','six':'6','seven':'7','eight':'8','nine':'9','ten':'10','eleven':'11','twelve':'12'}
    numeric_text=re.sub(r'\b('+ '|'.join(number_words) +r')\b',lambda m:number_words[m[0]],text)
    numeric_evidence=re.sub(r'\b('+ '|'.join(number_words) +r')\b',lambda m:number_words[m[0]],evidence)
    for number in re.findall(r'\b\d+(?:\.\d+)?\b', numeric_text):
        if not re.search(r'(?<!\d)' + re.escape(number) + r'(?!\d)', numeric_evidence):
            errors.append('unsupported_number:' + number)
    for place in re.findall(r'\b(?:in|across|around|throughout) ([A-Z][a-z]+(?: [A-Z][a-z]+)*)', subject+' '+opener):
        if normal(place) not in evidence:errors.append('unsupported_location:'+place)
    for claim in ['all', 'most', 'only', 'specialist', 'specialise', 'specialize', 'certified', 'licensed']:
        if re.search(r'\b'+claim+r'\b', text) and not re.search(r'\b'+claim+r'\b', evidence):
            errors.append('unsupported_scope:' + claim)
    # A meaningful opener still needs an observed service or offer, not generic praise.
    if not re.search(r'install|replac|supply|suppli|finance|payment|package|duct|split|remov', normal(opener)):
        errors.append('no_service_observation')
    return sorted(set(errors))
