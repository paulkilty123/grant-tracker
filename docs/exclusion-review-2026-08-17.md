# The 52 exclusion rows, grouped

**For Paul, 17 August 2026. Nothing here has been accepted or written.**

These are the live rows where the funder's page states an exclusion the
catalogue does not carry. They were sent to your queue rather than bulk-accepted
because adding an exclusion removes matches, and the rule is that only widenings
go in bulk.

> **One correction to what I told you first.** I described these as "people being
> invited to apply where they are barred", and you were right to prioritise them
> on that basis, but the reading does not survive contact with the rows. **Five
> of the 52 are that.** The rest are missing exclusion text — a real
> completeness gap under rule 6, and worth fixing — but they do not tell anyone
> they are eligible when they are not. The five are at the top and they are the
> ones worth your attention today.

| Group | Rows | What it is |
|---|---:|---|
| **1. The page bars a legal form we tag as eligible** | **5** | **the actual false-eligibility set** |
| 2. Not an exclusion at all | 3 | extractor scraped navigation text; reject |
| 3. Bars an applicant, but not by legal form | 23 | geography, size, age, governance, purpose |
| 4. Bars a spend, not an applicant | 15 | salaries, capital, retrospective costs |
| 5. Bars an activity or conduct | 6 | political, religious, discriminatory |

---

## Group 1 — the page bars a legal form we tag as eligible (5)

Someone with this legal form, reading our card, is told they can apply. The
funder's page says they cannot. Each needs the tag removed, not just the
exclusion added.

| Fund | The funder bars | We tag as eligible | The clash |
|---|---|---|---|
| **J N Derbyshire Trust** | "organisations not registered with Charities Commission or Companies House" | `unincorporated` + ltd_guarantee + cic_guarantee | **an unincorporated group is at neither register** |
| **Grants for Good Fund** (Matthew Good Foundation) | "Regular Ltd companies and sole traders" | …+ `ltd_shares` + cic_shares + … | **`ltd_shares` is exactly a regular Ltd company** |
| **Property Fund** (Key Fund) | "Not a legal company registered at Companies House" | …+ `unincorporated` | **same clash as Derbyshire** |
| **Sizewell C Community Fund** | "sole traders"; "companies that are aimed at generating profits for private distribution" | …+ `cic_shares` + … | a CIC limited by shares may distribute capped profit |
| **Scops Arts Trust** | "Privately owned, profit-distributing companies" | …+ `cic_shares` + … | **arguable** — a CIC by shares has an asset lock and a dividend cap, so it may not be what the funder means |

The first three are unambiguous. The last two turn on whether a CIC limited by
shares counts as profit-distributing, which is one judgement covering both.

**Grants for Good also carries an income cap in its exclusion text** —
"Organisations with an income of more than £50,000 in the last 12 months" — with
no structured `max_org_income` on the row. That is ledger item A10 showing up
inside this queue rather than beside it.

---

## Group 2 — not an exclusion at all (3)

The extractor lifted a heading or a link label. **Reject these; do not add them.**
Accepting would put meaningless text on the eligibility surface, which is worse
than the gap.

| Fund | What was extracted |
|---|---|
| Annandale and Nithsdale Community Benefit Company | "Information on what the fund cannot support is provided here." |
| Cash for Kids — General Grant | "What we don't fund" |
| sportscotland — Facilities Investment | "those that will not be eligible (see SFF Guidelines)" |

All three are pages where the real exclusions sit one click away. They are
candidates for the second hop, not for this queue.

---

## Group 3 — bars an applicant, but not by legal form (23)

Real exclusions that change who should see the fund, but none contradicts a
structure tag. Bulk-acceptable in principle if you want the text carried; the
matcher does not read exclusion prose today, so accepting these improves what a
fundraiser reads rather than what they are shown.

**By geography or reach (7)** — Community Grant Programme (NGET), Heritage and
Nature Grants, Make a Difference Locally, Small Grants Scheme (Merchant
Taylors'), The Pixel Fund, The Wyseliot Rose, Tim Parry Johnathan Ball.
Representative: *"charities that operate nationally"*.

**By what the organisation is for (8)** — Adint, Community Action Fund (Greggs,
*"Animal charities"*), Ernest Kleinwort, General Grantmaking (29th May 1961),
HDH Wills, Joseph Rank (*"umbrella bodies"*), Michael Cornish (*"Grant making
bodies applying for funding to redistribute"*), Zoom for Nonprofits.

**By size, age, governance or finances (8)** — A&O Shearman, Achlachan (*"without
a representative membership structure"*), Barbara Ward (*"exceed more than 10% of
a charities income"*), London Catalyst, Newcastle Culture Investment Fund,
Northern Impact Fund 2, Pilkington (*"established for less than 3 years"*),
William Kendall (*"£200,000 or more in cash at bank"*).

Note Ernest Kleinwort and London Catalyst both bar CICs and **neither is a
clash** — we tag them charity-only already. Pilkington bars *CICs limited by
shares* and we tag `cic_guarantee`, which is the right distinction correctly
held. The tagging is better than the raw count suggested.

---

## Group 4 — bars a spend, not an applicant (15)

Lowest harm in the set: nobody is misled about eligibility, the card is just
less complete. Safe to accept in bulk if you want them carried.

Barrhill · Central Grants Programme · Charles Hayward Small Grants · Community
Grants (Old Enfield) · Crowdfunder Match Funding · Evan Cornish · Forth Giving ·
Help the Homeless · Hobson Charity · Manchester Airport Community Trust ·
One Stop Community Partnership · Pilgrim Trust · The Headley Trust · Woodward
General Grants · Yapp Charitable Trust

Representative: *"salaries"*, *"retrospective grants against contracts already
let"*, *"Purchases of minibuses"*, *"costs other than running costs"*.

---

## Group 5 — bars an activity or conduct (6)

Beinneun (*"use of fossil fuel"*) · Esmée Fairbairn A Fairer Future · JRCT Power
& Accountability · Revenue Share for Social Enterprises · Whirlwind
(*"Applications excluding participants based on faith, social background, or
race"*) · Wickes Community Programme.

---

## What I would do with this

1. **The five in group 1**, which is two questions: *does an unincorporated group
   belong on a Companies-House-only fund* (no, on three rows), and *is a CIC
   limited by shares profit-distributing* (one judgement, two rows).
2. **Reject the three in group 2** and queue their pages for a second hop.
3. Groups 3, 4 and 5 are 44 rows of missing text with no false-eligibility in
   them. They are a completeness job, not a safety one, and they can wait for
   after September without anyone being misled in the meantime.

Nothing acts without you. Accepted corrections write with an `admin:` source
because you decided them; nothing here auto-resolves.
