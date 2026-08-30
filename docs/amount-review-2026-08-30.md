# Unsupported amount ceilings — what was done

Worked 2026-08-30 against the brief of the same date. Supersedes the
classification in `amount-review-2026-08-29.md`; that file's numbers were the
first pass.

## Before the data was touched

**Scoring.** A row with no amount scored 0.5 on the amount signal, so an
amount-only search returned 45 against 90 and sorted it below result 200. It now
scores 0.7 — the same hedge the structure signal already used for an unknown —
and `amount_in_range` is no longer emitted, because that signal asserts a
comparison to the user's range and there was no figure to compare.

Dropping the signal from the average entirely was tried first and is worse: on a
search whose only filter is the amount, nothing is then applicable and the row
scores 0 rather than 45. Kept as a test.

**`amount_undisclosed`.** Now derived by a trigger (migration 072, renumbered from 070). It was set by
hand and had stopped meaning anything: 142 published rows had no amount and only
14 were flagged, while 3 rows were flagged *while carrying an amount*.
Contradictions went to 0.

The flag count, with the population named, because an unlabelled one was
reported first and did not reconcile:

| Population | Before | After 070 | After the floor pass |
|---|---:|---:|---:|
| active and published | 14 | 56 | 60 |
| active | — | — | 65 |
| all rows | — | — | 87 |

"56" was the active-and-published slice at that moment and the report did not
say so.

**Re-sweep.** The `&pound;` decoder was already in when the first sweep ran
(fixed 23:55, swept 23:58), so 42 was not inflated by it. Normalising whitespace
inside figures and excluding in-kind rows by rule took the list from 59 to 51,
and the max-missing half from 42 to 39.

## The 39, classified

| Bucket | Rows | Applied |
|---|---|---|
| Page states no amount at all | 19 | yes — `amount_max` nulled |
| Figure is a pool across many grants | 5 | no |
| Figure is an income limit | 2 | no |
| Figures present, no pattern fits | 11 | no |
| Page states something that looks like a ceiling | 2 | no — see below |

Plus **Joseph Rowntree Charitable Trust**, handled on its own after the re-read
the brief asked for. Confirmed: the page's only figure is "grants between
£20,000-80,000 for 1-3 years" and it belongs to the immigration detention and
deportation round, not the programme. £200,000 removed; £20,000 explicitly NOT
adopted, and the reason is on the row.

## Why `page_states_a_figure` is not applied

Both instances were wrong. Wigan's £2,000 is one of several investment pots.
St Martin's £650 and £15 come from a case study — "she fled with just £15 to her
name". A regex cannot tell a funder's ceiling from a story about a person.

## Guards that changed the answer

- **A page we could not read never becomes a null.** Camden Giving was first
  classified `no_figure`; its apply_url returns 403. The read had come from a
  `grant_sources` page while the ledger recorded the apply_url, naming a page
  that contributed nothing. The ledger now records which URLs were read.
- **The reader proxy answers 200 with its own error text.**
  "AuthenticationRequiredError: You have been blocked..." was being scored as a
  page that mentions no amount. Now treated as a failure.
- **Every null was confirmed by a second, independent read** before writing.
  19 of 19 agreed.

## The 19 nulled

Before-state in `reports/amount-nulls-2026-08-30.json` — there is no amount
source column, so that file is the only record of the figure removed.

| Was | Funder | Fund |
|---|---|---|
| — to £609,957 | Office of the Police and Crime Commissioner for Merseyside | Child Focused Court IDVA- Cheshire & Merseyside |
| £20,000 to £200,000 | Esmée Fairbairn Foundation | Esmée Fairbairn Foundation — Arts, Culture & Heritage |
| £30,000 to £200,000 | Esmée Fairbairn Foundation | Esmée Fairbairn Foundation — Natural World |
| £25,000 to £200,000 | Esmée Fairbairn Foundation | Esmée Fairbairn Foundation — A Fairer Future |
| £1,000 to £200,000 | Lambeth Council | Lambeth Community Connections Fund |
| £10,000 to £100,000 | Eranda Rothschild Foundation | Eranda Rothschild Foundation |
| £1,000 to £50,000 | Rayne Foundation | Rayne Foundation |
| £10,000 to £25,000 | Steel Charitable Trust | Steel Charitable Trust |
| — to £25,000 | The Health Lottery Foundation | The Health Lottery Foundation |
| £1,000 to £15,000 | School for Social Entrepreneurs | SSE Match Trading Grant |
| £3,000 to £10,000 | Hampstead Wells and Campden Trust | Hampstead Wells and Camden Trust |
| £1,000 to £10,000 | School for Social Entrepreneurs (SSE) | SSE Start Up Programme |
| £500 to £10,000 | Sussex Community Foundation | Sussex Crisis Fund — Sussex Community Foundation |
| — to £5,000 | BlueSpark Foundation | BlueSpark Foundation |
| £2,000 to £5,000 | Bauer Media / Cash for Kids | Cash for Kids - Cost of Living Grants |
| £3,000 to £5,000 | Chalk Cliff Trust | Chalk Cliff Trust — Grants for East Sussex |
| £2,000 to £5,000 | Camden Council / Camden Giving | Camden Climate Fund |
| — to £5,000 | Variety, the Children's Charity | Variety Club - Equipment Grants |
| £1,000 to £2,500 | Arnold Clark | Arnold Clark Community Fund |

## Still open


### Figure is a pool across many grants — 5

- **The Mercers' Company** — showing £120,000
  - d wellness of staff and volunteers, amid the sector’s growing pressures. 80% of grantees in 2024-2025 had a turnover of less than £1 million, ensuring that grants awarded are significant for grant holders and the communities they 
- **NHS Charities Together** — showing £100,000
  - ies to prevent and/or respond to crises and emergencies, and in doing so reduce pressures facing NHS services. In 2024 we awarded £426,000 to projects led by ambulance charities with a focus on community responses to out-of-hospit
- **North London Waste Authority** — showing £20,000
  - tant role in delivering our Joint Waste Strategy (JWS) by enabling local communities to take action on waste reduction. In total, £250,000 is set aside each year in grants for community-based (non-profit-making) organisations. The
- **Colwinston Charitable Trust** — showing £20,000
  - Other areas may also be supported on occasion, at the discretion of the trustees. The majority of grants will be in the range of £5,000 to £30,000. Larger grants are generally only awarded to organisations where a funding relation
- **Cornwall Community Foundation** — showing £10,000
  - apply? Ready to apply? --> You’re in good company – we awarded more than 714 grants to community groups during 2025 amounting to £2.6 million. On this page you’ll find all of the grants we have available to charities, CICs and vol

### Figure is an income limit — 2

- **Esmée Fairbairn Foundation** — showing £65,000
  - relevant networks, and grassroots groups We don't fund... These types of organisations Organisations with a turnover of less than £100,000 (as reflected in the latest set of accounts) Organisations that are not constituted Organis
- **Didymus CIO** — showing £10,000
  - which are not registered charities, or that are overdue in reporting to the Charity Commission Organisations with income of over £1 million within the past 3 years Organisations who have less than 3 years of returns with the Chari

### Figures present, no pattern fits — 11

- **Historic England** — showing £500,000
  - £15 million — ink should be added to the Heritage at Risk Register. Heritage at Risk Capital Fund Projects 37 local heritage sites ben
- **Architectural Heritage Fund** — showing £250,000
  - £400,000 — oluntary, community, or social enterprise organisations with a minimum of two years’ operating activity and a minimum tu || £200,000 — e organisations with a minimum of two years’ operating activity and a minimum turnov
- **Joseph Rowntree Charitable Trust** — showing £200,000
  - £20,000 — in the immigration detention and deportation space. Of these, we are expecting to fund two to five new groups with grant
- **Active Travel England** — showing £100,000
  - £13.9 million — nisations to provide funding and support to 11 local authorities to pilot active travel social prescribing activities. A
- **Historic England** — showing £100,000
  - £92 million — c environment, including surveys, toolkits, guidance and publications. Places of Worship Renewal Fund Find out about thi
- **Bethnal Green Ventures** — showing £60,000
  - £4.5M — ending aeroponic technology enables food to be grown with no soil, zero pesticides and 95% less water. The team have sin
- **Youth Endowment Fund** — showing £50,000
  - £3m — can help prevent children from becoming involved in violence, improving… Read News News: YEF backs CBT programme in scho || £3 — provide earlier support for children at risk of exclusion and involvement in violence, the Yout
- **Cadent Foundation** — showing £25,000
  - £3 million — ce support and practical measures. This is made possible each year by Cadent who help to fund the Cadent Foundation by c || £1M — y of post-tax profits. Read our latest Impact Report , to find out the difference our g
- **DCR Allen Charitable Trust** — showing £20,000
  - £153,422 — ney Donations to other Charitable Organisations Income and expenditure Data for financial year ending 05 April 2025 Tota || £163,658 — table Organisations Income and expenditure Data for financial year ending 05 April 2
- **National Lottery Community Fund** — showing £15,000
  - £100 — vigation Overview Who can apply What we want to fund What you can spend the money on How to apply Project location: Wale || £35,000 — Overview Who can apply What we want to fund What you can spend the money on How to apply 
- **London Borough of Tower Hamlets** — showing £10,000
  - £800,000 — his vision, the council launched the Mayor’s Small Grants Programme (MSGP) on Monday 11 December 2023. The programme wil || £150,000 — ide £800,000 of annual grant funding between November 2023 and March 2027 for small 

### Page states something that looks like a ceiling — 2

- **Wigan Council** — showing £1,000
  - e. We will use this email address to contact you. From which investment pot are you applying for funding? Small Investment (Up To £2,000) Begin Application A-Z A B C D E F G H I J K L M N O P Q R S T U V W X Y Z Explore wigan.gov.
- **St Martin-in-the-Fields Charity** — showing £500
  - we require evidence for. They are issued quickly and efficiently via experienced support workers. We can provide grants of up to £650 to help people access accommodation, for example rent deposits, rent in advance, ID fees or temp

The 12 rows missing only a floor are out of scope per the brief.



## The floor pass, and the defect it fixes

The ceiling pass left `amount_min` on 16 of the 20 rows, which was wrong twice
over.

It is the same unsupported figure. Of the 16, fifteen had no provenance for the
floor at all and the sixteenth was a scraper's. None came from a read of the
page. And it reads worse alone than it did in a range: Esmée Fairbairn's Natural
World guidance states no figure, and the row went from "£30,000 to £200,000",
which reads as a rough band, to "from £30,000", which reads as a threshold the
applicant has to clear.

It also suppressed the flag built the same day. `derive_amount_undisclosed`
returns false the moment either figure is present — correctly, since a row
publishing a floor is not a funder publishing nothing — so only 4 of the 19
carried it.

13 floors removed, same stamp and same ledger. **17 of the 20 rows are now fully
null and flagged undisclosed.**

Three are not, and are waiting on a readable fetch rather than a decision: Rayne
Foundation, School for Social Entrepreneurs and Camden Giving all returned zero
characters on three consecutive attempts, having served their pages earlier the
same day. That is this machine being rate-limited after a day of sweeps, not the
rows. They keep their floors until a read confirms.

JRCT is the one row allowed past the no-figures guard, named explicitly rather
than by widening the rule: its page does carry "grants between £20,000-80,000
for 1-3 years" and that belongs to the immigration detention and deportation
round, not the Rights & Justice programme the row describes.

## JRCT's deadline

Removed. The page says "Our next grant round will close in September 2026" — a
month, no date. The stored 2 September 2026 came from `system:spot_check_2026-08-17`
with a null quote in `field_evidence`, so nothing supported the precision. With
the amounts gone it was the only claim left on the card and it sat three days
out. The month is known and is not stored, because `deadline` is a date column
and 30 September would invent the same precision again.

## Correction: the reader proxy does not return 200

Yesterday's commit said the proxy "answers HTTP 200 with its own error text" and
that this was manufacturing silence. **That is wrong.** Measured today, the block
response is:

    HTTP 401, 146 bytes
    AuthenticationRequiredError: You have been blocked from performing anonymous
    queries due to bad network reputation (AS9009). Please authenticate.

Both consumers — `enrich-grant` and `verify-row` — do `if (!res.ok) throw`, so a
block is an error, not a page. It cannot manufacture a silence. The guard added
yesterday is harmless and still worth having for other degenerate bodies, but its
stated reason was not real.

Searched for the block text across all 1,947 rows in `field_evidence`,
`funder_brief`, `raw_data` and `description`: **0 occurrences.**

Production's proxy works. Observed today on Allan & Nesta Ferguson: "direct fetch
failed (HTTP 401); recovered via reader proxy (3209 chars)". The 401 above is
this machine's network reputation, not Vercel's.

## How much of page-reading is actually a bot wall

Of live published rows, by what the verifier last recorded:

| What happened | Live rows |
|---|---:|
| verified | 400 |
| link goes to the wrong fund | 74 |
| page lists several funds | 59 |
| page carried no funding detail | 41 |
| page returned nothing | 4 |
| fetch failed | 1 |

**Five.** The ceiling is not a bot wall. None of the five has a silent
`who_can_apply` or `exclusions` — those came from earlier successful reads — and
the gaps on them are two missing amounts and two missing dates.

One of the five is not a bot wall at all: The Paley Trust's `apply_url` is
`mailto:PaleyTrust@outlook.com`, which is not a page and never could be fetched.
