# Catalogue gap audit — major cities + national funders

**Date:** 12 June 2026. **Method:** SQL against the live catalogue (630 active published rows) + web verification of every recommended funder against its own site (not aggregators). Per the audit-honesty rule: counts are SQL-verified; yields are estimates and flagged as such.

**Headline:** the national trust/foundation layer is broader than expected (~420 distinct funders; most household names present). The real gap is **place**: city-specific coverage outside London is near zero, 15 of 32 London boroughs have nothing, and a handful of heavyweight nationals are missing. A verified sweep list below totals **~75–85 candidate rows**, realistically **~55–65 published after dedup and review**.

---

## 1. Catalogue state (SQL, 12 Jun 2026)

| State | Rows |
|---|---|
| Published + active (user-visible) | **630** |
| Published + inactive | 39 |
| Archived | 725 (9 of them still `is_active` — see §6) |
| Tagged + active | 2 |

By funding type (active published): grant 485 · programme 64 · investment 40 · in_kind 39 · stray types 2 (§6).

By location: UK-wide 319, Scotland 42, London 31 + ~25 borough-tagged, England 28, Wales 16, Sussex 14, NI 11, Yorkshire 11. Everything else is a long tail of ones and twos.

## 2. Gap one — major cities (the priority, per user base)

Rows mentioning each city anywhere (location_tag, prog city, title, description):

| City | Rows | Verified live infrastructure (12 Jun, funder-direct) |
|---|---|---|
| Birmingham | 6 | HoE CF Birmingham & Black Country Fund **closed til ~Sept** (reopen = capture moment); BVSC signpost page; council schemes commissioned-only. *Site blocks bots + bad TLS on .co.uk — known heart_of_england_cf issue.* |
| Sheffield | 3 | South Yorkshire CF already in catalogue; not re-verified this pass |
| Glasgow | 3 | Communities Fund 2026-29 closed (3-yr awards made). **Robertson Trust Wee Grants (≤£5k, rolling) — missing from catalogue, Scotland-wide, Glasgow HQ** |
| Leeds | 2 | Leeds CF mostly between rounds (microgrants deadline just passed); Funding Leeds council portal; "Stronger Leeds Fund" newly open per Forum Central (unverified) |
| Manchester | 2 | Forever Manchester thin right now (2 niche funds, 2 Jul deadline); **Our Manchester VCS Fund 2026-29 opens 7 Jul–1 Sep** (time the sweep to catch it); We Love MCR (2 rolling funds, open) |
| Bristol | 1 | **Quartet Express Grants (£500–£5k, year-round, open)**; **John James Bristol Foundation (rolling, monthly trustees, open)**; Bristol Impact Fund 3 small grants open ~Sept |
| Newcastle | 1 | Tyne & Wear CF already in catalogue but city funds missing: **Newcastle Culture Investment Fund (≤£12k)**, Reeds Grassroots (≤£3k); **Newcastle Fund (council, ≤£25k)**; **Sir James Knott Trust (~£2.3m/yr, rolling) — missing** |
| Nottingham | 1 | **Forever Notts live board: J N Derbyshire (≤£10k, 31 Aug), Thomas Farr (≤£5k, 20 Sep), + rolling funds**; council Crisis & Resilience Fund (to 2029) + Public Health grants |
| Edinburgh | 1 | **Council Community Grants Fund (≤£5k) open now, closes 29 Jun**; Foundation Scotland covers Scotland-wide (already 15 rows) |
| Liverpool | 0 | **CF Merseyside live board (5+ funds, mix of rolling + dated)**; **Steve Morgan Foundation Regional Grants (£250k–£500k/3yr) — own site says open year-round** (aggregators stale-say paused; verify on sweep); LCR CA fund delivered via CFM |
| Leicester | 0 | Not verified this pass — pair with Nottingham in an East Midlands batch |
| Cardiff | 0 | CF Wales mostly between rounds (Fund for Wales reopens ~autumn); council Cohesion small grants + Youth Led Grant open; Waterloo Foundation already catalogued |
| Belfast | 0 | CFNI thin (Randal small grants rolling); **Belfast CC Community Support Plan large grants (≤£60k/yr, open, runs to 2029)**; **Halifax Foundation NI (rolling, avg £3.2k, charities <£1m) — missing** |

**Recommendation:** one city sweep, ordered Liverpool → Bristol → Newcastle → Nottingham → Belfast → Edinburgh/Glasgow → Cardiff → Manchester (early Jul, to catch Our Manchester opening) → Birmingham (Sept reopen; stage now as between_rounds with next_open_date). Estimated candidates: **~45–55 rows**; several CF funds are tiny/hyperlocal — apply the funding.scot relevance filter and skip sub-£1k or single-postcode funds.

**Dedup traps found:** SWEF Enterprise Fund appears at 4 community foundations (Manchester, Merseyside, Notts, NI) → **one canonical row**, not four. Same for Lead the Change (multi-CF, all 2026 windows closed → skip or between_rounds).

**Skip-the-race:** funds closing within days (Merseyside CIF 16 Jun, Alice's WonderDance 19 Jun) — they'd expire on arrival; catch them next round. Edinburgh's 29 Jun is borderline-worth it.

## 3. Gap two — London boroughs

15 of 32 at zero: Barking & Dagenham, Bexley, Brent, Ealing, Enfield, Greenwich, Hammersmith & Fulham, Harrow, Havering, Hillingdon, Hounslow, Redbridge, Richmond, Sutton, Westminster. Nine more have exactly one row. (Improved from 20-at-zero in the May audit, but still the biggest single geographic hole given the user base skew.)

**Recommendation:** separate borough sweep using `grants.londoncouncils.gov.uk/borough/<slug>/` as the hub (per the May seed-list work) + each zero-borough's Giving scheme (Ealing: Ealing Together; Brent: Brent Giving etc. — verify per borough). Estimate **~20–30 candidates**; borough council funds churn fast, so favour the Giving schemes and place-based trusts over council one-offs.

## 4. Gap three — national funders

### Verified adds (funder site checked 12 Jun)

| Funder | Status | What to add |
|---|---|---|
| **Sport England — Movement Fund** | Open, rolling, £300–£15k | Replaces Small Grants. Catalogue has exactly 1 Sport England row — verify it IS the Movement Fund, else update. Big: £20m+/yr, sport sector is 52 grants with 0 programmes |
| **Masonic Charitable Foundation** | Open, rolling EOI | 2 rows: Small (£1k–£5k/yr, income £25k–£500k) + Large (£10k–£60k, income £500k–£5m). **Domain moved: freemasonscharity.org.uk** (mcf.org.uk redirects) |
| **The Mercers' Company** | Partially open | 2 rows: Church & Communities; Older People & Housing (London/Norfolk/Lincs/NE). Young People programme closed til 2029 — do not add |
| **Robertson Trust** | Open, rolling | Wee Grants ≤£5k + larger grants. Major Scotland gap despite 42 Scotland rows |
| **Sir James Knott Trust** | Open, rolling | ~£2.3m/yr, Tyne & Wear/Northumberland/Durham |
| **Steve Morgan Foundation** | Open per own site (aggregators say paused — re-verify on sweep) | Regional Grants £250k–£500k/3yr; Merseyside/N Wales/Cheshire; turnover £300k–£5m |
| **Halifax Foundation NI** | Open, rolling | Community grants, charities <£1m income |
| **John James Bristol Foundation** | Open, monthly trustees | Bristol-only, £500–£20k |
| **We Love MCR Charity** | Open, rolling | 2 funds, ≤£2k / ≤£5k |
| **SASC — Housing Pathways Fund** | Open (launched 10 Jun w/ Garfield Weston) | **Investment**, not grant: secured loans ~2%, £1–5m, supported housing. Feeds the housing×investment column |
| **Power to Change — Trading for Good** | Between rounds | Add with open_status='between_rounds'; match-trading ≤£4k, community businesses |
| **Cash4Clubs (Sported / Flutter)** | Between rounds (~Sept open) | £2k grants, community sport. Catalogue under Sported, NOT Made by Sport |
| **Mohn Westlake Foundation** | Semi-open (limited unsolicited slots, charities only) | Add with honest framing; large London youth funder |
| **Fair4All Finance** | Engagement-based | Only relevant to community-finance providers (credit unions/CDFIs) — add as investment only if the niche matters; low priority |

### Do-NOT-add list (equally load-bearing — these would have poisoned the sweep)

- **Foyle Foundation — closed permanently** (liquidation 9 Jun 2026). Not in catalogue; keep it out.
- **Made by Sport — wound up 2022.** Cash4Clubs lives on via Sported (above).
- **Tudor Trust — now invite-only** ("Change We Seek"; site says don't prepare proposals). **Catalogue has 1 active Tudor row — update it to invite-only or archive.** ← existing-row correction, do first
- **Berkeley Foundation — invite-only** except Resilience Fund rounds (currently closed). Stage as between_rounds at most.
- (From prior knowledge: Lankelly Chase winding down — keep out.)

### Worth checking in a second national pass (not verified this round)

Baily Thomas (learning disability), Dunhill Medical Trust (ageing — older_people has zero non-grant rows), Zochonis + Oglesby + Granada (Manchester-area trusts), Goldsmiths' Company Charity, Wates Foundation, Eveson Trust (West Mids), Colwinston + Ashley Family (Wales arts), Mackintosh Foundation (theatre — cohort skews theatre), Sport NI, Media Trust (in-kind), Jerwood Arts. Treat as the sweep's stretch list; verify each on its own site first.

## 5. Gap four — sector × type structural holes (SQL-verified)

- **young_people: 1 programme, 0 investment** across 63 grants — accelerators/leadership programmes for youth orgs exist (UK Youth, Centre for Youth Impact successors); worth a targeted programme sweep.
- **sport: 0 programmes** (52 grants) — Sported membership support is in-kind-shaped; Movement Fund helps the grant side.
- **disability: 0 programmes** (41 grants).
- **older_people: 18 grants, 0 programmes/investment/in-kind** — thinnest major beneficiary sector; Dunhill Medical + Mercers Older People row both help.
- **women: 0 grants tagged** yet Rosa (2 rows) and Smallwood exist in the funder list → **this is a tagging bug, not a sourcing gap** — the rows exist but aren't tagged `women`. Fold into the next batch re-classification, don't source.
- mental_health programmes now 5 (was 0 in the May memory) — improving, keep an eye.

## 6. Hygiene found in passing (small, not this sweep's job)

1. **9 archived-but-`is_active` rows** (Morrisons Foundation, Grocers' Charity, Steel Charitable Trust, etc.) — state contradiction; also the false-negative-archive-audit shape. One-line SQL to list; Paul decision per row.
2. **39 published-but-inactive** rows — likely fine (deactivated pending fixes) but worth a skim in the same pass.
3. **2 `tagged`+active rows** (Education Opportunity Foundation, Djanogly) — stuck mid-pipeline.
4. **2 stray funding_type values** (`blended_finance`, `support_programme`) — outside the 4-type taxonomy; re-type.
5. **MCF domain migration** — any future mcf.org.uk URLs must be freemasonscharity.org.uk.
6. **Heart of England CF blocks bots + serves bad TLS on .co.uk** — corroborates the standing heart_of_england_cf validator issue.

## 7. Recommended execution order

1. **Existing-row corrections (minutes):** Tudor → invite-only; verify the Sport England row is the Movement Fund; the 9 archived-active states.
2. **National adds, verified list (§4):** ~16–18 rows, all pre-verified above — highest confidence-per-row. Stage inactive → NR as always.
3. **City sweep (§2):** ~45–55 candidates. Time Manchester for early July (Our Manchester opens 7 Jul) and Birmingham for September (B&BC fund reopens). SQL title+funder dedup before drafting; SWEF/Lead-the-Change dedup traps noted above.
4. **London borough sweep (§3):** ~20–30 candidates via the London Councils hub.
5. **Stretch national list (§4c) + sector×type programme targets (§5)** as budget allows.
6. **Not sourcing work:** women-tag fix → batch re-classification queue; hygiene list → catalogue hygiene backlog.

Honest yield note: every prior estimate has overstated actionable yield. The §4 verified list is the exception (each row checked today); for §2–§3 assume a third of candidates die on dedup, relevance, or expired deadlines.

---

## 8. Execution log (same day)

**56 rows staged to Needs Review** (`source = 'gap_audit_2026-06-12'`, all `captured` + `is_active=false`):
- Batch 1 (24): §4 verified national adds + first city pass.
- Batch 2 (32): all 15 zero boroughs covered (22 rows) + stretch national list (10 rows).

**Corrections applied:** MCF stale "Later Life Inclusion" row archived (superseded; domain moved). Tudor was already correct (live row is invite-only "Change We Seek" — no change needed).

**Dedup skips:** Thamesmead Community Fund + Goldsmiths' Foundation Open Grants — archived rows already exist, no announced reopen; reactivate those rows when rounds reopen rather than adding new ones. Baily Thomas + Greenwich Peninsula have stale archived twins now superseded by fresh verified rows.

**New do-not-adds from sweep verification:** Oglesby Charitable Trust (invite-only), Wates Foundation + Wates Family Enterprise Trust (invite-only), Dunhill Medical Trust → rebranded Vivensa Foundation, community grants discontinued; Hillingdon Community Trust (charity dissolved — zombie website still ranks in search).

**Infrastructure notes for future sweeps:** the London Councils grants directory (grants.londoncouncils.gov.uk) is dead (TLS failure / 404) — borough sweeps must go via council + Giving-scheme sites. Westminster Foundation's site is a JS SPA (scrape via its JSON API). Richmond Parish Lands Charity renamed → Richmond Foundation. Eveson Trust site bot-blocks (manual browser check before activation, same as National Grid).

**Timing follow-ups:** Our Manchester VCS Fund opens 7 Jul; Heathrow CT round 2 opens 2 Jul; HoE CF Birmingham reopens ~Sept; Cash4Clubs ~Sept; Bristol Impact Fund 3 small grants ~Sept; Jerwood opens 3 Feb 2027.

## 9. Programme sweep (same day, second pass)

**18 rows staged** (`source = 'programme_sweep_2026-06-12'`): 11 programmes + 7 in-kind support/membership rows, targeting the §5 sector×type zeroes. Sport programmes 0→4-ish (Go! London, Coach Core, Buddle, Sported), older people 0→3 (UnLtd Healthy Ageing, Alzheimer's Society Accelerator, Vivensa Academy), disability +1 (Inclusion London PowerUp), creative +4 (Brave Futures, Innovate 2026, NE Create Growth, CultureStep), plus flagship capacity programmes (Pilotlight 360, Weston Charity Awards, Power Up London, Human Lending Library, Good Things NDIN, StreetGames).

**Already in the catalogue (good freshness signal):** Rosa Stand With Us, Young Women in Mind 2026-2028, Jack Petchey Achievement Award Scheme, Go! London Fund (grant), Trading for Good ×5.

**Mental health programmes: honest zero** — no open org-facing programme exists right now (everything found was individual-facing, grants-only or closed). Not a sourcing failure; revisit quarterly.

**Programme do-not-adds:** Year Here (closed permanently, 2022 final cohort), Ogunte (wound down → founder's coaching practice), Catalyst CIC (closed March 2026 — catalogue row already archived), Spring Impact (no open intakes), RSA Catalyst (Fellows-only + unverifiable), Ashoka (individual-facing), Zinc Venture Builder (founder-facing, stale pages), Heart of the City (business-facing), Lloyds Bank Foundation "Enhance" (no standalone open programme; their next housing-focus grant round opens July 2026).

**Flag for Paul (published-row update, admin-pin):** The Fore's autumn 2026 round — registration window 12pm 8 July to 12pm 15 July 2026, application deadline 7 Sep 2026, up to £45,000 unrestricted over 1-3 years. Existing published Fore row should be updated before the registration window.

**Time-sensitive in this batch:** Innovate 2026 closes 29 June; Brave Futures 13 July; UnLtd Healthy Ageing opens 1 July.
