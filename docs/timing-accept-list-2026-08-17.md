# Timing: the accept list

**For Paul, 17 August 2026. Nothing here is applied.** Five rows were fixed
already on your instruction and are recorded at the bottom.

> **Read this first.** You asked for "the other nine real deadlines" and "the 14
> confirmed-rolling" as one accept list. Checking the quotes, neither group is
> what its count suggests. Of the 14, **half the quotes do not mention timing at
> all** — they are eligibility sentences, and one is in Dutch. Handing you 23
> rows to accept in one go would have passed the same not-really-checked problem
> down the line. The real accept list is **12**.

---

## A. Accept — dated application rounds (6)

The page states dates a fundraiser must submit by. Proposal: unset `is_rolling`
and record the cycle.

| Fund | Funder | The page says |
|---|---|---|
| Achlachan Wind Farm Community Fund | Foundation Scotland | "Application deadlines: 15th March, 15th June, 15th September, 15th December" |
| sportscotland — Facilities Investment | sportscotland | "Deadlines for submission … are 5pm on the 1st April and 1st September each year." |
| Grants for Good Fund | Matthew Good Foundation | "Our four application windows run as follows: December 16th – March 15th, March 16th – June 15th, June 16th – September 15th, September 16th – December 15th" |
| Ernest Kleinwort — Medium Grants | Ernest Kleinwort Charitable Trust | "Applications accepted online four times a year during the following date ranges: 4th January – 4th February, 18th April – 12th May, 10th July – 13th August …" |
| Community Grants | Hampton Fund | "Our Trustees meet four times a year … Application submission deadlines …" |
| Community Grant Programme | National Grid Electricity Transmission | "We accept applications on a quarterly basis. See timeline below." |

## B. Accept — genuinely rolling, and we say otherwise (6)

Page confirms applications are taken any time. Proposal: set `is_rolling`.

| Fund | The page says |
|---|---|
| Alpkit Foundation | "Applications are reviewed on a rolling basis every couple of months" |
| Innovate UK Innovation Loans | "There is no submission deadline" |
| Islington Giving — Make It Happen Fund | "a rolling programme so you can apply at any time of the year" |
| Sterry Family Foundation | "Applications can be made at any time." |
| The Access Foundation | "There are no application deadlines." |
| Sixpenny Wood Wind Farm Fund | "You can apply at any time (funds allowing)." |

## C. One that is neither — it has a real deadline

**Hackney — Crisis and Resilience Fund.** The engine proposed *rolling*; the page
says **"You can apply for the Crisis and Resilience Fund until 31 March 2029."**
That is a closing date, not a rolling fund. Proposal: `deadline = 2029-03-31`,
`is_rolling = false`. Accepting the engine's proposal here would have been wrong.

---

## D. Rejected — the quote does not support the claim (7)

These came through as "the page confirms rolling". They do not. No change
proposed; recorded so the same seven do not arrive again as a fresh finding.

| Fund | What was quoted as evidence of rolling | What it actually is |
|---|---|---|
| Anton Jurgens Charitable Trust | "Stuur dan een korte beschrijving van jouw organisatie…" | a sentence in Dutch, about emailing a description |
| Buttle UK — Chances for Children | "Applications can only be made by frontline professionals working for a: registered charity…" | eligibility, not timing |
| Supporting the Supporters (Devon CF) | "Our Getting to Know You form is a chance for groups…" | an introduction form |
| Resolution Foundation Workertech | "We're open to applications … from companies, charities, CICs and cooperatives" | eligibility, not timing |
| TrustLaw — Pro Bono Legal Programme | "TrustLaw is a completely free service open to law firms…" | a service description |
| Beddington Community Benefit Fund | "A panel meets quarterly to review eligible applications" | a decision cadence |
| Adint Charitable Trust | "grants are awarded throughout the year" | about awarding, not applying |

## E. Correct as they are — do not re-flag (9)

Rolling funds whose pages list the dates their **trustees meet**. A decision
cadence is not an application deadline, and every one of these would be made
worse by "fixing" it. The removal actuator's `affirmsRolling` guard already
abstains on them; this is the written record so they are not re-raised.

Drapers' Charitable Fund · William A Cadbury Charitable Trust · 29th May 1961
Charitable Trust (General Grantmaking) · Didymus Fund · Fat Beehive Foundation
(Digital funding for small charities) · The 1989 Willan Charitable Trust ·
Toy Trust · Energy Industry Voluntary Redress Scheme · Get going with your Fund
(South Yorkshire CF)

South Yorkshire's page says it outright: *"The Small Grants Programme is rolling,
but has set panel review dates."*

## F. Too vague to act on (4)

Read, timing mentioned, no date recoverable. Not in scope now.

National Lottery Heritage Grants ("Deadlines … are quarterly") · Strategic Legal
Fund ("usually six closing dates … roughly every two months") · Corra Foundation
Alcohol and Drugs Micro Grants ("panels will meet in July, September and
November") · The Pixel Fund ("a staged application process").

---

## Already fixed, 17 August, on your instruction

| Fund | Change | Evidence |
|---|---|---|
| **HCF Grants** | `deadline = 2026-08-24`, rolling off | "Autumn 2026 Round: Now open. Deadline 5pm 24th August 2026." |
| Alan and Babette Sainsbury | rolling off | "WE DO NOT ACCEPT UNSOLICITED APPLICATIONS" |
| Aurora Trust | rolling off | "does not generally accept unsolicited applications" |
| The Linbury Trust | rolling off | "does not accept unsolicited enquires or applications" |
| The Mark Leonard Trust | rolling off | "a proactive grant process and does not accept unsolicited applications" |

All four of the non-applicants were **already** flagged `is_invite_only`. The
fault was that they were flagged rolling as well, so the card said apply any time
for a funder that takes no applications. Unsetting rolling was the fix, not
setting invite-only.

HCF needed a pin override: `is_rolling` was pinned by you on 2026-07-08 and the
trust ladder refused the write, which is the ladder working. It went in as
`admin:` and **was then unpinned**, because that round closes on 24 August and the
next opens the day after — a pinned deadline would be stale within a week.
Record: `reports/timing-fixes-2026-08-17.json`.
