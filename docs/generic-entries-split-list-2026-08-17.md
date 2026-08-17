# Generic entries: which funders are hiding several funds

**For Paul, 17 August 2026. Counts fetched once, nothing split.**
Source data: `reports/generic-row-fund-counts-2026-08-17.json`.

34 rows read — the trusts and corporates only. The 17 community foundations were
deliberately excluded: they are not being split, they get a scheduled feed in
September with a £5,000 floor (recorded in the ledger).

**30 counted, 4 unreadable.** And a result worth having before you pick: **7 of
the 30 turned out to be a single fund.** The `multiple_funds` verdict is not
reliable on its own, so this list is doing real work rather than confirming what
we already believed.

---

## Split candidates, largest first

| Funds | Funder | Named programmes |
|---:|---|---|
| **15** | Salford CVS | Third Sector Fund · Arts and Culture · Elevate Salford · Achieve Asset Fund · GM Inspire · Answer Cancer … |
| **7** | 7Stars Foundation | Project Funding · Shine Bright · Child Poverty · Social Impact · Josh's Fund · Individual Funding |
| **7** | Allen Lane Foundation | Asylum Seekers & Refugees · Gypsy, Roma & Traveller · Offenders · Older People · Violence or Abuse · Mental health |
| **7** | Variety Club | Wheelchairs · Sunshine Coaches · Great Days Out · Organisation grants · Children's Hospital · Access Interns |
| **6** | Dulverton Trust | Youth Opportunities · General Welfare · Heritage · Conservation · Kenya and Uganda · International Stability |
| **6** | School for Social Entrepreneurs | Trading for Good (+ Community Business, Bury, Milton Keynes, Stockport) · Social Investment Gateway |
| **5** | Greater Manchester Mayor's Charity | Christmas Big Give · Autumn Small Grants · Spring/Summer Small Grants · Live Well Communities · Emergency Response |
| **5** | Happy Days Children's Charity | Family Day Trips · Family Holiday Breaks · Group Day Trips · Children in Care · Group Activity Holidays |
| **4** | Charles Hayward Foundation | Social & Criminal Justice · Overseas · Heritage & Conservation · Older People |
| **4** | Mayor of London (Go! London) | Foundation · Young Entrepreneurs · Match. Trade. Grow. · Open Innovation Challenges |
| **4** | St Giles & St George Education Charity | Small · Project · Community Investment · Strategic |
| **4** | W F Southall Trust | Quaker Work & Witness · Peace & Reconciliation · Environmental Action · Social Action |
| 3 | A B Charitable Trust | Open · Special Initiatives · Anchor |
| 3 | Arnold Clark | Gear Up For Sport · Community Support · Cost-of-Living |
| 3 | Network for Social Change | Fast Track · Pools · Major Projects |
| 3 | The Eveson Trust | Capital · Medical Research · Enhance |
| 3 | Triodos Bank UK | Loans up to £1m · Loans over £1m · Raising capital |
| 2 | B&Q Foundation | Home Improvement · Home-Starter Kit |
| 2 | Forte Charitable Foundation | Small · Major |
| 2 | Percy Bilton Charity | Large · Small |
| 2 | The Portal Trust | Organisations · Individuals |
| 2 | The Weavers' Company | Small Grants · Main Grants |
| 2 | Variety, the Children's Charity | Equipment grants · Wheelchair grants |

**23 rows, 106 funds between them.**

### Two notes before you pick

**Variety is in here twice** — "Variety Club" (7) and "Variety, the Children's
Charity" (2) are the same charity under two funder names, and their fund lists
overlap (wheelchairs, equipment). That is a duplicate-funder problem underneath a
split, and splitting both would double the overlap. Worth merging first.

**Several of the twos are a size band, not separate funds** — Percy Bilton
(Large/Small), Forte (Small/Major), Weavers' (Small/Main). Splitting those buys a
user very little: same funder, same criteria, different ceiling. The ones that
change what a fundraiser can find are where the programmes are **thematically
distinct**: Allen Lane (six different beneficiary groups), Dulverton, Charles
Hayward, W F Southall. Those are the ones I would do first if you want a shorter
list.

---

## Not generic at all — the verdict was wrong (7)

One fund each. No action, and recorded so they are not raised again.

Garfield Weston (General Grants) · Sir James Reckitt (General Grants) · Anton
Jurgens Charitable Trust · Jerwood Foundation (Annual Funding Round) · Reach
Volunteering (TrusteeWorks) · Fishmongers' Company (Charitable Grants) ·
Gannochy Trust (Perth & Kinross Grants)

## Could not be read (4)

Charity Bank · Historic England · Morrisons Foundation · TechSoup UK

All four are almost certainly bot walls. The counting script fetches directly and
does **not** use `READER_PROXY_URL`, which the verification engine does and which
is known to clear roughly sixteen such hosts. Re-running these four through the
proxy would settle them; it is four page reads, not a project.
