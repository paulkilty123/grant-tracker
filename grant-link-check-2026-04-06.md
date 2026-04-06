# Grant Link Checker Report
**Date:** 6 April 2026
**Total grants with URLs:** 780
**Unique domains:** 279

> **Note:** Live HTTP checking was not possible in this automated run — network egress is blocked in the scheduled-task environment. This report is based on **static analysis** of all 780 URLs, flagging structural issues, domain inconsistencies, and patterns associated with stale/broken links. A manual spot-check or browser-based verification is recommended for the flagged items.

---

## ⚠️ Issues Found

### 1. HTTP (not HTTPS) — 1 URL

| Grant | URL |
|-------|-----|
| Lankelly Chase Foundation — Grants Programme | `http://lankellychase.org.uk` |

**Recommendation:** Update to `https://lankellychase.org.uk`. This should redirect correctly, but should be stored as HTTPS.

---

### 2. Press Release / Ephemeral Page Links — 2 URLs

These URLs point to press releases or time-specific pages that may be removed or go stale:

| Grant | URL | Issue |
|-------|-----|-------|
| Unreasonable Impact UK & Europe | `https://home.barclays/news/press-releases/2025/03/unreasonable-impact-announces-new-roster-of-ventures-for-the-202/` | Press release page; URL appears truncated (ends mid-word). Verify it loads and consider linking to the programme page instead. |
| M&S Community Energy Fund | `https://corporate.marksandspencer.com/sustainability/plan-a-our-sustainability-plan` | "Plan A" was M&S's old sustainability brand — may have been retired or redirected. Verify this page still exists. |

---

### 3. Duplicate Domain Inconsistencies — Organisations with Mixed www/non-www URLs

These organisations have grants stored under both `www.domain.com` and `domain.com` forms — one variant may redirect incorrectly or be inconsistent. Standardise to one canonical URL:

| Organisation | Domains Used | Grants Affected |
|---|---|---|
| AB Charitable Trust | `abcharitabletrust.org.uk` + `www.abcharitabletrust.org.uk` | 3 |
| Access — Foundation for Social Investment | `access-socialinvestment.org.uk` + `www.access-socialinvestment.org.uk` | 2 |
| Asda Foundation | `asdafoundation.org` + `www.asdafoundation.org` | 4 |
| Esmée Fairbairn Foundation | `esmeefairbairn.org.uk` + `www.esmeefairbairn.org.uk` | 6 |
| Football Foundation / FA Foundation | `footballfoundation.org.uk` + `www.footballfoundation.org.uk` | 4 |
| Foundation Scotland | `foundationscotland.org.uk` + `www.foundationscotland.org.uk` | 16 |
| The Linbury Trust | `linburytrust.org.uk` + `www.linburytrust.org.uk` | 2 |
| London Community Foundation | `londoncf.org.uk` + `www.londoncf.org.uk` | 13 |
| Social Investment Business | `sibgroup.org.uk` + `www.sibgroup.org.uk` | 7 |
| The Pilgrim Trust | `thepilgrimtrust.org.uk` + `www.thepilgrimtrust.org.uk` | 4 |
| Tudor Trust | `tudortrust.org.uk` + `www.tudortrust.org.uk` | 2 |
| Woodward Charitable Trust | `woodwardcharitabletrust.org.uk` + `www.woodwardcharitabletrust.org.uk` | 2 |

---

### 4. Same Organisation, Different Domains — Verify Which is Canonical

| Organisation | Domains Used | Grants | Notes |
|---|---|---|---|
| Heart of England Community Foundation | `heartofenglandcf.co.uk` + `heartofenglandcf.org` | 19 | Two separate domains — check which is current |
| Santander Foundation | `santanderfoundation.org.uk` + `www.santandersustainability.co.uk` | 2 | Two completely different domains for what may be the same funder |
| Screwfix Foundation | `screwfixfoundation.com` + `screwfix.com/landingpage/screwfix-foundation` | 2 | Different domains; `/landingpage/` path may redirect |
| Aviva | `aviva.co.uk` + `avivafoundation.org.uk` + `communitiesfund.avivafoundation.org.uk` | 4 | Three domains for Aviva-related grants — verify each is current |

---

### 5. TNL Community Fund — Specific Programme URLs to Monitor

These 21 grants link to specific programme pages on `tnlcommunityfund.org.uk`. Some programmes close periodically and pages are removed or redirected:

- The Solidarity Fund
- Community Action
- Sustainable Steps Wales - Egin Grants
- National Lottery Awards for All England – Environment
- Strengthening Communities
- Young Start - Small Grants
- Supporting Great Ideas
- Fairer Life Chances
- National Lottery Awards for All Northern Ireland
- Strengthening Organisations
- Climate Action Fund - Food Systems
- Dormant Assets for All
- National Lottery Awards for All England / Scotland / Wales
- Reaching Communities England
- Supporting Change - Carers
- Young Start - Main Grants
- The UK Fund
- People and Places
- Scottish Land Fund

**Recommendation:** Periodically verify these are still live open programmes, as TNL rotates its funding programmes.

---

### 6. UKRI Opportunity Pages — 113 Time-Limited URLs

All 113 `ukri.org/opportunity/` URLs point to specific funding opportunity pages that **go offline when the funding round closes**. Examples currently flagged:

- ADOPT facilitator support grant: round 7
- Future Leaders Fellowships: round 11
- Early career fellowships in cultural and heritage institutions: 2025 (invite only)
- Women in Innovation Awards 2025/26 (hosted on `iuk-business-connect.org.uk`)

**Recommendation:** UKRI opportunity pages expire. Consider linking to the funder's general funding page as a fallback, or add a "deadline" field so stale entries can be filtered out.

---

### 7. Homepage-Only URLs (No Specific Grant Page) — 70 Grants

70 grants simply link to an organisation's homepage (`/` path) with no specific grant or apply page. These won't break, but are low-quality for applicants. Examples:

- Lankelly Chase Foundation — `http://lankellychase.org.uk`
- 10,000 Small Businesses (Goldman Sachs) — `https://www.goldmansachs.com`
- Black Seed VC — `https://www.blackseedvc.co.uk`
- Impact Hub Programmes — `https://london.impacthub.net/`
- Social Firms Wales — `https://www.socialfirmswales.co.uk/`
- Diesis Network — `https://www.diesis.coop/`

**Recommendation:** Update these to link directly to the grant/application page where one exists.

---

## ✅ Likely OK (no live check performed, but structurally sound)

The following large, stable sources account for the majority of URLs and are very unlikely to have broken links:

| Source | Grants | Notes |
|---|---|---|
| `www.find-government-grants.service.gov.uk` | 92 | UK Government grants service |
| `www.ukri.org` | 117 | UK Research & Innovation (though individual opportunity pages expire) |
| `www.tnlcommunityfund.org.uk` | 24 | National Lottery Community Fund |
| `www.communityfoundation.org.uk` | 17 | Community Foundation Network |
| `communityfoundationwales.org.uk` | 35 | Community Foundation Wales |
| `www.somersetcf.org.uk` | 14 | Somerset Community Foundation |
| `londoncf.org.uk` | 13 | London Community Foundation |
| `foundationscotland.org.uk` | 16 | Foundation Scotland |
| `www.heritagefund.org.uk` | 5 | National Lottery Heritage Fund |
| `www.gov.uk` | 7 | UK Government |

---

## Summary

| Category | Count |
|---|---|
| HTTP (not HTTPS) | 1 |
| Truncated/ephemeral page links | 2 |
| Duplicate domain variants | 12 organisations / ~65 grants |
| Same org, conflicting domains | 4 organisations |
| TNL programme pages (monitor) | 21 |
| UKRI time-limited opportunities | 113 |
| Homepage-only (no grant path) | 70 |
| **Total grants checked** | **780** |

**Next recommended action:** Run this check with a browser-capable environment (network egress enabled) to do live HTTP status verification on all 780 URLs, particularly the flagged items above.
