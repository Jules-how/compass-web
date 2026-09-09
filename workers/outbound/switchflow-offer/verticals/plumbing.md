# Plumbing & Gas Vertical Spec

Trade flag: `--trade plumber` `--trade plumbing`
Campaign trade noun: `plumbing` / `plumbing and gas`
Identity: `plumb|gasfit|\bgas\b`
Slogan shops: `i should be your plumber`

## 1. Maps query
- **Search terms** (city goes in `locationQueries`, never in the term): `plumbing contractors`
- **Maps Categories**: `plumber`, `gas fitter`, `drainage service`

## 2. Specialty Target Keywords (Scraper & Opener)
- `hot water`, `solar hot water`, `heat pump`, `burst pipes`, `leak detection`, `gas fitting`, `gas fitter`, `blocked drains`, `pipe relining`, `tap repairs`, `toilet replacement`

## 3. Qualification & High-Ticket Book-Now Focus
- **Pass (Book-Now)**: Burst water mains, no hot water emergencies, sewer backups, gas leak detection and repair, urgent residential callouts.
- **Walk**: Pure civil stormwater civil engineering, large subdivision pipe laying, water-filter retail storefronts.
- **Mail**: `{job_type}` = burst pipe or blocked drain jobs. `{extra_jobs}` = 10 to 14. Fill fails on the $400 mid Search unit. Guide if they leak 13+. Mix down if carry is thinner. Capture is the profit lever.

## 4. Licensing & Script Handoff Boundaries
- Dual plumbing + gas is treated as one shop.
- Never invent quotes, plumbing advice, or gas safety instructions over the bot.
- On gas smell reports, instruct caller on gas meter shutoff and immediate human transfer.

## 5. Anti-ICP Walks Specific to Plumbing
- Retail plumbing supply stores (Reece, Tradelink, Bexley Supplies).
- Pure water filtration equipment stores.
- 60+ van enterprise operations (e.g. Selected, Majestic, Tunnel Vision, Plumbco).

## 6. Shop-sign tails
Not specialties. Strip from the trading name only.
- Words: `plumbing`, `plumbers`, `plumber`, `plumb`
- Phrases: `Gas Fitting`, `Gasfitting`, `Hot Water`, `Leak Detection`, `Plumbing Solutions`, `Plumbing Services`, `Plumbing Professionals`, `Plumbing Contractors`, `Plumbing Contractor`, `Plumber Services`, `Drainage Specialists`, `Drainage`, `Drains`, `Gas`, `Plumbing and Electrical`, `Plumbing & Electrical`, `Plumbing and Draining`, `Plumbing and Drainage`, `Plumbing and Roofing`

## 7. Casual name aliases
- `\bWPS\b` -> `WPS`
- `\bSQIRT\b` -> `SQIRT`
- `\bALL\s+KIND\b` -> `All Kind`
- `\bPLUMD\s+IN\b` -> `Plumd`
- `\bPLATINUM\s+PRO\b` -> `Platinum`
- `\bI\s+SHOULD\s+BE\s+YOUR\s+PLUMBER\b` -> `I Should Be Your Plumber`
- `\bTHE\s+CLEAN\s+PLUMBER\b` -> `The Clean Plumber`
