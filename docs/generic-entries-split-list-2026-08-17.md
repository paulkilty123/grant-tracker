# Generic entries: which funders are hiding several funds

> **RESOLVED 17 August: do not split.** Enumerating the funds behind these rows
> found 215 funds, of which 51 clear the £5,000 floor and **1** clears it while
> also having its own page. The other 47 are named on an index page with no link
> of their own, so splitting would have made 47 rows sharing one URL.
>
> **Staged: one row** — Charity Bank Green Loans, inactive and flagged (no
> timing on its page). **Everything else is September**, as the scheduled feed;
> the design constraint that follows from this measurement is written up in
> `catalogue-health-ledger.md`.
>
> **TechSoup UK is dropped from the split set entirely.** Its 20 "funds" are
> donated and discounted software, not a fund set. The row stays as the in-kind
> entry it is.
>
> Two corrections to the counts below, found when checking before staging rather
> than after: Historic England's qualifying fund turned out to point at the same
> URL as its own umbrella, and two of Charity Bank's three are size bands of one
> lending product already covered by the existing row.

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

---

## Added 30 August: Manchester Airports Group — two funds we do not hold

Found while checking a false positive, so it is recorded rather than chased.

We hold one MAG row, Manchester Airport Community Trust Fund, capped at £3,000,
and that figure is correct. The group's funding site also runs:

- **Stansted Community Grants**, up to £5,000
- **A Flagship Award**, up to £50,000 for larger capital projects — London
  Stansted's, not Manchester's

Both clear the £5,000 floor this document uses and neither is in the catalogue.

The reason this is worth writing down is what it nearly caused. An
understated-ceiling scan proposed raising the Manchester row to £50,000 on the
strength of the Flagship Award appearing on the same site. That would have sent
a Manchester charity to a fund it cannot apply for. The right answer is not a
bigger number on the row we have; it is the two rows we do not.

**A fifth false-positive class, and the one most likely to recur:** a
fund-specific row measured against a multi-fund funder page. It will fire on any
funder where we hold one row and the site describes several — which is the entire
population this document is about. Named alongside the other four in
`docs/link-flags-2026-08-30.md`.
