# Grant Link Checker Report — 4 May 2026

## Summary

- **Total grants with URLs:** 1,107
- **Unique URLs:** 1,043
- **Live URL check:** ⚠️ Not possible — workspace network restrictions block external fetches. Issues below were identified through data analysis.

---

## ❌ Likely Broken / Stale Links

### Expired UKRI "Nov 2023" Grants (6 entries)
These grants reference a November 2023 call window and are almost certainly closed/removed by now:

| Grant Title | URL |
|---|---|
| EPSRC discipline hopping in ICT, Nov 2023: responsive mode | https://www.ukri.org/opportunity/epsrc-discipline-hopping-in-ict-nov-2023-responsive-mode/ |
| EPSRC standard research grant, Nov 2023: responsive mode | https://www.ukri.org/opportunity/epsrc-standard-research-grant-nov-2023-responsive-mode/ |
| EPSRC overseas travel grant: Nov 2023: responsive mode | https://www.ukri.org/opportunity/epsrc-overseas-travel-grant-nov-2023-responsive-mode/ |
| EPSRC network grant: Nov 2023: responsive mode | https://www.ukri.org/opportunity/epsrc-network-grant-nov-2023-responsive-mode/ |
| EPSRC new investigator award: Nov 2023: responsive mode | https://www.ukri.org/opportunity/epsrc-new-investigator-award-nov-2023-responsive-mode/ |
| EPSRC working with overseas scientists: Nov 2023: responsive mode | https://www.ukri.org/opportunity/epsrc-working-with-overseas-scientists-nov-2023-responsive-mode/ |

**Suggested action:** Remove these or check UKRI for current equivalents.

### Non-Grant Entries (should be removed from database)

| Grant Title | URL | Issue |
|---|---|---|
| Archived Funds | https://www.creativescotland.com/funding/archive | Points to an archive page, not an active grant |
| Funding and Development Programme Deadlines | https://www.creativescotland.com/funding/funding-deadlines | A deadlines listing page, not a grant |
| Tell us about your project | https://forms.office.com/Pages/ResponsePage.aspx?id=... | Generic Office form with no funder context |

---

## ⚠️ Data Quality Issues

### Duplicate Grants with Different URLs (15+ pairs found)
The same grant title appears with different URLs, suggesting duplicates scraped from multiple sources. Key examples:

| Grant Title | URL 1 | URL 2 |
|---|---|---|
| SSE Fellowship Programme | www.the-sse.org/courses/the-fellowship-programme/ | www.sse.org.uk/programmes/apply-for-a-programme |
| Allen Lane Foundation | allenlane.org.uk/applying-for-funding/ | www.allenlane.org.uk/apply/ |
| Drapers' Charitable Fund | thedrapers.co.uk/ | thedrapers.co.uk/drapers-charitable-fund/ |
| Green Roots Fund | www.london.gov.uk/GreenRoots | (long detailed path) |
| UK Shared Prosperity Fund | gov.uk/guidance/uk-shared-prosperity-fund | gov.uk/government/publications/uk-shared-prosperity-fund-prospectus |
| Comic Relief & Sainsbury's HAF | forevermanchester.com/fund/comic-relief-sainsburys-haf/ | forevermanchester.com/fund/nourish-the-nation/ |

Many UKRI grants also appear as duplicates — once on `ukri.org` and once on `find-government-grants.service.gov.uk`.

**Suggested action:** Deduplicate, keeping the most specific application URL.

### Domain Inconsistencies
- **Heart of England CF** has grants split across two domains: `heartofenglandcf.org` (10 grants) and `heartofenglandcf.co.uk` (9 grants). One of these may be an old domain that redirects.
- **SSE (School for Social Entrepreneurs)** uses both `the-sse.org` (9 grants) and `sse.org.uk` (1 grant). SSE rebranded; check which is current.

### Generic Landing Pages Instead of Application URLs
Several grants point to a funder's homepage or general grants page rather than a specific application page. The top offenders:

| Generic URL | # of grants pointing here |
|---|---|
| heartofenglandcf.co.uk/grants/ | 9 |
| sussexcommunityfoundation.org/grants/how-to-apply/additional-grants/ | 7 |
| eastendcf.org/grants/ | 4 |
| eastendcf.org/hackney/ | 3 |

These aren't "broken" but are low-quality links — users land on a general page and have to find the specific grant themselves.

---

## ✅ Positive Findings

- All 1,043 unique URLs are well-formed (start with `https://`)
- No malformed, empty, or non-HTTP URLs found
- The top domains (ukri.org, gov.uk, community foundations) are established institutions unlikely to have widespread link rot

---

## Recommendation

1. **Delete or archive** the 6 expired UKRI Nov 2023 grants and the 3 non-grant entries
2. **Deduplicate** the 15+ pairs of same-title grants with different URLs
3. **Investigate the SSE domain** — `the-sse.org` vs `sse.org.uk` — and standardise
4. **Enable network access** in Claude Settings → Capabilities to allow live URL checking in future runs of this task. Without it, 404s and silently-dead pages cannot be detected.
