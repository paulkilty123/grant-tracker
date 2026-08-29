# Amounts that the funder's page does not state

Swept 2026-08-29. Scope: the 163 published rows whose `amount_max` was set by
a scraper, a seed, a directory listing or nothing at all, never by a read of the
funder's page and never by a human.

**104 of 163 checked out** — the figure we show is on the funder's page.

No Anthropic call. Fetching a page is free; the check is whether the number
appears in the rendered text. `scripts/amount-sweep-2026-08-29.ts` reproduces it.

## What this list is, and is not

"Not on the page" is not the same as "wrong". The figure may sit in a guidance
PDF, or have come from award data. What it does mean is that a fundraiser
following our link cannot see the sentence that supports the number we showed
them, and neither can we.

Spot-checked five of the largest by hand and they are real:

- **Esmée Fairbairn, Natural World** and **Eranda Rothschild** state no figure at all.
- **Garfield Weston**: the page's only figure is £100,000, and it is the threshold
  above which you apply to a different scheme, not the general-grant maximum.
- **JRCT**: the page's only figure is £20,000; we show up to £200,000.
- **Mercers**: the page's figures are £3.4 million across 70 grants and £1 million.
  Neither is a per-applicant amount. CLAUDE.md already names Mercers as a
  pool-versus-grant case.

At least one entry below is a formatting artefact rather than a finding:
**Rewilding Britain**'s stored evidence quotes "up to £ 100 , 000 per year", so the
figure is right and the spacing defeated the match. Treat 42 as an upper bound.

## The maximum is not on the page — 42 rows

This is the half that matters: the maximum is what a fundraiser decides on.

| Showing | Funder | Fund | Page |
|---|---|---|---|
| — to £609,957 | Office of the Police and Crime Commissioner for Merseyside | Child Focused Court IDVA- Cheshire & Merseyside | https://www.find-government-grants.service.gov.uk/grants/child-focused-courts-idva--cheshire--merseyside-1 |
| £10,000 to £500,000 | Historic England | Historic England — Heritage at Risk Grants | https://historicengland.org.uk/advice/heritage-at-risk/ |
| £25,000 to £250,000 | Architectural Heritage Fund | Architectural Heritage Fund — Development Grants | https://ahfund.org.uk/grants/ |
| £20,000 to £200,000 | Esmée Fairbairn Foundation | Esmée Fairbairn Foundation — Arts, Culture & Heritage | https://esmeefairbairn.org.uk/apply-for-a-grant/creative-confident-communities-guidance/ |
| £30,000 to £200,000 | Esmée Fairbairn Foundation | Esmée Fairbairn Foundation — Natural World | https://esmeefairbairn.org.uk/apply-for-a-grant/our-natural-world-guidance/ |
| £10,000 to £200,000 | Joseph Rowntree Charitable Trust | JRCT — Rights & Justice Programme | https://www.jrct.org.uk/rights-and-justice |
| £1,000 to £200,000 | Lambeth Council | Lambeth Community Connections Fund | https://www.lambeth.gov.uk/community-connections-fund |
| £25,000 to £200,000 | Esmée Fairbairn Foundation | Esmée Fairbairn Foundation — A Fairer Future | https://esmeefairbairn.org.uk/apply-for-a-grant/a-fairer-future-guidance/ |
| £10,000 to £120,000 | The Mercers' Company | Church and Communities Programme | https://www.mercers.co.uk/philanthropy/church-and-communities |
| £10,000 to £100,000 | Eranda Rothschild Foundation | Eranda Rothschild Foundation | https://erandarothschild.org/ |
| £500 to £100,000 | Historic England | Historic England — Listed Places of Worship Grant Scheme | https://historicengland.org.uk/advice/grants/what-we-fund/ |
| £5,000 to £100,000 | NHS Charities Together | NHS Charities Together — Community Grants | https://nhscharitiestogether.co.uk/about-us/our-programmes/ |
| £50,000 to £100,000 | Rewilding Britain | Rewilding Challenge Fund | https://www.rewildingbritain.org.uk/how-to-rewild/funding-for-rewilding/rewilding-challenge-fund |
| £5,000 to £100,000 | Active Travel England | Active Travel England — Communities and Engagement Fund | https://www.activetravelengland.gov.uk/funding |
| £30,000 to £65,000 | Esmée Fairbairn Foundation | Open Call Funding | https://esmeefairbairn.org.uk/applications/ |
| £60,000 to £60,000 | Bethnal Green Ventures | Tech for Good Programme | https://bethnalgreenventures.com/ |
| £1,000 to £50,000 | Rayne Foundation | Rayne Foundation | https://www.raynefoundation.org.uk/ |
| £5,000 to £50,000 | Youth Endowment Fund | Youth Endowment Fund | https://www.youthendowmentfund.org.uk/ |
| £1,000 to £25,000 | Cadent Foundation | Cadent Foundation — Community Grants | https://cadentgas.com/foundation |
| — to £25,000 | The Health Lottery Foundation | The Health Lottery Foundation | https://thehealthlotteryfoundation.org.uk/grants/grant-information/ |
| £10,000 to £25,000 | Steel Charitable Trust | Steel Charitable Trust | https://steelcharitabletrust.org.uk/ |
| £1,000 to £20,000 | DCR Allen Charitable Trust | DCR Allen Charitable Trust | https://register-of-charities.charitycommission.gov.uk/en/charity-search/-/charity-details/277293/charity-overview |
| £5,000 to £20,000 | Colwinston Charitable Trust | Performing and Visual Arts Grants (Wales) | https://colwinston.org.uk/how-to-apply/ |
| £100 to £15,000 | National Lottery Community Fund | Sustainable Steps Wales - Egin Grants | https://www.tnlcommunityfund.org.uk/funding/funding-programmes/sustainable-steps-wales-egin-grants |
| £1,000 to £15,000 | School for Social Entrepreneurs | SSE Match Trading Grant | https://www.matchtrading.com/ |
| £500 to £10,000 | Cornwall Community Foundation | Cornwall Community Foundation — Community Grants | https://cornwallcommunityfoundation.com/cornwall-charity-grants/grants/ |
| £3,000 to £10,000 | Hampstead Wells and Campden Trust | Hampstead Wells and Camden Trust | https://hwct.org.uk/grants-for-organisations/ |
| £1,000 to £10,000 | School for Social Entrepreneurs (SSE) | SSE Start Up Programme | https://www.the-sse.org/programmes/ |
| £500 to £10,000 | Sussex Community Foundation | Sussex Crisis Fund — Sussex Community Foundation | https://sussexcommunityfoundation.org/grants/ |
| — to £10,000 | Didymus CIO | Didymus Fund | https://didymus-charity.org.uk/how-to-apply/ |
| £500 to £10,000 | London Borough of Tower Hamlets | Tower Hamlets — Community Grant Programme | https://www.towerhamlets.gov.uk/lgnl/community_and_living/voluntary-and-community-sector/Council-funding-for-VCS/small-grants/Mayors-Small-Grants-Programme.aspx |
| — to £7,000 | Charles Hayward Foundation | Charles Hayward Foundation — Small Grants (Older People) | http://www.charleshaywardfoundation.org.uk/older-people/ |
| — to £5,000 | BlueSpark Foundation | BlueSpark Foundation | https://www.bluesparkfoundation.org.uk/ |
| £2,000 to £5,000 | Bauer Media / Cash for Kids | Cash for Kids - Cost of Living Grants | https://cashforkids.org.uk/grants/cost-of-living/ |
| £3,000 to £5,000 | Chalk Cliff Trust | Chalk Cliff Trust — Grants for East Sussex | https://www.chalkclifftrust.org/home |
| — to £5,000 | British Toy and Hobby Association | Toy Trust | https://www.toytrust.co.uk/ |
| £2,000 to £5,000 | Camden Council / Camden Giving | Camden Climate Fund | https://www.camden.gov.uk/camden-climate-fund |
| — to £5,000 | Variety, the Children's Charity | Variety Club - Equipment Grants | https://www.variety.org.uk/how-can-we-help/equipment-grants-for-children/ |
| — to £3,000 | Yapp Charitable Trust | Yapp Charitable Trust | https://yappcharitabletrust.org.uk/how-to-apply/ |
| £1,000 to £2,500 | Arnold Clark | Arnold Clark Community Fund | https://www.arnoldclark.com/community-fund |
| — to £1,000 | Wigan Council | Wigan — Supporting Communities Fund | https://supportingcommunitiesfund.wigan.gov.uk/Checklist |
| £350 to £500 | St Martin-in-the-Fields Charity | Vicar's Relief Fund — St Martin-in-the-Fields Charity | https://smitfc.org/the-vicars-relief-fund/ |

## Only the minimum is missing — 11 rows

Lower stakes: the ceiling is supported, the floor is not.

| Showing | Funder | Fund |
|---|---|---|
| £50,000 to £10,000,000 | National Lottery Heritage Fund | National Lottery Heritage Fund — Landscape Connections |
| £120,000 to £648,000 | Department for Digital, Culture, Media and Sport | DCMS 'Connections Through Gaming' Pilot Fund (Boys 11-16) |
| £150,000 to £250,000 | Ministry of Defence  | An Official Oral History of Women Veterans in the UK |
| £1,000 to £100,000 | Garfield Weston Foundation | Garfield Weston Foundation — General Grants |
| £10,000 to £50,000 | National Churches Trust | National Churches Trust — Large Grants |
| £1,000 to £25,000 | Crowdfunder UK | Crowdfunder — Match Funding |
| £2,000 to £20,000 | Ernest Cook Trust | Ernest Cook Trust — Rural Skills & Conservation |
| £1,000 to £15,000 | Clothworkers' Foundation | Clothworkers Foundation — Small Capital Grants (up to £15,000) |
| £1,000 to £10,000 | Sasha Foundation | Sasha Foundation |
| £1,000 to £10,000 | Haringey Community Collaborative | Haringey VCS Challenge Fund — Healthy Neighbourhoods |
| £1,000 to £10,000 | Community Foundation Tyne & Wear and Northumberland | The 1989 Willan Charitable Trust |

## Flagged but correct — 6 rows

In-kind and free-support rows where £0 is the deliberate value, not a gap.
The sweep should exclude `amount_max = 0`; left here so the count reconciles.

- Good Things Foundation — National Digital Inclusion Network membership
- Pilotlight — Pilotlight 360
- Media Trust — Communications Support and Volunteer Matching
- Sport England — Buddle - free club and community organisation support
- Sported — Volunteer Consultancy & Membership
- Expert Impact — Human Lending Library

## One I caused

**Yapp Charitable Trust** appears above because I re-pointed its `apply_url` from
the homepage to `/how-to-apply/` earlier the same day. "Grants are normally for a
maximum of £3,000 per year" is on the homepage and on neither of the pages the row
now carries. The homepage should go back as a source.

