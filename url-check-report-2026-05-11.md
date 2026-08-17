# Grant URL Health Report — 11 May 2026

## Summary

| Status | Count | Notes |
|---|---|---|
| Active + OK | 513 | Last verified by cron job |
| Active + Unchecked | 67 | Never fully validated or flagged as "wrong page" |
| Inactive + Dead | 464 | Properly deactivated by cron |
| Inactive + OK | 9 | Manually deactivated, URLs still work |
| Inactive + Unchecked | 142 | Deactivated before URL check ran |

**Total grants with URLs:** 1,195

## Cron Job Status

The Vercel cron at `/api/cron/validate-urls` last ran today (11 May 2026), checking 238 URLs. It runs weekly on Mondays at 03:00 UTC. Recent activity:

- 11 May 2026: 238 checked
- 4 May 2026: 153 checked
- 20 Apr 2026: 56 checked

## Key Findings

### 1. 67 Active Grants With Unchecked URLs

These grants are live in the database but their URLs have never been fully validated, or the deep-check classified them as "wrong page." Some were checked by the cron today but remained unchecked, meaning the page loaded but didn't clearly match the grant. These need manual review:

| Grant | Funder | URL |
|---|---|---|
| 2026/2027 Community Engagement Fund | Home Office | https://www.find-government-grants.service.gov.uk/grants/20262027-community-engagement-fund-1 |
| Acumen Academy UK Fellowship | Acumen Academy | https://acumenacademy.org/fellowship/uk |
| Albert Gubay Charitable Foundation Grants | Albert Gubay Charitable Foundation | https://www.albertgubayfoundation.org/ |
| ASC Digital Expertise and Sector Engagement Provision | DHSC | https://www.find-government-grants.service.gov.uk/grants/asc-digital-expertise-and-sector-engagement-provision-1 |
| Aviva Community Fund | Aviva plc | https://www.avivacommunityfund.co.uk/start-crowdfunding |
| Barbara Ward Children's Foundation | Barbara Ward Children's Foundation | https://www.bwcf.org.uk/ |
| Better Brighton & Hove Fund — Ward Pots 2026 | Brighton & Hove City Council | https://yourvoice.brighton-hove.gov.uk/projects/better-brighton-hove-fund |
| BFI National Lottery Audience Projects Fund | British Film Institute | https://www.bfi.org.uk/get-funding-support/bring-film-wider-audience/bfi-national-lottery-audience-projects-fund |
| Boost Fund | Corra Foundation | https://www.corra.scot/grants/boost-fund/ |
| Brewers Foundation | Brewers Foundation | https://info.brewers.co.uk/the-brewers-foundation |
| Building On Overlooked Sporting Talent (BOOST) | BOOST | https://www.boostct.org/ |
| Cash for Kids - Cost of Living Grants | Bauer Media / Cash for Kids | https://cashforkids.org.uk/grants |
| Charity IT Association (CITA) — Tech Volunteers | Charity IT Association | https://www.cita.org.uk/ |
| Civil Society Resilience Fund | DCMS | https://www.find-government-grants.service.gov.uk/grants/civil-society-resilience-infrastructure-fund-1 |
| Community Grant Programme | National Grid | https://www.nationalgrid.com/responsibility/community/community-grant-programme |
| Cuthbert Horn Trust | Cuthbert Horn Trust | https://youngcamdenfoundation.org.uk/funding/cuthbert-horn-trust |
| DCR Allen Charitable Trust | DCR Allen Charitable Trust | https://register-of-charities.charitycommission.gov.uk/en/charity-search/-/charity-details/277293/charity-overview |
| Delamere Dairy Foundation | Delamere Dairy Foundation | https://delameredairyfoundation.org.uk/ |
| Emerton-Christie Charity | Emerton-Christie Charity | https://www.emertonchristie.org/ |
| Ernest Kleinwort Charitable Trust — Medium Grants | The Ernest Kleinwort Charitable Trust | https://ekct.org.uk/ |
| Ford of Britain Trust — Large Grants | Ford of Britain Trust | https://www.ford.co.uk/experience-ford/news/ford-britain-trust |
| Get going with your Fund | South Yorkshire Community Foundation | https://www.sycf.org.uk |
| Grants for environmental activities | Community Foundation Tyne & Wear and Northumberland | https://www.communityfoundation.org.uk/grants/grants-for-environmental-activities/ |
| Green Hall Foundation | Green Hall Foundation | https://greenhallfoundation.org/how-to-apply/ |
| Hackney — Core Grants | Hackney Council | https://www.hackney.gov.uk/community-safety-and-environment/community-partnerships/community-grants/what-grants-are-available |
| Hampstead Wells and Camden Trust | Hampstead Wells and Campden Trust | https://hwct.org.uk/ |
| Harford Charitable Trust | Harford Charitable Trust | https://register-of-charities.charitycommission.gov.uk/en/charity-search/-/charity-details/299945/charity-overview |
| HDH Wills Charitable Trust | HDH Wills Charitable Trust | https://hdhwills.org/ |
| Henry Smith Foundation Grants | Henry Smith Foundation | https://henrysmith.foundation/grants/ |
| Hollick Family Charitable Trust | Hollick Family Charitable Trust | https://youngcamdenfoundation.org.uk/funding/hollick-family-charitable-trust |
| Key Fund Flexible Finance | Key Fund | https://thekeyfund.co.uk/funding/ |
| Lambeth Community Connections Fund | Lambeth Council | https://www.lambeth.gov.uk/community-connections-fund |
| Lewes Town Council — Community Grants | Lewes Town Council | https://www.lewes-tc.gov.uk/your-council/grants/ |
| Marsh Charitable Trust | Marsh Charitable Trust | https://www.marshcharitabletrust.org/ |
| Movement for Good — £5,000 Special Draws | Benefact Group | https://movementforgood.com/ |
| National Archives - Project Grants | The National Archives | https://www.nationalarchives.gov.uk/archives-sector/grants-and-funding/ |
| NCVO Learning & Development Programmes | NCVO | https://www.ncvo.org.uk/training-events/ |
| Nesta Innovation Challenges — Prize Competitions | Nesta | https://challengeworks.org/about-challenge-prizes/our-challenge-prizes/ |
| One Stop Community Partnership Programme | Groundwork / One Stop Stores | https://www.groundwork.org.uk/one-stop-community-partnership/ |
| Out of School artistic/creative activities (Tyne & Wear) | Community Foundation T&W | https://www.communityfoundation.org.uk/grants/artistic-and-creative-activities-for-children-and-young-people-in-tyne-wear-and-northumberland/ |
| People and Research | Historic England | https://www.find-government-grants.service.gov.uk/grants/people-and-research-1 |
| Peter Sell Award | Leslie Sell Charitable Trust | https://lesliesellct.org.uk/the-peter-sell-annual-award/ |
| Pilotlight — Pro Bono Support Matching | Pilotlight | https://www.pilotlight.org.uk/ |
| Rosa — Rise Fund | Rosa UK Fund for Women & Girls | https://rosauk.org/our-programmes/rise-fund/ |
| Rosa — Stand With Us Fund | Rosa UK Fund for Women & Girls | https://rosauk.org/our-programmes/ |
| Sasha Foundation | Sasha Foundation | https://www.thesashafoundation.org.uk/ |
| Skinners' Company Charity Programme | The Skinners' Company | https://skinners.org.uk/young-peoples-vocational-development-charities |
| Social Business Trust — Strategic Growth Support | Social Business Trust | https://socialbusinesstrust.org/ |
| Social Justice Small Grants Programme | Community Foundation for NI | https://communityfoundationni.org/grants/social-justice-small-grants-programme/ |
| Southover Manor Trust | Southover Manor Trust | https://southovermanortrust.org.uk/ |
| Southwark Council — Common Purpose Grants | Southwark Council | https://www.southwark.gov.uk/community-engagement/grants-and-funding/common-purpose-grants |
| Stobart Sustainability Fund | Eddie Stobart | https://eddiestobart.com/the-stobart-sustainability-fund/ |
| Supporting Voluntary Returns through Community Partnerships | Home Office | https://www.find-government-grants.service.gov.uk/grants/supporting-voluntary-returns-through-community-partnerships-1 |
| Sussex Community Foundation — Rother District Council Community Grants | Sussex Community Foundation | https://sussexcommunityfoundation.org/grants/how-to-apply/additional-grants/rother-district-council-community-grants/ |
| Sussex Crisis Fund | Sussex Community Foundation | https://sussexcommunityfoundation.org/grants/ |
| SWEF Enterprise Fund | East End Community Foundation | https://eastendcf.org/grants/ |
| TechSoup UK Donated & Discounted Technology | TechSoup UK | https://www.techsoup.uk/product-catalog |
| Tell us about your project | Sport Wales | https://forms.office.com/Pages/ResponsePage.aspx?id=... |
| The Dodgson Foundation | The Dodgson Foundation | http://dodgson.org.uk/ |
| The Pebble Trust | The Pebble Trust | https://www.pebbletrust.org/donations |
| The Percy Bilton Charity | The Percy Bilton Charity | https://www.percy-bilton-charity.org/ |
| The UK Youth Fund | UK Youth / Pears Foundation | https://www.ukyouth.org/what-we-do/the-uk-youth-fund/ |
| To bring people together... | Community Foundation T&W | https://www.communityfoundation.org.uk/grants/to-bring-people-together-and-to-encourage-a-sense-of-belonging-to-people-who-are-disenfranchised-or-isolated/ |
| WCIT Charity Grants | WCIT Charity | https://wcitcharity.org.uk/apply-for-a-grant/ |
| Whirlwind Charitable Trust | Whirlwind Charitable Trust | https://www.whirlwind.org.uk/ |
| Yapp Charitable Trust | Yapp Charitable Trust | https://yappcharitabletrust.org.uk/ |
| Yapp Charitable Trust Core Funding | Yapp Charitable Trust | https://yappcharitabletrust.org.uk/how-to-apply/ |

### 2. 142 Active Grants Not Checked in 14+ Days

These are marked "ok" but haven't been rechecked recently. The oldest was last checked on 16 March 2026 (nearly 2 months ago). The cron job appears to only process a subset of grants each week rather than all active ones.

### 3. Dead URL Handling Is Working

All 464 dead URLs have been properly deactivated (`is_active = false`). The cron job's auto-deactivation logic is functioning correctly — no dead URLs are being shown to users.

### 4. Notable Patterns in Unchecked URLs

- **Charity Commission links** (2 grants): These are registry pages, not direct apply pages — may need replacing with actual funder websites.
- **The Dodgson Foundation** uses `http://` instead of `https://` — worth updating.
- **Sport Wales** links to a Microsoft Forms URL — these are hard to validate automatically.

## Limitations

This report was generated from database state only. The sandbox network allowlist prevents direct URL fetching to external grant websites. The Vercel cron job (`/api/cron/validate-urls`) is the correct mechanism for live URL checks and ran today.

## Recommendations

1. **Review the 67 unchecked grants** — open each in a browser to confirm they link to the correct apply page.
2. **Investigate why the cron skips some grants** — 142 "ok" grants haven't been rechecked in 2+ weeks, suggesting the cron doesn't cycle through the full list.
3. **Replace Charity Commission links** with direct funder websites where possible.
4. **Update http:// to https://** for The Dodgson Foundation.
