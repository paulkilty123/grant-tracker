# Charity Excellence newsletter, 28 Aug 2026 — what can go in the catalogue

Assessment only. Nothing staged, nothing written. Every addition still goes
through the Needs Review gate ([[feedback_catalogue_addition_needs_review_gate]]).

70 named funding items were extracted from the newsletter and checked against
the catalogue (1,934 rows).

## How the check was done, and what it cannot tell you

Each candidate was matched against `title` and `funder` with a DB-side ILIKE.

**Two things went wrong on the first pass and are worth recording.**

1. The first run loaded rows with `.select()` and filtered in JS. PostgREST caps
   that at 1,000 rows, so it compared against 1,000 of 1,934 and reported 52
   missing. The corrected, DB-side run reported 41. Same anti-pattern as
   [[feedback_filter_pattern_anti]], and the wrong answer looked exactly like
   the right one.
2. Substring matching produces false "we have it" verdicts, which are the
   dangerous direction — they hide a gap. Found by reading the matched rows
   rather than trusting the count:
   - `arm community` matched eleven rows, all of them "…**F**arm Community Fund".
     Arm's fund is NOT in the catalogue.
   - `gambling` matched UKRI and DCMS research grants. Public Health Wales'
     voluntary sector fund is NOT in the catalogue.
   - `lner` matched "v-ul-**ner**-able". LNER is in fact present and correct,
     which the needle got right by accident.
   - `rewilding britain` matched Rewilding Britain's **Challenge** Fund
     (£50k–100k). The **Innovation** Fund (≤£15k) is a different programme.
   - `grassroots music` matched Music Venue Trust and Arts Council England.
     Oxford City Council's fund is NOT in the catalogue.

So the numbers below are name-matched, then eyeballed. They are good enough to
plan from and not good enough to bulk-insert from.

## 1. Already carried and correct — no action (18)

Morrisons Foundation (already Connecting Communities, capital, £20k max, so the
change the newsletter reports is already in), Anglian Water Thriving Communities,
One Stop Community Partnership, Postcode Society Trust (1 Sep), Armed Forces
Covenant Reveal and Respond (28 Oct), DCMS Connections Through Gaming (11 Sep),
Saracen's Norfolk Fund, Two Ridings York Community Fund (12 Oct), Wise Music
Foundation (31 Aug), J N Derbyshire (31 Aug), James Tudor mental health (11 Dec),
Groundwork Grassroots Grants (30 Sep), Leeds Digital Inclusion (1 Sep), LNER
(31 Aug, £1k–10k), UnLtd (rejected previously as individual awards — the
newsletter does not change that), Hackney Project Innovation (archived, round
closes 31 Aug), John Lyon's Charity (see §4), Suez (see §2).

## 2. Carried but stale or wrong — worth more than any addition (6)

These are live or near-live rows the newsletter proves are out of date. A wrong
row costs a user; a missing row costs an opportunity.

| Row | State now | What the newsletter says |
|---|---|---|
| Worthing Community Chest — Grants for Growth | inactive, deadline 30 Jun 26 | next round 1 Sep – 31 Oct |
| Calisen Impact Charitable Trust | inactive, deadline 30 Jun 26 | current deadline 30 Sep |
| SUEZ Communities Trust | archived, no deadline, no amounts | round closes 2 Sep, Lancashire zones added |
| HDH Wills 1965 Charitable Trust | live, no deadline, no amounts | £5k–20k, closes 31 Aug 26, annual round |
| Scops Arts Trust | live, no deadline, no amounts | round 3, 1 Sep – 15 Sep, up to £15k |
| Asda Foundation Foodbank Fundamentals | **live, no deadline** | next round opens Autumn 2026, no date |

The Asda row is the one to look at first. It is live with no deadline, which
reads to a user as open now, and the funder says the next round has not opened.

**Also found while checking:** `Hull Community Fund` (Two Ridings) exists TWICE,
both live, same URL, same deadline, same £250,000 ceiling. A straight duplicate.

## 3. New, in scope, and worth adding (30)

UK, organisation-applicable, with either a future deadline or a repeating cycle.
Grouped by how soon they matter.

**Closing within a week — add only if they can be reviewed in time**
- David Gibbons Foundation & Family Trust — East Devon, ~£2k, deadlines 31 Aug then 31 Oct
- Shears Foundation — £2,750–5,750, Tyne & Wear, Northumberland, Harrogate, York, Bradford, Greater Manchester; 31 Aug then 30 Nov
- Rosca Trust — Southend, Rochford, Castle Point; max £5k; 31 Aug then Dec
- Samuel Gardner Memorial Trust — music education and natural environment; end Aug then end Feb
- Joseph Holt Trailblazer Fund — £15k, one North West charity a year; end Aug / early Sep
- Young Camden Foundation Camley Street Community Fund — £2k–6k, Camden; 31 Aug
- Rewilding Britain **Innovation** Fund — ≤£15k, England, Wales, Scotland; 5 Sep
- SUEZ (see §2 — reactivate rather than add)

**September and October**
- United Way UK Give Local Grants — 30 × £1,500, income ≤£300k, 19 named areas; 24 Sep
- Public Health Wales Gambling Harms Voluntary Sector Grant Fund — up to £75k pa, Wales; opens 31 Aug, closes 19 Oct
- Electrical Safety First — up to £10k, UK; 27 Sep
- Thames Valley PCC Community Fund — up to £10k; 7–28 Sep
- Charlotte Aitken Trust — up to £30k, literature and creative arts; 30 Sep
- Thriplow Charitable Trust — £1k–5k, education and research; 25 Sep
- Keynsham Town Council CIL — up to £10k capital; 11 Sep
- Mayor of London Investment in Youth Clubs — one lead org per borough, £30m programme; 14 Sep
- Norfolk CF Connecting Older People Fund — up to £10k; 21 Sep
- Dorset CF BCP Homelessness Prevention Fund — up to £30k; opens 1 Sep, closes 1 Oct
- One Community Crisis and Resilience Fund — Kirklees, £2k–10k; 2 Oct
- Alice's WonderDance Foundation — up to £2k, Merseyside and Halton; 2 Oct
- Oxford City Council Grassroots Music Fund — £1k–5k; 12 Oct
- Wokingham United Charities Christmas Cheer — launches 1 Sep, grant size unknown
- Cambridgeshire Building Society Community Fund — £2,500–10,000, housing-related, 15 miles of a branch; 1 Nov

**Rolling or repeating, no urgency**
- Welsh Water Community Fund — up to £5k; rounds 1 Sep – 31 Oct, then Jan and May
- Action Together Magic Little Grants — up to £500, Oldham, Rochdale, Tameside
- Kelly Family Charitable Trust — already carried, see §1
- Charlotte Bonham Carter Trust — Hampshire; 1 Jan and 1 Sep
- Classical Association — UK schools, up to £5k; quarterly
- Cobtree Charity Trust — Maidstone and Kent, £1k–5k; quarterly
- Conundrum Charitable Trust — Scotland; 1 Mar and 1 Sep
- Tom Ap Rhys Pryce Memorial Trust — London under-24s, up to £5k; quarterly
- sportscotland Sport Facilities Fund — £10k–100k; 1 Apr and 1 Sep
- Meetings Industry Meeting Needs — requires an events-industry supporter, so
  gated in practice; add with that stated in `who_can_apply`, not hidden

## 4. Judgement calls

- **John Lyon's Charity Refurbishment Fund.** We carry "John Lyon's Charity
  Grants" as one row. The Refurbishment Fund is a distinct capital programme
  (up to £30k, North and West London, six rounds a year). Either a second row or
  a richer brief on the existing one. A second row is more matchable.
- **Cambridgeshire Community Foundation, nine funds.** The newsletter lists
  Anglian Water, Arm, D&J Lloyd, Dementia Carers, October, Olive and Jesse
  Palmer, Outlook, S2 Partnership, Tees Better Future and The Cambridge Building
  Society, all closing 1 Nov. [[project_cf_cataloguing_convention]] says one row
  per community foundation, not one per donor fund. We already carry eight Cambs
  CF rows and every one of them is inactive with a 1 Aug deadline. **The right
  move is a refresh of the front-door row to the 1 Nov round, not nine
  additions.** Norfolk and Two Ridings are catalogued per-fund, so the
  convention is already applied unevenly; worth settling once.
- **Believe Housing Community Development Fund.** EOI closed 24 Aug and the
  geography is four villages in Durham. Skip unless a next round is published.

## 5. Out of scope, with the reason (5)

- **Numun Fund** — Larger Majority World; explicitly excludes Global North groups.
- **Adidas Foundation Recovery Through Sport** — international, multi-country
  operations required, partner selection rather than open application, EOI closes 30 Aug.
- **EDF Powering Local Businesses** — small businesses, not non-profits.
- **St Ives BID Gold Card** — no application; recipients are voted for by member businesses.
- **Trafford Centre Foundation** — newly created, "applications will open soon",
  no application page yet. This is a **watchlist** entry, not a row.

## 6. Not funding, but arguably catalogue material

The newsletter's corporate items are in-kind support, which the catalogue does
carry as a distinct type ([[project_non_grant_breadth_lever]]): Village Hotels
(meeting space, room nights), University of Reading Hospitality (venues,
subsidised community events), Platinum Recruitment (staff-nominated donations).
All three are vague about how an organisation actually asks. Low priority, and
they would need a real front door before they are worth a row.
