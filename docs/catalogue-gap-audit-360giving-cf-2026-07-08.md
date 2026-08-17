# Catalogue gap audit — 360Giving net-new community foundations (2026-07-08)

**Origin:** diff of the 360Giving Data Registry (291 publishers) against the GT catalogue
(472 active / 840 all funders). Community foundations were the highest-value net-new slice:
on-audience, open-application, place-based, each running multiple live programmes.

**Source tag:** `admin:gap-audit-360giving-cf-2026-07-08`
**State:** all staged `is_active=false`, `pipeline_state='tagged'` → **Needs Review** (awaiting per-row activation).
**Research:** each CF's own grants pages, July 2026 (4 parallel agents). One row per CF = its
headline open programme; descriptions flag other funds, restrictions, and caveats.

## Staged (14) — verify then activate per row

| Funder | Headline programme | Amount | Deadline | Geo | Confidence |
|---|---|---|---|---|---|
| Bedfordshire & Luton CF | Community Grants (area funds) | ≤ £10k | rolling (per-fund) | Bedfordshire | high |
| Cambridgeshire CF | Warwick & Dominey (General) | ~£4k (≤ £5k) | **1 Aug 2026** panel | Cambridgeshire | high |
| Cheshire CF | Open Grants Programme | ≤ £10k (£15k w/ salary) | rounds — confirm | Cheshire | medium |
| Cornwall CF | Resilience Fund | £500–£10k (£30k partners) | **22 Jul 2026** | Cornwall + IoS | high |
| Cumbria CF | Community Grants (regional cttees) | varies | quarterly (Main **7 Aug**) | Cumbria | high |
| Devon CF | Community Grants (register + Pencarrie) | ~£5k avg | register / rolling | Devon, Plymouth, Torbay | medium |
| Dorset CF | Community Wellbeing & Mental Health Fund | ≤ £5k/1yr, £20k/2yr | **6 Aug 2026** | Dorset (+BCP) | high |
| Herefordshire CF | Community Grants (Community Chest) | not published | rolling / EOI | Herefordshire | medium |
| Hertfordshire CF | HCF Grants | ≤ £10k | **24 Aug 2026** (£5k rolling) | Hertfordshire | high |
| Leicestershire & Rutland CF | Making Local Life Better Fund | ≤ £3k | quarterly (next **11 Aug**) | Leics & Rutland | high |
| Lincolnshire CF | Evan Cornish Grassroots Fund | ≤ £6k (portfolio to £10k) | **1 Oct 2026** | Greater Lincolnshire | high |
| Norfolk CF | Grants for Groups (rotating roster) | £1k–£10k | rotates — verify per fund | Norfolk | medium |
| Oxfordshire CF | Step Change Fund | £10k–£50k | **4 Sep 2026** | Oxfordshire | high |
| Wiltshire & Swindon CF | Community Grants | ≤ £6k/yr × 3yr | quarterly (next **17 Jul**) | Wilts & Swindon | high |

**Verify-first flags before activation:**
- **Imminent deadlines** — Wiltshire (17 Jul), Cornwall (22 Jul), Norfolk (mid-July funds). All are
  rolling/quarterly so still valid after the date, but the specific round may lapse.
- **Not general-purpose** — Dorset row is a *mental-health/wellbeing* themed fund; Oxfordshire is the
  *£10k–£50k transformational* fund (its small-org funds reopen autumn/winter 2026); Devon is
  *register-to-be-matched* + a narrow children/YP fund.
- **Geography/deprivation gates** — Cheshire (most-deprived wards), Cambridgeshire/Lincolnshire/Norfolk
  (several place-restricted windfarm/solar sub-funds).
- **Amounts null** where the CF publishes none (Cumbria, Herefordshire) — enrichment can't invent them.

## Held — NOT staged (currently closed to community groups)

- **Barking & Dagenham Giving** — participatory funder; GROW round closed Apr 2026, "Give it a Go" paused.
  Revisit when a round reopens (GROW runs to 2027, Esmée-backed).
- **Community Foundation for Calderdale** — only the SWEF individual-enterprise fund is open; general
  community grant rounds are "upcoming" (between rounds). Revisit next round.

## Dropped from the net-new list (not genuine net-new funders)

- **UK Community Foundations** — national umbrella/membership body, not a place-based grantmaker.
- **Community Foundation North East** — rebrand of *Community Foundation Tyne & Wear and Northumberland*,
  which GT already holds active. **Action: rename the existing funder, don't add.**

## Cataloguing convention for community foundations

Codified 2026-07-08 (agreed with Paul). Apply to all future CF additions.

**1. One consolidated row per CF — never one row per donor fund.**
A CF like Cumbria runs 150+ donor funds; most are hyper-restricted (parishes, windfarm radii,
named-donor criteria), churn every round, and are reached through a single application front door.
Splitting them would bury the catalogue in thousands of ephemeral, low-match rows. Keep the many-fund
detail *inside* the one row's `funder_brief` / description, not as separate entries.

**2. Title + deadline framing — specific-fund-if-dated, else rolling front door:**
- **Specific dated fund open now** → title the row after that fund, set its `deadline`, and let its
  theme/amount/eligibility drive matching (e.g. Cornwall → *Resilience Fund* (22 Jul); Dorset →
  *Mental Health Fund* (6 Aug); Oxfordshire → *Step Change* (4 Sep); Lincolnshire → *Evan Cornish* (1 Oct)).
  A named, dated, themed row is concrete, matchable, and surfaces on the deadlines page.
- **Genuine always-open front door** (rolling / quarterly-panel / register-to-match) → generic title
  ("— Community Grants"), `is_rolling=true`, `deadline=null`; put the next-panel cadence in the
  description, not in `deadline`. Panel *decision* dates are **not** application close dates — don't
  set them as the row deadline (they read as stale/overdue once passed while the fund is still open).

**3. Enricher caveats to correct on review (per-row, before Save):**
- "Detect all" tends to grab a panel date as a hard `deadline` and un-tick Rolling on always-open
  funds → re-tick **Rolling** on the front-door CFs.
- AI enrich may broaden `location_tag` from the county to a region (e.g. "Leicestershire & Rutland" →
  "Midlands"), which over-matches orgs that can't apply → keep the **county-level** tag.
- **Any CF row titled after one headline fund** → Detect-all anchors the *whole* brief on that single
  fund and mis-sets `open_status` (register-to-match/EOI funders like Devon/Herefordshire → `closed`;
  open-application CFs with a dated flagship like Cornwall/Lincolnshire → `between_rounds`), hiding the
  CF's broader portfolio and skewing matching to one theme. Fix at the **funder** level: broaden
  `what_they_fund` / `who_can_apply` / `typical_award` to the CF's full range and set
  `open_status='open'` if any fund is open — while keeping the dated headline fund in the title/deadline.
  Exception: leave a brief narrow when the row genuinely *is* a single open fund (Dorset mental-health,
  Oxfordshire Step Change — the only fund open there right now). (Devon, Cornwall, Lincolnshire corrected
  2026-07-08; check every CF's brief after enriching.)

**4. Upkeep:** fund-specific rows go stale when the named fund closes — refresh to the next open fund
or flip to generic rolling. A periodic re-enrich / deadline sweep should catch these.
