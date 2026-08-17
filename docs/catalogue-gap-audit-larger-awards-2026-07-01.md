# Catalogue Gap Audit — Larger Awards (£5k floor, £10k+ priority)

**Date:** 2026-07-01
**Author:** Claude (discovery + staging pass)
**Status:** REVIEW DOC — nothing here is live. Every candidate is staged for Paul's sign-off before any activation.
**Floor:** hard £5,000 (max award); priority ≥£10,000. **Scope:** grants, social investment, in-kind, programmes.

---

## How to read this

Three parts:

1. **Gap analysis** — where the live catalogue is thin at £10k+, from our own signals (query log, capture layer) + catalogue distribution. Useful strategy input regardless of which candidates make it in.
2. **Reframes** — things that *look* like gaps in the query log but aren't (search-index bugs; already-covered areas). Don't spend sourcing effort here.
3. **Candidates** — new/refresh opportunities grouped by the gap they fill, audit-grade fields, confidence notes, flags.

**Verification standard applied to every candidate:** every field taken from the funder's own page (aggregators used only to discover, never to source a field); numerics carry a verbatim source quote; anything unconfirmable is left `null` and flagged — never inferred; no false floors ("up to £X" → `max=X, min=null`); past-deadline excluded; invite-only flagged.

---

## Part 1 — Gap analysis (the strategy bit)

### 1a. Live-catalogue distribution by funding type × amount band

Live surface = `is_active = true` (~645 rows). Band = `amount_max`.

| Funding type | undisclosed | <£5k | £5–10k | £10–50k | £50–100k | £100k+ | **≥£10k total** |
|---|---|---|---|---|---|---|---|
| grant | 75 | 85 | 61 | 145 | 29 | 118 | **292** |
| in_kind | 30 | 20 | 0 | 2 | 1 | 0 | **3** |
| investment | 9 | 0 | 0 | 4 | 2 | 25 | **31** |
| programme | 16 | 7 | 1 | 8 | 2 | 4 | **14** |
| blended | 0 | 0 | 0 | 0 | 1 | 0 | **1** |

**Read-outs — the thinnest bands at £10k+:**

- **In-kind ≥£10k is essentially empty (3 rows).** We hold ~53 in-kind rows, but almost all are either undisclosed value (30) or sub-£5k (20). We have the *providers* (Pilotlight, Cranfield, Reach, Media Trust, Pro Bono Economics, Salesforce, Google.org, Microsoft) but almost none carry a **quantified ≥£10k value**, so they never surface when a user filters or sorts by size. This is **half a data-quality problem (enrich existing rows with a defensible £-value) and half a sourcing problem** (a few genuinely large, valuable in-kind programmes we don't hold).
- **Social investment is bimodal.** 25 of 31 investment rows at £10k+ sit at **£100k+**; only **6 rows** cover the entire **£10k–£100k** band. The small-ticket end (£5k–£50k) is actually fine (Key Fund from £5k, Fredericks £1k–£50k, CAF Venturesome), so the visible hole is **£50k–£250k mid-market social investment**, and **regional** SI (see 1c).
- **Programme/accelerator ≥£10k is thin (14 rows)** — relevant because this is the format most social-enterprise cash-plus-support offers take (the SEUK/Expert Impact audience).
- **~130 live rows (~20%) have no amount at all.** They can't be filtered or size-sorted, so from a "larger awards" lens they're invisible. A re-enrichment pass on undisclosed-amount rows would surface more £10k+ inventory than any amount of new sourcing.

### 1b. Sector depth at £10k+ (canonical sectors)

Healthy at £10k+: community (102), social welfare (59), environment (44), health (44), social change (35), young people (35), arts (35), poverty (33), education (30).

**Thin at £10k+ (count of ≥£10k rows):** digital skills **3**, homelessness **3**, food **6**, technology **7**, advocacy **8**, financial inclusion **8**, older people **9**, **social enterprise 10**, housing **12**, sport **13**, disability **16**, mental health **16**.

**SEUK / Expert Impact config sectors (social_innovation, social_economy, social enterprise):** `social_innovation` = **2 rows**, `social_economy` = **2 rows (0 at £10k+)**, `social enterprise` = 19 (10 at £10k+). For a live trial positioned on social innovation / social economy, this is the thinnest config in the catalogue — though note some of it is under-tagging, not pure absence (matcher relies on tags; see [[project_classifier_under_tagging_v1_dependency]]).

### 1c. Regional depth at £10k+

The catalogue is heavily **UK-national** (339 rows / 180 at £10k+). Nation/region coverage at £10k+:

| Region | rows | ≥£10k | note |
|---|---|---|---|
| UK-wide | 339 | 180 | dominant |
| Scotland | 42 | 24 | healthy (recent push) |
| England-wide | 29 | 20 | ok |
| London | 30 | 19 | moderate — could be deeper for a London-anchored SEUK trial |
| Wales | 17 | 12 | few *distinct Welsh funders* behind the count |
| Yorkshire | 12 | **4** | thin at £10k+ |
| Northern Ireland | 11 | **6** | thin; and social-investment-in-NI returns **0** (see below) |
| North East England | 3 | 2 | very thin |
| Greater Manchester | 3 | **0** | very thin at £10k+ |
| North West England | 1 | 1 | very thin |
| Midlands (E+W+combined) | ~3 | ~1 | very thin |

**Priority regional gaps at £10k+:** Northern Ireland, Wales (distinct funders), Greater Manchester / North West, Yorkshire, the Midlands.

### 1d. Demand signals from our own capture layer

- **`mcp_query_log`** (17 MCP searches) and **`events.search_executed`** (83 app searches) both show explicit misses. Genuine gap signals:
  - **"social investment for food cooperatives in Northern Ireland"** (investment + food + NI) → **0 results.** Regional SI + co-op/community-shares gap.
  - **"youth employment"** → **0 results** (twice). We *had* Youth Futures Foundation but it's archived (see Part 3).
  - **in-kind / mentoring for a small creative CIC (Brighton)** → only 3, "mixed" quality. Confirms the in-kind-depth gap.
  - MCP funding-type-only browses returned "low" quality for `in_kind` (34), `investment` (39), `programme` (59) — the non-grant types are both thin and under-enriched.
- **Dismissals:** `grant_interactions` = 189 dismissed vs 71 saved vs 5 applied; `events.opportunity_dismissed` = 131 (reason almost always null). High dismissal rate is consistent with match-quality/enrichment issues rather than a specific catalogue hole — not actionable as a *sourcing* signal without reasons.

---

## Part 2 — Reframes (look like gaps, aren't — don't source here)

1. **Named-funder zero-results are a search-index bug, not catalogue absence.** The zero/low-result searches for `triodos`, `fredericks`, `natwest social`, `caf`, `esme fairbairn`, `gatsby`, `glasshouse trust`, `linbury trust`, `headley trust`, `mark leonard trust`, `tedworth`, `paul hamlyn`, `co-op` are **all funders we already hold.** The tell: the *same* query (e.g. `triodos`, `gatsby`, `glasshouse trust`) returns 0 on one run and 8–9 on another. → route to search/matcher, **not** catalogue sourcing.
2. **`sector=[arts]` returns 0** while `creative`/`culture` return plenty (arts = 50 rows). Taxonomy slug mismatch, not a funding gap. → classifier/taxonomy alias.
3. **Social investment is broadly covered.** Key Fund, Big Issue Invest, Resonance, Social Investment Business, Social Investment Scotland, SWIG Finance, CAF Venturesome, Charity Bank, Fredericks, Triodos, Access Foundation, Ethex, Black Seed are all live. Sourcing effort here has low marginal value — only the **mid-band (£50k–£250k)** and **regional SI (NI, Wales)** are worth topping up.

---

## Part 3 — Refresh & reactivate (already in the DB, archived — not truly "missing")

While de-duplicating I found several **major £10k+ civil-society funders that already exist in `scraped_grants` but are archived (`is_active=false`), most with `url_status='dead'`.** These are the single highest-ROI slice: they were catalogued once, they're squarely on-audience, and reactivating them (with a refreshed live URL + current programme details) beats net-new discovery. This is the [[feedback_false_negative_archive_asymmetry]] pattern — additions pass a review gate, archivals don't, so good rows get silently retired.

> Caveat: most of the archived-≥£10k population is UKRI / research-council / gov.uk mega-grants (£1m–£50m) that were **correctly** retired (expired rounds, not our audience). The archive isn't wholesale broken — it's specifically the civil-society funders below that got caught in it.

| Funder | Archived programmes / bands | Why reactivate | Priority |
|---|---|---|---|
| **Lloyds Bank Foundation for England & Wales** | Invest / Enhance / Enable / Specialist, £25k–£240k; unrestricted multi-year + development support | Major on-audience funder, IVAR Open&Trusting; wholly absent from live surface; url dead | **HIGH** |
| **Youth Futures Foundation** | Development & Impact Grants £30k–£800k | Directly answers the "youth employment" 0-result; url dead | **HIGH** |
| **UnLtd** | Awards for Social Entrepreneurs £8k–£18k (+support) | Flagship social-entrepreneur funder; central to the SEUK/Expert Impact trial; some rows still `url_status=ok` | **HIGH (SEUK)** |
| **Nationwide** | Community Grants £10k–£50k | On-audience community grants; url dead | MED |
| **Power to Change** | Community Business Fund £5k–£300k | Community-business funder; verify current (much-narrowed) programmes before reactivating | MED |
| Unity Trust Bank; Social & Sustainable Capital (SASC); Social Finance | SI, £m-scale | Mid/large SI; verify current products | LOW–MED |

The four research strands below re-verify the current programme details for these (so the refresh uses live figures), and are noted as **REFRESH** rather than **NEW** in Part 4.

---

## Part 4 — Candidates (staged for review)

Grouped by the gap each fills. `NEW` = not in catalogue. `REFRESH` = exists in DB but archived/stale. Every field is quoted from the funder's own page; anything not confirmable there is `null` + flagged. Items marked ✅ were independently re-fetched by me (not just the research agent).

> **STAGED 2026-07-02:** the **18 net-new funders below are now in Needs Review** (`is_active=false`, `pipeline_state='captured'`, `source='admin:gap-audit-2026-07-01'`). Find them in Grant Manager → Captured / Needs Review. Each is parked (`needs_intervention_reason` set) so the auto-enrich cron won't overwrite the funder-verified figures before you review. Nothing is live. To bulk-remove if unwanted: `delete from scraped_grants where source='admin:gap-audit-2026-07-01'`.
> **NOT staged:** the 5 `REACTIVATE` rows (Lloyds, Youth Futures, UnLtd, Nationwide, Power to Change) already exist as archived rows — un-archiving them is a separate step, offered but not done. The 2 `HOLD` items (Aziz, Constance Travis) and the unverified Nationwide Community Grants figures were deliberately excluded.

Sources: 4 verification-strict research strands (national omissions, regional depth, in-kind & SE programmes, IVAR Open & Trusting cross-reference), reconciled against a full SQL dedup of held funders. Several agent suggestions were dropped as **already-held-and-current** (The Fore £45k, Clothworkers' Open Grants, Triangle Trust Young Women & Girls, Youth Music Trailblazer, Greggs Community Action Fund, James Tudor) — see reframes.

### Gap A — Northern Ireland, incl. social investment `[priority — named 0-result: "social investment for food cooperatives in NI"]`

**A1. Ulster Community Investment Trust (UCIT) / Community Finance Ireland** — `NEW` ✅
- URL: https://www.communityfinanceireland.com/
- Type: **social investment (loan)** · amount_min **£10,000**, amount_max **£600,000** — *"Our loans range from €/£10k–600k."* (NI DfC Social Capital scheme caps £500k)
- Deadline: **rolling / open** — *"Complete our loan application form … a local Client Relationship Manager will be in touch within 48 hours."*
- Eligibility: *"Community projects, including charities, social enterprises and faith-based initiatives"* + *"All sports clubs"*; *"don't lend to private businesses or individuals."* All-island lender, Belfast office (NI 028 9031 5003).
- invite_only: false · Confidence: **HIGH** (loan range + NI operation + eligibility independently re-confirmed) · Flags: loan not grant; €/£ dual-currency.

**A2. Halifax Foundation for Northern Ireland — COLLABORATE** — `NEW`
- URL: https://www.halifaxfoundationni.org/collaborate/
- Type: grant · amount_min null, amount_max **£20,000** — *"Maximum Award - £20,000"*
- Deadline: **rolling, open** — *"COLLABORATE is a rolling programme and will close when the budget is reached."* (oversubscribed 2025; mandatory pre-application meeting)
- Eligibility: *"2 or more registered charities with an individual income of £500,000 or less"*, CCNI/UK-regulator registered. Charities only.
- invite_only: false · Confidence: **HIGH** (agent re-verified) · Flags: budget-capped rolling close; sibling COMMUNITY FLEX open but max unpublished (leave null); IGNITE excluded (max £2k, under floor).

### Gap B — Wales £10k+ (grants + social investment) `[thin region]`

**B1. Moondance Foundation — General Funding** — `NEW` ✅
- URL: https://moondancefoundation.org.uk/funding-faqs
- Type: grant · amount_min **£500**, amount_max **null (undisclosed; clearly £10k+)** — *"Grants are awarded from £500 upwards …"*; own annual report *"details all grants made over £20,000."* No false ceiling.
- Deadline: rolling/open (no date stated) — active "General Funding Application" form; *"currently accepting applications."*
- Eligibility: *"registered charities, constituted community groups, social enterprises, Community Interest Organisations (CIOs), Community Interest Companies (CICs) and other not-for-profit organisations"*; *"organisations in Wales"*; min 2 years operating.
- invite_only: false · Confidence: **HIGH** (independently re-confirmed) · Flags: amount_max null — do not set a ceiling; broad eligibility = strong SEUK fit.

**B2. WCVA — Social Investment Cymru: Communities Investment Fund (CIF)** — `NEW`
- URL: https://wcva.cymru/funding/social-investment-cymru/communities-investment-fund/
- Type: **social investment (loan)** · amount_min **£50,000**, amount_max **£250,000** — *"CIF loans are available from £50,000 to £250,000"* (guide ~7%)
- Deadline: rolling, open (preliminary-discussion model)
- Eligibility: social businesses in Wales expanding / growing income / buying an asset.
- invite_only: false · Confidence: **HIGH** · Flags: loan (repayable). Sibling Wales funds also open: **CALF** up to £300,000 (asset purchase), **Micro Loan Fund** £1k–£50k — add as a set if desired.

**B3. Simon Gibson Charitable Trust** — `NEW` `currently closed`
- URL: https://sgctrust.org.uk/about-us/
- Type: grant · amount_min null, amount_max **£20,000** — *"The typical grant is between £5,000 to £10,000 up to a maximum of £20,000."*
- Deadline: **closed; reopens 1 Jan 2027** — *"only applications submitted between 1st January and 31st March each year will be considered."*
- Eligibility: registered charities; own site says South Wales. (CIC eligibility claimed by aggregators only — unconfirmed.)
- invite_only: false · Confidence: **HIGH** on facts · Flags: currently closed; org-type beyond charities unconfirmed.

**B4. The Waterloo Foundation — Wales Fund** — `REFRESH` (held row has null amounts)
- URL: https://waterloofoundation.org.uk/walesapplicationguidelines/
- Held row "Waterloo Foundation Grant Programmes" is active but amount_min/max = null → enrich with: amount_max **~£30,000** — *"Grants made under our Wales funding programmes typically range from £5k – £30k"* (typical, not a hard cap; ≤25% of income). Rolling, open.
- Eligibility: Wales-focused (Unpaid Carers / Equity in Education / Pathways out of Poverty); org-type not verbatim on page (flag).
- Confidence: MED-HIGH · Flags: "typically" not a hard max; org-type eligibility unconfirmed.

### Gap C — North of England / Manchester / Merseyside / Cumbria `[very thin at £10k+]`

**C1. Sir John Fisher Foundation — Main Grants** — `NEW`
- URL: https://sirjohnfisherfoundation.org.uk/our-funding/
- Type: grant · amount_min null, amount_max **£20,000** — *"The maximum request to apply for is £20,000."* (majority £5k–£15k)
- Deadline: **2026-09-01** — *"1st September (for decision in November)"* (also 1 March). Open now.
- Eligibility: *"registered charities (including CIOs) or social enterprises (Community Interest Companies or Companies Limited by Guarantee with an appropriate asset lock and mission lock)"*; **Barrow-in-Furness area / South Cumbria**.
- invite_only: false · Confidence: **MED-HIGH** — agent read verbatim quotes; my independent re-fetch was HTTP-403 blocked → **re-confirm on funder site before activating** · Flags: narrow geography; no capital/events; annual pot reducing.

**C2. John Moores Foundation — Grants for Merseyside** — `NEW`
- URL: https://www.jmf.org.uk/grants-for-merseyside/
- Type: grant · amount_min null, amount_max **null (funder states no limit)** — *"We don't have a limit for the amount requested…"*; *"The average grant in Merseyside in 2024/25 was £6,810"*; up to 3 yrs salary/running costs.
- Deadline: rolling — *"JMF accepts applications at any time of the year."* Open.
- Eligibility: income cap — *"Applicants with an annual income over £750,000 are unlikely to be considered"*; non-charities/CICs eligible if *"charitable in law."* Merseyside + Halton/Skelmersdale/Ellesmere Port.
- invite_only: false · Confidence: **HIGH** · Flags: amount_max deliberately null (no false ceiling); average award ~£6.8k so clears the £5k floor but not obviously £10k+.

**C3. Granada Foundation** — `NEW`
- URL: https://granadafoundation.org/how-to-apply/
- Type: grant · amount_min null, amount_max **£10,000** — *"maximum grant is £10k"*
- Deadline: **2026-10-01** (for the November round). Open.
- Eligibility: charitable / not-for-profit orgs; North West England; arts, sciences, heritage.
- invite_only: false · Confidence: **HIGH** · Flags: max exactly £10k (at, not above, the priority threshold).

**C4. Oglesby Charitable Trust** — `NEW` `invite-only`
- URL: https://oglesbycharitabletrust.org.uk/our-approach/
- Type: grant · amounts **null** — *"under £5,000 to over £1m"* is a span, not a programme range.
- Deadline: n/a — invite-only: *"an invitation-only funder."*
- Eligibility: North of England; arts/education/environment/health/social/medical.
- invite_only: **TRUE** · Confidence: MED · Flags: no unsolicited applications — list marked, do not present as openly applicable.

**C5. Zochonis Charitable Trust** — `NEW`
- URL: https://www.zochonischaritabletrust.com/how-to-apply/
- Type: grant · amounts **null (undisclosed on own site; £10k+ per CC accounts)**
- Deadline: rolling, open. Eligibility: registered charities only; Greater Manchester emphasis.
- invite_only: false · Confidence: MED · Flags: amount null → flag; verify £10k+ from Charity Commission before pricing.

### Gap D — Yorkshire / Midlands `[very thin at £10k+]`

**D1. Sir James Reckitt Charity — General grants** — `NEW`
- URL: https://www.thesirjamesreckittcharity.org.uk/apply
- Type: grant · amount_min **£1,000**, amount_max **£10,000** — *"Grants generally fall within the range of between £1,000 and £10,000"* (larger considered)
- Deadline: twice-yearly — *"twice-yearly meetings in May and November"*, apply *"at least a month in advance"* (next ≈ early Oct 2026). Open.
- Eligibility: registered charities *"associated with Hull and East Yorkshire, or the Society of Friends (Quakers)"*; 2-yr repeat rule.
- invite_only: false · Confidence: **HIGH** · Flags: max £10k (at threshold); Hull/E-Yorks or Quakers.

**D2. Edward Cadbury Charitable Trust — Main grants** — `NEW`
- URL: https://www.edwardcadburytrust.org.uk/applying-for-grants
- Type: grant · amount_min **£5,000**, amount_max **£20,000** — *"The Trust usually makes grants which vary in size between £5,000 and £20,000."* (exceptional to £500k)
- Deadline: year-round / no fixed close — *"assessed within a three-month timescale."* Open.
- Eligibility: *"registered charity"*; benefit *"the local Midlands community."*
- invite_only: false · Confidence: **HIGH** (agent re-verified) · Flags: none.

### Gap E — In-kind support with quantifiable ≥£10k value `[near-empty in catalogue: 3 rows]`

**E1. Google Ad Grants** — `NEW` (distinct product; "Google.org" held row is different)
- URL: https://www.google.com/grants/ · eligibility https://support.google.com/nonprofits/answer/3215869
- Type: **in_kind (free search advertising)** · value **up to $10,000/month** — *"Each qualifying nonprofit has access to up to $10,000 per month in search ads shown on Google.com"* (≈£95k/yr; GBP is a conversion, not on their page → store as approximate)
- Deadline: rolling / ongoing. Open.
- Eligibility: registered charity (Charity Commission / NICC / OSCR); **excludes** government, hospitals/healthcare, schools/universities; needs Google for Nonprofits account.
- invite_only: false · Confidence: **HIGH** · Flags: value in USD; **charities only** (excludes CICs → limits SEUK fit); verify vs held "Google.org" row.

**E2. Weston Charity Awards** — `NEW` `currently closed`
- URL: https://garfieldweston.org/applications-are-now-open-for-the-annual-weston-charity-awards/
- Type: **in_kind + cash** · in-kind value **~£16,000** — *"Pilotlight 360 … valued at around £16,000"*; plus *"£6,500 in unrestricted funding"*; *"a package of support worth over £22,000."*
- Deadline: **closed (was 9 Jan 2026); next expected autumn 2026** — *"open until 5pm on Friday 9 January 2026."*
- Eligibility: *"registered charities working with beneficiaries in the North of England, the Midlands, and Wales"* in Community/Welfare/Youth/Environment; income *"less than £5 million"*; ≥1 paid FT leader.
- invite_only: false · Confidence: HIGH on figures, MED on timing · Flags: closed; **charities only** (no CICs); no London; distinct branded programme (Garfield Weston + Pilotlight held separately).

### Gap F — Social-enterprise programmes with ≥£10k cash `[SEUK/Expert Impact config]`

**F1. Do It Now Now — Innovate Now with Wellcome** — `NEW` `niche`
- URL: https://www.doitnownow.com/innovate-now-with-wellcome
- Type: programme (multi-year grant + capacity building) · amount_min **£13,000**, amount_max **£48,000** — *"£13,000–£48,000 in multi-year funding"* (tiers £13k/2yr → £48k/3yr by income)
- Deadline: **Round 2 opens 2026-09-07, closes 2026-11-27** — *"Round 2: opens 7 Sep 2026 - 27 Nov 2026."* (Round 1 closed.)
- Eligibility: registered charities / CICs / social enterprises / limited companies / unincorporated; income £0–£150k; UK; *"over 50% of the leadership … must identify as Black"*; focus = research careers of Black/Mixed-Black-heritage people.
- invite_only: false · Confidence: **HIGH** · Flags: **niche** (Black-led + Black-researcher focus) — tag tightly; opens Sept 2026. (See also UnLtd in Reactivate — open now, broad SE fit.)

### Gap G — National justice / human rights `[fills the space Lankelly Chase is vacating]`

**G1. The Legal Education Foundation — Strengthening Justice Fund** — `NEW` ✅
- URL: https://lef.org.uk/funding/our-funds
- Type: grant · amount_min **£50,000/yr**, amount_max **£100,000/yr** — *"£50,000 to £100,000 per year"* over *"3 to 5 years"*
- Deadline: **2026-09-17** — *"17 September 2026."* Open.
- Eligibility: orgs already using/shaping the law with communities; accountable to communities served; UK.
- invite_only: false · Confidence: **HIGH** (independently re-confirmed) · Flags: large multi-year — high-value.

**G2. The Legal Education Foundation — Emerging Justice Fund** — `NEW` ✅
- URL: https://lef.org.uk/funding/our-funds
- Type: grant · amount_max **£75,000/yr** — *"Up to £50,000 (up to 12 months); or £50,000 to £75,000 per year (up to 3 years)"* (no false floor)
- Deadline: no fixed date on page → treat as open/rolling; **open now**.
- Eligibility: *"'by and for' organisations"* centred on lived experience; seeking legal partnerships; UK.
- invite_only: false · Confidence: **HIGH** · Flags: pairs with G1 (same funder, two funds).

**G3. The Bromley Trust** — `NEW` `currently closed`
- URL: https://www.thebromleytrust.org.uk/our-approach/
- Type: grant (unrestricted, multi-year) · amount_min **£15,000/yr**, amount_max **£30,000/yr** — *"grants ranging from £15,000 to £30,000 per year."*
- Deadline: **closed (was 9 March 2026); next ~early 2027** — *"only have one grant round in 2026 … deadline … 9 March 2026."*
- Eligibility: specialist charities, income *"between £100,000 and £1.2m"*; UK; human rights / prison reform / refugees & sanctuary / environment.
- invite_only: false · Confidence: MED-HIGH · Flags: closed; also fills the known human-rights depth gap ([[project_freetibet_humanrights_gap_2026-06-25]]).

### Reactivate / refresh — held but archived, on-audience, ≥£10k (see Part 3)

These are **not new** — they exist in `scraped_grants` but are `is_active=false` (mostly `url_status='dead'`). The research strands re-verified current details so a refresh uses live figures.

- **R1. Lloyds Bank Foundation for England & Wales** — `REFRESH` HIGH. Model: unrestricted multi-year, *"grants of up to £75,000 … over three years"* (£25k/yr). Own site: *"Our next open funding round will launch in July 2026 … focused on … a Home that's a Good Place to Live."* Between rounds now (imminent) → watch for the July round, then reactivate with live per-grant figures (currently unpublished; leave amounts flagged until posted). IVAR Open&Trusting.
- **R2. UnLtd — Awards for Social Entrepreneurs** — `REACTIVATE` HIGH (SEUK). *"Up to £8,000"* (Starting Up) / *"Up to £18,000"* (Scaling Up) + support; window *"1 Jul 2026 … – 31 Aug 2026,"* **open now**. Some existing rows already `url_status=ok`. Award goes to the **individual founder** (tag accordingly). Best broad-eligibility SE fit for the trial — reactivate promptly.
- **R3. Youth Futures Foundation** — `REFRESH` MED. Archived; themed delivery rounds £30k–£800k; directly answers the "youth employment = 0" signal — but **narrow** (England, ≥£250k income, RCT delivery) and rounds currently closed. Reactivate as a known funder; flag amounts null (unit-cost model) + closed.
- **R4. Nationwide Community Grants** — `REFRESH` MED, **unverified**. Archived row £10k–£50k (housing-focused). Provider site (nationwidecommunitygrants.co.uk) blocked automated fetch 3× — **needs a manual browser check** before reactivating; do not trust third-party £10k–£50k on its own.
- **R5. Power to Change** — `REFRESH` LOW-MED. Archived community-business funder; programmes have narrowed — verify current offer on their site before reactivating.

### Hold — do not add yet

- **H1. The Aziz Foundation** (British-Muslim-community funder) — genuinely un-held, but org-grant amounts are **not confirmable on their own site** (org-grants page 404s; site foregrounds scholarships) and there is **no open application route** (contact-only). Hold until they publish an open org-grants page. Do not enter aggregator amounts.
- **H2. Constance Travis Community Endowment Fund** (via Northamptonshire CF) — verified £3,500–£10,000, deadline 2026-08-07, open — but it's a community-foundation sub-fund (dedup vs Northamptonshire CF) and max only reaches £10k. Better handled in a dedicated CF pass.

---

## Follow-up leads (verified-enough to chase, but not stageable this pass)

Strong ≥£10k funders that are **between rounds or invite-only** right now — catch on reopening:

- **Global's Make Some Noise** — national, *"up to £70,000"* over 24 months, charities £30k–£1m; EOI closed, *"expect to open again in Autumn 2026."*
- **Rosa** (UK women & girls) — Stand With Us Fund up to £28k **closed 22 June 2026**; priority to Scotland/Wales/NI. Fills women/girls + thin-nations gap.
- **Halifax Foundation NI — 40 INVEST (≤£40k) / EMPOWER (≤£20k)** — both closed, reopening 2026; catch alongside COLLABORATE (A2).
- **LandAid** — UK youth-homelessness (16–25), £5k–£40k; Young Futures Fund EOI closed 22 May 2026 — check next round.
- **Ernest Cook Trust — Outdoor Learning Leader Grant** — up to £20k/yr × 3 (national); main window closed, next ~Oct 2026.
- **Invite-only (exclude unless model changes):** Nationwide Foundation (*"not accepting unsolicited … applications"*), William Grant Foundation (Scotland, £10k–£50k typical), Impetus, Pears Foundation, The Roddick Foundation.

**Strategy note on the IVAR list:** 176 trust/foundation signatories, ~20 already held, ~156 not — but the genuinely-open-now, unsolicited, ≥£10k subset is small (most not-held names are London/place-based community foundations, City livery charities, or invite-only trusts). The best remaining IVAR yield is a **dedicated community-foundation pass** for thin regions (CF North East, CFs for Lancashire & Merseyside, Norfolk / Northants / Leicestershire & Rutland / Lincolnshire / Cornwall / Devon) — each distributes many sub-funds of varying size, so it needs its own session, not a row here.

**Verify-not-duplicate before any future add:** James Tudor Foundation (held — distinct from Tudor Trust), Joseph Rowntree Housing Trust (distinct from held JRF/JRCT), Co-op Foundation (held).

---

## Flags & data-quality asides (for your attention, not candidates)

- **Undisclosed-amount rows (~130 live).** Biggest lever for "larger awards" visibility is re-enriching these, not new sourcing. Many in-kind/investment rows almost certainly clear £10k but can't be filtered.
- **In-kind value enrichment.** Existing in-kind providers (Pilotlight, Cranfield, Google.org/Ad Grants, Microsoft, Media Trust) need a defensible £-value on the row to ever surface at ≥£10k.
- **`Yapp Charitable Trust`** live row shows `amount_max=3000` — Yapp caps at £3k/yr (under the £5k floor). Correct data, but worth knowing it will never satisfy a ≥£5k filter.
- **`The Access Group Foundation`** row is `is_active=true` but `pipeline_state='archived'` — inconsistent state, worth a look.
- **Archive asymmetry** (see Part 3) — periodic audit of archived on-audience funders is overdue; see [[project_catalogue_hygiene_backlog]].
