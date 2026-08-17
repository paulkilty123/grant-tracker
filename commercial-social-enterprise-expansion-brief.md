# Grant Tracker — Commercial Social Enterprise Expansion Brief
*Session handoff document — April 2026*

---

## What This Session Should Accomplish

Grant Tracker's current product is built around the registered charity mental model — sectors defined by beneficiary groups, eligibility logic that defaults to charity/CIO structures, and a grant catalogue that skews heavily toward trust and foundation funding. This brief outlines the changes needed to genuinely serve commercial social enterprises (particularly Ltd by Shares and CICs with trading revenue) as a primary audience, not an afterthought.

The strategic framing: reposition from "grant finder" to **"Ineligibility Shield"** — the tool that tells a social enterprise founder immediately which funding they can actually access based on their legal structure, rather than letting them waste hours on applications they were never eligible for.

---

## 1. Sector Taxonomy Expansion (classify.ts)

### The Problem
The current 19-sector taxonomy is built around community service impact areas:
`health, mental_health, disability, older_people, sport, heritage, women, environment, creative, education, tech, refugees_migrants` etc.

This is a **beneficiary-group model** — it describes who you serve. A commercial social enterprise (sustainable fashion brand, ethical manufacturer, worker co-op, circular economy business) may not fit any of these cleanly. A sustainable fashion brand technically maps to `environment` but that misses the commercial trading context entirely.

### New Sectors to Add
Add these to `VALID_SECTORS` in `classify.ts` and update the classification prompt:

| Sector Key | Description |
|---|---|
| `social_economy` | Worker co-ops, community ownership, democratic enterprise, mutual structures |
| `sustainable_business` | Ethical trade, circular economy, sustainable supply chains, B-Corp adjacent |
| `ethical_finance` | Community finance, credit unions, CDFI, ethical banking |
| `social_innovation` | Tech-for-good, systems change, new social models, R&D with social purpose |
| `food_drink` | Community food, sustainable food systems, food poverty, ethical catering |
| `housing_property` | Community land trusts, affordable housing, co-housing, place-based regeneration |

### New Niche Tags to Add
Add within the `NICHE TAGS` section of the classify prompt:

**For `sustainable_business`:**
- `sustainable_fashion` — ethical/circular fashion and textiles
- `ethical_manufacturing` — social purpose manufacturing
- `circular_economy` — repair, reuse, waste reduction enterprises
- `fair_trade` — fair trade certified or aligned businesses

**For `social_economy`:**
- `worker_cooperative` — employee-owned or worker-controlled
- `community_shares` — community share offers, co-operative capital
- `social_franchise` — replicable social enterprise models
- `community_ownership` — community buyouts, asset transfers

**For `social_innovation`:**
- `tech_for_good` — technology with explicit social/environmental mission
- `impact_measurement` — organisations focused on measuring social value
- `systems_change` — advocacy + enterprise combined models

---

## 2. Structural Eligibility Logic (matching.ts)

### The Problem
The current structure mismatch cap logic penalises non-charity structures when they encounter charity-only grants. This is correct behaviour — but the inverse needs to work too. A **Ltd by Shares social enterprise** should be actively surfaced with funding that is *specifically accessible to them*, not just shown a list of grants with most marked ineligible.

### Changes Needed

**A. Explicit Ltd by Shares eligible funding types**
The matching logic needs a recognised pathway for `ltd_company` structure to:
- Social investment funds (SITR-eligible, blended finance)
- Innovate UK / UKRI grants (open to Ltd companies)
- SBRI (Small Business Research Initiative) programmes
- Growth/innovation grants from LEPs and devolved authorities
- Corporate accelerators and impact programmes
- Procurement/social value contracts *(future feature)*

**B. "Ineligibility Shield" signal**
When a user with a `ltd_company` or `cic_shares` structure views a `charity_only` grant, the UI should not just show a low match score — it should show an explicit message:
> *"This funder requires Registered Charity or CIO status. As a [CIC / Ltd company], you are not eligible to apply."*

This is more useful than a silent low score and is the core of the Ineligibility Shield positioning.

**C. Structure taxonomy review**
Audit the current eligible_structures values used in the database. Confirm the following are recognised and correctly handled:
- `registered_charity`
- `cio` (Charitable Incorporated Organisation)
- `cic_guarantee` (CIC Ltd by Guarantee)
- `cic_shares` (CIC Ltd by Shares)
- `ltd_company` (Ltd by Shares with social mission, no formal asset lock)
- `clg` (Company Limited by Guarantee, non-charity)
- `unincorporated`
- `cooperative` / `cbs` (Community Benefit Society)

If any of these are missing or inconsistently labelled in `scraped_grants`, run an audit and normalise.

---

## 3. Grant Catalogue Expansion

### New Funding Sources to Add
The current catalogue skews toward trust/foundation grants. To serve commercial social enterprises, add from these source types:

**Social Investment & Blended Finance**
- Access to Finance / British Business Bank social enterprise streams
- Social Investment Business (SIB) — Reach Fund, Connect Fund
- Big Issue Invest
- Key Fund (Northern England focus)
- Resonance — social property and community funds
- Bridges Fund Management programmes

**Innovation & R&D (open to Ltd companies)**
- Innovate UK Smart Grants
- SBRI (Small Business Research Initiative) — NHSE, DSIT, DESNZ programmes
- UKRI Transformative Technologies calls
- ICURe (Innovation to Commercialisation of University Research)

**Accelerators & Programmes**
- Bethnal Green Ventures (tech for good)
- Zinc VC (health and climate mission-led)
- Impact X (underrepresented founders)
- UnLtd Awards (individual social entrepreneurs)
- School for Social Entrepreneurs (SSE) programmes
- Wayra UK (Telefónica impact)

**Local & Regional**
- Local Enterprise Partnership (LEP) business grants — check which accept social enterprises
- Devolved authority funds: Welsh Government, Scottish Enterprise, Invest NI
- Community Wealth Fund allocations

### Tagging Protocol for New Grants
When adding grants from these sources, ensure `eligible_structures` is correctly set and does NOT default to `registered_charity` only. Many of these explicitly welcome Ltd companies and CICs.

---

## 4. Organisation Profile Updates (profile page)

### Current Profile Likely Captures
Org name, sector, location, org type, annual income, beneficiaries, description.

### Additional Fields Needed for Commercial Social Enterprises

| Field | Purpose |
|---|---|
| `legal_structure` | Explicit dropdown — Registered Charity, CIO, CIC (Guarantee), CIC (Shares), Ltd Company, CLG, Co-operative/CBS, Unincorporated |
| `has_asset_lock` | Boolean — critical for eligibility filtering; CIC shares do not have a full asset lock |
| `trading_revenue_pct` | What % of income is earned (vs grants/donations) — affects eligibility for some funds |
| `years_trading` | Some funds require minimum trading history |
| `investment_ready` | Boolean or stage — relevant for social investment matching |
| `accreditations` | B-Corp, Social Enterprise UK mark, Living Wage, Fair Trade etc. — affects corporate/procurement matching |

These fields should feed directly into the matching algorithm to refine results for commercial structures.

---

## 5. UI/Messaging Changes

### "Who It's For" Section
Update the four-category grid (per prior conversation) to ensure Social Enterprises & CICs card copy explicitly names the ineligibility problem:
> *"Most funding databases were built for registered charities. If you're a CIC or a trading social enterprise, you've felt that — results full of grants you can't apply for. Grant Tracker understands your structure and surfaces only what you can actually win."*

### Match Score Card
When displaying a grant match, add a visible **Eligibility Indicator** distinct from the match score:
- ✅ **Eligible** — your structure is explicitly listed or open
- ⚠️ **Check eligibility** — structure requirements unclear, verify before applying
- ❌ **Not eligible** — requires structure you don't have (with explanation)

This is the Ineligibility Shield made visible in the UI.

### Search/Filter Updates
Add a **"Show only grants I'm eligible for"** toggle on the search page, defaulted to ON. This is the single most useful filter for a Ltd by Shares founder and currently does not exist in a prominent form.

---

## 6. Procurement / Social Value (Future — Flag Only)

The Procurement Act 2026 creates new opportunities for social enterprises to access reserved public sector contracts. This is a meaningful tailwind but represents a significant product scope expansion (different data sources, different search logic, procurement-specific matching).

**Do not build this in this session.** Flag it for the roadmap as a Phase 2 feature once the grant/investment catalogue changes above are live. The foundation to build it on is:
- Legal structure data in org profiles (already needed above)
- Social Enterprise UK mark / accreditation fields (already needed above)
- A new `funding_type` value: `procurement` (the taxonomy already supports adding new types)

---

## Priority Order for This Session

1. Sector taxonomy expansion in `classify.ts` — add 6 new sectors + niche tags
2. Eligible structures audit — check current `scraped_grants` data for consistency
3. Ineligibility Shield UI signal — explicit message on structure-ineligible grants
4. Profile page — add `legal_structure`, `has_asset_lock`, `trading_revenue_pct` fields
5. "Show only eligible" toggle on search page
6. Begin adding social investment / innovation grant sources to catalogue

---

*This document was prepared as a session handoff. Read this file at the start of the session before making any changes.*
