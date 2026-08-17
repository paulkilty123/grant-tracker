# Grant Link Checker Report
**Date:** 13 April 2026  
**Source:** `scraped_grants` Supabase table (live database query)  
**Total active grants with apply_url:** 408  

> **Note:** Live HTTP checking was not possible in this automated run — network egress to external domains is blocked in the scheduled-task environment. This report draws on the **database's own url_status field**, which was last updated by the app's built-in URL validator on **13 April 2026 at 03:31 UTC** (today). Results reflect the freshest available machine-checked data.

---

## ✅ Summary

| Status | Count |
|--------|-------|
| ✅ OK (verified by app's URL checker) | 402 |
| ⚠️ Unchecked (newly added, not yet deep-checked) | 6 |
| ❌ Dead (active grants) | 0 |
| **Total active grants with apply_url** | **408** |

**No broken links detected among active grants.** All 315 grants with `url_status = 'dead'` are marked `is_active = false` (already deactivated).

---

## ⚠️ Items Requiring Attention

### 1. Newly Added — Unchecked URLs with Quality Issues (6 grants)

These 6 grants were added to the database today but have not yet passed a full deep-check. Several have quality scores of 0, suggesting the URL may point to a generic page rather than the specific grant.

| Grant | Funder | URL | Quality Score | Issues |
|-------|--------|-----|---------------|--------|
| Charity IT Association (CITA) — Tech Volunteers | Charity IT Association | https://www.cita.org.uk/ | 0 | funder_missing, weak_title_match |
| Henry Smith Foundation Grants | Henry Smith Foundation | https://henrysmith.foundation/grants/ | 0 | funder_missing, no_title_match |
| TechSoup UK Donated & Discounted Technology | TechSoup UK | https://www.techsoup.uk/product-catalog | 0 | funder_missing, no_title_match, very_short_page |
| Key Fund Flexible Finance | Key Fund | https://thekeyfund.co.uk/funding/ | 5 | no_title_match |
| Boost Fund | Corra Foundation | https://www.corra.scot/grants/boost-fund/ | 20 | no_title_match |
| NCVO Learning & Development Programmes | NCVO | https://www.ncvo.org.uk/training-events/ | 25 | weak_title_match |

**Action:** Visit each URL to confirm it reaches the correct grant page. For scores of 0, the URL validator couldn't find funder-related content — the page may be behind a login, require JS to render, or simply be a homepage rather than a specific grant page.

---

### 2. Grant Closed Indicator Detected (2 grants)

The app's content scanner flagged these active grants as potentially closed based on page text:

| Grant | Funder | URL | Quality Score |
|-------|--------|-----|---------------|
| Clore Social Leadership Programme | Clore Social Leadership | https://cloresocialleadership.org.uk/ | 70 |
| Archived Funds | Creative Scotland | https://www.creativescotland.com/funding/archive | 70 |

**Action:** The Creative Scotland "Archived Funds" entry almost certainly should be removed or re-categorised — linking to an archive page is not a useful grant entry. For Clore Social Leadership, verify whether the programme is still open for applications.

---

### 3. Network Error on Fetch (1 grant)

| Grant | Funder | URL | Quality Score |
|-------|--------|-----|---------------|
| Pilgrim Trust — Preservation & Scholarship | The Pilgrim Trust | https://thepilgrimtrust.org.uk/grants/ | 25 |

The URL validator encountered a network error (not a 404) when checking this link — the page may intermittently block scrapers. The grant remains marked `ok` but with a low quality score. Worth a manual check.

---

### 4. Low-Quality Active Grants (quality score < 40, status = ok)

| Grant | Funder | URL | Score | Issues |
|-------|--------|-----|-------|--------|
| Supporting capital projects within Gateshead | Community Foundation Tyne & Wear | https://www.communityfoundation.org.uk/grants/supporting-capital-projects-within-gateshead/ | 35 | funder_missing |
| Social Enterprise Accelerator | Nottingham Trent University & NCVS | https://www.ntu.ac.uk/business-and-employers/financial-and-funded-support/social-enterprise-accelerator | 35 | funder_missing |
| Google.org — Nonprofit Tech Grants & Ad Credits | Google.org | https://www.google.com/nonprofits/ | 35 | funder_missing |
| Supporting Newcastle based orgs to engage residents in culture | Community Foundation Tyne & Wear | https://www.communityfoundation.org.uk/grants/supporting-newcastle-based-arts-organisations-to-impact-the-health-and-wellbeing-of-newcastle-city-residents/ | 35 | funder_missing |

These are status `ok` but scored low because the funder name wasn't found in the page HTML. This is likely a false positive (large sites often have the funder name only in the footer or JS-rendered content). No immediate action required, but worth reviewing if users report issues.

---

## 📋 Carry-Forward from Previous Report (6 April 2026)

The following issues identified in the last report remain unresolved. They don't show as broken in the database but may warrant manual fixes:

1. **HTTP (non-HTTPS) URL** — Lankelly Chase Foundation uses `http://lankellychase.org.uk`. Update to `https://`.
2. **Truncated press release URL** — Unreasonable Impact UK links to a Barclays press release URL that appears cut off mid-word.
3. **M&S Plan A page** — M&S Community Energy Fund links to M&S's old "Plan A" sustainability page, which may have been retired.
4. **www vs non-www inconsistencies** — Multiple organisations have grants stored with both `www.` and non-`www.` URL forms. These should be standardised.
5. **UKRI time-limited opportunity pages** — 113 UKRI grants link to specific funding round pages that expire when rounds close. These will go dead silently.
6. **Homepage-only URLs** — ~70 grants link to an organisation's root domain with no specific grant path.

---

## ✅ No Action Needed

402 active grants have been verified by the app's URL checker today and are returning good responses. These do not need manual review.

---

*Report generated automatically by the grant-link-checker scheduled task.*
