# Grant Link Check Report — 18 May 2026

## Summary

| Category | Count |
|---|---|
| Total grants in database | 1,213 |
| Unique apply URLs | 1,145 |
| ✅ OK (active) | 544 |
| ❌ Dead (already deactivated) | 469 |
| ⚠️ Unchecked (active) | 17 |
| ✅ OK (inactive) | 23 |
| ⚠️ Unchecked (inactive) | 160 |

**Good news:** All 469 dead URLs have already been deactivated (`is_active = false`), so no broken links are being shown to users. The existing `validate-urls` job is doing its job.

---

## Action Items

### 1. Unchecked Active Grants (17) — Need URL validation

These grants are live but their URLs haven't been verified yet. They all have low quality scores, suggesting the validator couldn't reach them or the page content didn't match expectations.

| Grant | Funder | Quality Score | Issues |
|---|---|---|---|
| Better Brighton & Hove Fund — Ward Pots 2026 | Brighton & Hove City Council | 0 | funder_missing, no_title_match, very_short_page |
| Boost Fund | Corra Foundation | 20 | no_title_match |
| Charity IT Association (CITA) — Tech Volunteers | Charity IT Association | 0 | funder_missing, weak_title_match |
| Community Grant Programme | National Grid Electricity Transmission | 10 | funder_missing |
| Digital funding for small charities | Fat Beehive Foundation | 0 | funder_missing, no_title_match, very_short_page |
| East Midlands Airport Community Fund Grant | East Midlands Airport | 0 | funder_missing, no_title_match |
| Hackney — Core Grants | Hackney Council | 0 | funder_missing, no_title_match, very_short_page |
| Hackney — Project Innovation Fund | Hackney Council | 0 | funder_missing, no_title_match, very_short_page |
| Henry Smith Foundation Grants | Henry Smith Foundation | 0 | funder_missing, no_title_match |
| John Lyon's Charity Grants | John Lyon's Charity | 5 | no_title_match |
| Key Fund Flexible Finance | Key Fund | 5 | no_title_match |
| NCVO Learning & Development Programmes | NCVO | 25 | weak_title_match |
| Nesta Innovation Challenges — Prize Competitions | Nesta | 5 | funder_missing, generic_page |
| Southwark Council — Common Purpose Grants | Southwark Council | 0 | funder_missing, no_title_match, very_short_page |
| SWEF Enterprise Fund | East End Community Foundation | 5 | no_title_match |
| TechSoup UK Donated & Discounted Technology | TechSoup UK | 0 | funder_missing, no_title_match, very_short_page |
| Well-being Grants for Young People | East End Community Foundation | 5 | no_title_match |

**Recommendation:** Run the URL validator against these 17 specifically, or manually spot-check them. Many have `very_short_page` issues, likely because the pages are JavaScript-rendered and the server-side fetch gets an empty shell.

---

### 2. Active Grants with Network Errors (quality_score = 25)

These are marked `ok` but the quality check hit a network error — they may or may not actually work for users in a browser.

| Grant | Funder | URL |
|---|---|---|
| CAF Venturesome Impact Fund | CAF Venturesome | https://www.cafonline.org/services-for-charities/funding-for-charities/social-investment |
| Ford of Britain Trust — Large Grants | Ford of Britain Trust | https://www.ford.co.uk/experience-ford/news/ford-britain-trust |
| Ford of Britain Trust — Small Grants | Ford of Britain Trust | https://www.ford.co.uk/experience-ford/news/ford-britain-trust |
| Gordon Fraser Charitable Trust | Gordon Fraser Charitable Trust | https://www.gfct.org.uk/ |

**Recommendation:** Worth a manual browser check — if the validator hit network errors, these pages may be intermittently down or blocking automated requests.

---

### 3. Non-Standard URLs (active)

| Grant | URL | Issue |
|---|---|---|
| The Paley Trust | `mailto:PaleyTrust@outlook.com` | Not a web URL — this is an email address stored as an apply_url |
| The Dodgson Foundation | `http://dodgson.org.uk/` | HTTP only (no HTTPS) |
| Inman Charity | `http://www.inmancharity.org/` | HTTP only (no HTTPS) |
| Charles Hayward Foundation — Small Grants | `http://www.charleshaywardfoundation.org.uk/older-people/` | HTTP only (no HTTPS) |

**Recommendations:**
- **Paley Trust:** Move the email to a contact field or prefix with a note that applications are by email only. Storing `mailto:` as an `apply_url` will break if the UI tries to fetch or validate it as a web page.
- **HTTP URLs:** Try upgrading to `https://` — most of these sites likely support HTTPS now. If not, they still work but may show browser security warnings.

---

### 4. Recurring Crawl Errors (5 sources failing daily)

These crawl sources have been returning 403 errors consistently and remain unresolved:

| Source | Failing URL | Error |
|---|---|---|
| aviva_foundation | https://www.avivafoundation.org.uk/ | 403 |
| crowdfunder_match | https://www.crowdfunder.co.uk/funds | 403 |
| arts_council_wales | https://arts.wales/funding/ | 403 |
| arts_council | https://www.artscouncil.org.uk/our-open-funds | 403 |
| gla | https://www.london.gov.uk/programmes-strategies/search-funding | 403 |

**Note:** These are crawl source errors (the scraper can't access them), not necessarily broken apply_urls. The 403s suggest these sites block automated requests. The grants themselves may still have valid apply_urls pointing to different pages on the same domains.

---

## Overall Assessment

The grant database is in **good health**. The automated URL validation system is working correctly — dead links are being caught and deactivated. The main areas to address are:

1. **17 unchecked active grants** that need their URLs verified (likely JS-rendered pages)
2. **4 network-error grants** worth a manual browser check
3. **1 mailto: URL** that should be handled differently
4. **3 HTTP URLs** that should be upgraded to HTTPS
5. **5 crawl sources** consistently returning 403 — may need user-agent or header adjustments
