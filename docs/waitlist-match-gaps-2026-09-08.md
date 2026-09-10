# Waitlist reach check: can the 26 find anything?

Written 2026-09-08. Read-only: nothing in the catalogue was changed.

Keyed by organisation, not by email address, so a list of 26 people's personal
addresses does not sit in the repo. The signup list itself stays wherever Paul
holds it.

## What this measures, and what it does not

For each organisation it counts **live published rows** whose sector overlaps
theirs, and how many of those are reachable on geography (national rows, plus
rows tagged to their area).

It is **not** `computeMatchScore`. The real matcher also weighs beneficiaries,
grant size, funder type and the structure gate, and caps a structure mismatch at
44. Treat these as "is there anything here at all", not as a predicted match
percentage.

One number is inflated on purpose and should be ignored: the raw sector count.
`community` is tagged on 408 of 581 live rows, and almost every organisation
here touches community, so sector overlap alone says yes to everyone. The
columns that carry information are **local rows** and **beneficiary coverage**.

## The catalogue as it stands

581 live published rows: 468 grant, 48 in-kind, 46 investment, 19 programme.
238 are tagged `UK`. Beyond Scotland (36), England (30), London (19) and Wales
(18), local coverage is thin everywhere.

## The sharpest finding

**Two of the 26 are men's organisations, and the catalogue holds one row tagged
`men_boys`: the DCMS "Connections Through Gaming" Pilot Fund, for boys aged 11
to 16, in England.**

That is no use to either of them. Men Walk Talk is adult men's mental health
through group walks in Cornwall and the South West. Men in Sheds Hull is older
men's isolation and practical skills in Hull. Both would land on general
mental-health and community rows and nothing addressed to them.

This is the clearest catalogue-shaped hole in the cohort and it serves two
signups at once.

## Per organisation

Ordered by how badly served they are.

| organisation | what they do | where | rows tagged to their area | the gap |
|---|---|---|---|---|
| **White Lodge Centre** | Disabled children, young people and adults | Surrey | **1** | Surrey has exactly one live row, Community Foundation for Surrey Grants. Disability is 42 rows nationally. Worst geographic coverage in the cohort. |
| **Men in Sheds Hull** | Older men's wellbeing, isolation, practical skills | Hull | 12, none Hull-specific | `men_boys` is 1 row and it is for boys 11-16. `older_people` is 17 rows, spread across Nottinghamshire, Somerset, Sussex, Oxfordshire, Norfolk, Lewes, Merseyside, Suffolk and Lincolnshire, with **none** in Yorkshire or Humber. |
| **Men Walk Talk** | Men's mental health walking groups | Cornwall / South West | 4 | Same `men_boys` hole. Falls back on 90 mental-health rows, none addressed to men. |
| **Bridlington Cricket Foundation** | Community cricket | Bridlington, East Yorkshire | 12 | 43 sport rows live and **zero** tagged to Yorkshire or Humber. Sport funding in the catalogue is national or elsewhere. |
| **FareShare South West** (2 signups) | Surplus food redistribution | Bristol and the South West | 8 | `food` is 19 rows, and only 7 reach the South West or are national. One of the 19 is FareShare Greater Manchester, a peer rather than a funder. Food is the thinnest sector any waitlist org sits in. |
| **ACTA Community Theatre** | Community theatre, participatory arts | Bristol | **2** | Bristol has 9 live rows across all sectors. Creative is 100 rows nationally, so they are reliant on national arts funders. |
| **Swansea Rainbow Counselling Centre** | Counselling, wellbeing, LGBT+, mediation, legal | Swansea | 29 (mostly Wales-wide) | `lgbtq` is 10 rows and **none** are Welsh: they are UK-wide, England, London, Southwark and Suffolk. Wales coverage overall is reasonable at 38. |
| **The Suit Works** | Interview clothing, employment support | Sheffield | 5 | Employment is 79 rows. Yorkshire and Humber holds 17 rows total across every sector. |
| **Fresh Futures** | Children, families, HAF holiday clubs, college | Kirklees | 5 | Well served nationally (children 114, young people 201) but almost nothing local. HAF-style holiday and food provision sits in the thin `food` set. |
| **East Sussex Wildlife Rescue** | Wildlife rescue and ambulance | East Sussex | 9 | Sussex is one of the better-covered areas at 11 rows. Animal welfare is not a sector in the taxonomy at all, so they will match on environment and community only. |
| **North West Pre-hospital Critical Care** | Volunteer doctors and paramedic responders | Cheshire, Greater Manchester | 5 | Narrow sector: health only, 165 rows. Emergency and pre-hospital care is not a taxonomy sector, so matching will be coarse. |
| **Become United** | Marginalised communities, wellbeing | Greater Manchester | 8 | Reasonable. Greater Manchester and the North West hold 14 rows. `ethnic_minorities` is 42 rows. |
| **The Apex Project** | Youth work, weapons awareness, mentoring, music, coding | Urban, place not confirmed | 25 if London | Well served if London. `ex_offenders` is only 12 rows, which is the weak edge of their work. |
| **IOI London** | Children and young people | London | 39 | Best-served in the cohort. London is 41 rows and young people 201. |
| **The Resurgence Trust** | Environment and ecology publishing | Devon | 3 | Environment is 155 rows, so nationally fine; publishing and media work is not a taxonomy sector. |

### Organisations where the catalogue is not the issue

| organisation | why |
|---|---|
| **Sue Ryder** | Large national charity. 85 of 581 rows carry an income cap and 81 of those cap at £5m or below, so a good part of the catalogue excludes them by size. They are not the product's target user. |
| **The Duke of Edinburgh's Award** | Same shape: national, large, and more likely a partner than a grant seeker. |
| **The Fertility Sanctuary Ltd** | "Ltd" in the name. If it is a plain company limited by shares it fails the structure gate on most grant rows, which caps at 44 regardless of everything else. Worth confirming its legal form before drawing any conclusion about matches. |
| **Sagax Advisory** | Reads as an advisory or consultancy firm rather than a charity. Likely evaluating the product rather than looking for funding. |

### Four that cannot be assessed

| signup | why |
|---|---|
| **Community Ambition** | Website is a "Coming Soon" placeholder, 97 characters. Nothing to classify. |
| **Partnering for Purpose** | Site is bot-walled to both fetch and browser. |
| **Pivot Support** | Site describes an app and a toolkit ("Pivot: Foundations", "Pivot: Community") without saying who it serves or in what sector. |
| Two personal addresses | A BT and a Gmail address with no organisation identifiable from the domain. One is a known sector figure. |

Nothing was inferred about the four from a guess at the name. If Paul wants
them assessed, the cheapest route is to ask at onboarding rather than research
outward.

## What filling the gaps would look like, ranked

Ranked by waitlist organisations served per unit of work.

1. **Men's and older men's wellbeing.** Serves two signups and the catalogue has
   effectively nothing. Men's Sheds Association funding routes, men's mental
   health funders, and the older-men's isolation niche. One row tagged
   `men_boys` today, and it is for 11 to 16 year olds.
2. **Yorkshire and the Humber.** Serves four signups: Fresh Futures (Kirklees),
   The Suit Works (Sheffield), Bridlington Cricket, Men in Sheds Hull. 17 rows
   for the whole region. Two Ridings and South Yorkshire community foundations
   are the obvious start, plus the sport gap below.
3. **Sport outside London.** 43 sport rows and none tagged to Yorkshire or
   Humber. Bridlington Cricket has national sport funders only.
4. **Food and surplus redistribution.** 19 rows and one of them is a peer
   organisation. Two signups from FareShare South West alone.
5. **Bristol and the South West.** Nine rows for Bristol against four
   organisations in the area (ACTA, FareShare SW, Men Walk Talk, Resurgence).
6. **Surrey and the South East.** One row. One organisation, but it is the
   single worst-covered place in the list.
7. **LGBT+ in Wales.** 10 `lgbtq` rows, none Welsh.

## Two taxonomy gaps worth noting separately

Neither is a missing funder, both are missing vocabulary, and both will make
matching coarse no matter how many rows are added:

- **Animal welfare** is not an `impact_sector`. East Sussex WRAS can only be
  tagged environment and community.
- **Emergency and pre-hospital care** has no sector either. North West
  Pre-hospital Critical Care matches on `health` alone, alongside 165 rows.

## Caveats

- Sector overlap over-counts because `community` covers 408 of 581 rows. Local
  row counts and beneficiary counts are the informative columns.
- This does not run the matcher, so it says nothing about score, and in
  particular nothing about the structure gate, which caps a mismatch at 44 and
  is the single most common reason a real match fails.
- Organisation identification came from domains and a short read of each site.
  Fresh Futures, Swansea Rainbow, The Suit Works, Become United, The Apex
  Project, NWPCC, IOI London and Men Walk Talk were confirmed from their own
  pages today. The rest are from the domain and the name.
