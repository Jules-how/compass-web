# site_extract.py

Implementation reference, updated 10 September 2026. [List building](AGENT.md) owns the new workflow; [ICP research](../../.agents/skills/icp-research/SKILL.md) owns evidence interpretation.

## Existing behaviour

The script uses concurrent httpx, then Parallel Extract on misses. Firecrawl is opt-in. It starts with the homepage and may try /contact when no inbox is found. It copies published emails and legacy specialty/name fields. Options include --output, --cache-dir, --resume, --skip-parallel, --firecrawl and --workers. Existing default concurrency is 24; the proposed new starting benchmark is 12 HTTP requests with a per-domain limit.

Do not assume the present script already follows relevant service/project links or produces the complete structured fit/signal packet. Keyword/specialty order and legacy trade files must not redefine the broadened ICP.

## Required next behaviour

Cache first; discover real relevant links from the homepage; fetch at most four useful pages with early exit. Collect qualification, contacts and commercially relevant signals together. Parallel only for failed/insufficient essential pages. One fallback attempt; no automatic Firecrawl cascade. Preserve text, URLs, retrieval time and failures.

No prefilter based only on business name/category may remove mixed electrical/plumbing/AC installers. Ordinary single split-system installers qualify. Missing email goes to the phone/call route where fit and phone are evidenced.

Verification is a separate step: Million Verifier through Apify, valid/provider-ok only for normal email. The old instruction to keep catch-all/unknown/error for sending is superseded. Keep raw provider outcomes and retain non-valid prospects for their appropriate route.

Only run extraction for an authorised job. Documentation changes do not constitute a new sourcing run or a tested implementation.
