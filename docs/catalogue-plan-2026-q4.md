# Catalogue plan, Q4 2026: 650 to 1,100 live by 31 December

Agreed with Paul, 16 September 2026. "Live" means is_active and published,
the same rows the sitemap lists and the matcher scores. The counter on
/dashboard/admin/usage reads this target and says every day whether the
catalogue is ahead of or behind the straight line.

## Why 1,100 and not 2,000

2,000 live by year end needs about 90 net new live rows a week for fifteen
weeks. The best week on record was launch week, 81 went live, and that was
three Opus brief batches running at once. A normal week is 3 to 35. So 2,000
live is a 2027 number. Paul said "1,000 ish"; 1,100 is the same target with
room for autumn closures, which run at 5 to 15 a week.

## The arithmetic

| | |
|---|---|
| Live on 16 Sept | 650 |
| Target, 31 Dec | 1,100 |
| Net needed | 450 over 15 weeks, 30 a week |
| Closures to expect | 60 to 100 |
| Gross needed | 510 to 550 |

## Where the rows come from, in order of yield per hour

| Source | Expected live rows | How |
|---|---|---|
| Reopenings | 120 to 150 | 282 closed funds are held (131 between rounds, 151 published but inactive). check-coming-soon and verify-rows bring them back a month before they open. Free. The autumn is when most reopen. |
| Community foundations' dated funds | 150 to 200 | One row per foundation today; Foundation Scotland alone has 14 live funds. The convention already allows a row per dated fund. 46 foundations, briefed by region as the Scotland, NI and regions batches were. Council and CF pages often need a browser. |
| Directories as discovery | 60 to 100 | BVSC monthly PDF, funding.scot, the Charity Excellence list, GLA and NCVO round-ups. Discovery only: every row is still read against the funder's page before it goes live. |
| 360Giving | 40 to 60 | Funders that filed grants last year and run an open programme not yet listed. Doubles as the dossier data promised in the Crowdfunder document. Not started; the import is the first job. |
| Programmes and investment | 30 to 40 | The investment breadth work is half done (homepage re-checks, then directories, then watchlist enrolment). Programmes are seasonal, 18 live of 184 tracked; the autumn intakes lift that on their own. |
| Film and documentary | 25 to 40 | Added 16 Sept after a documentary maker's voice note: Shooting People folded and nothing lists film funding in one place. Six rows live, three BFI funds staged. Sources: the rest of the BFI National Lottery funds (immersive, screen heritage, the regional NETWORK hubs where they take companies), Doc Society's other funds as they reopen, Creative Scotland and Screen Scotland's smaller schemes, Film Hub Wales and Film Hub North, Creative UK, the Wellcome and Nuffield film commissions, broadcaster funds (Channel 4's Indie Growth Fund, BBC Docs), the Whickers, Sheffield DocFest's MeetMarket, Chicken & Egg, and the climate and human rights story funds run through Doc Society. Production companies are limited by shares, so the audience rule as it stands applies (a trading company with a social purpose is in); five UK Global Screen Fund rows were rejected earlier as industry funds, so each row is judged on whether a social-purpose producer could apply. |
| Review pens | 40 | 36 awaiting review and 11 tagged, waiting on Paul. |

Total 465 to 630 gross, against 510 to 550 needed. Tight, and the top two
lines carry it; film is the one sector with a named user waiting for it.

## Weekly rhythm

- Monday: the counter, the review pens cleared, closures from the weekend read.
- Tuesday: the digest goes; its "new this week" section is the public face of the number.
- Midweek: one Opus brief batch (a region's community foundations, a directory, or a sector such as film), staged into Needs reading, read overnight by the verify cron, published on Paul's spot check. Launch week showed 15 to 25 live rows per batch. The film batch goes first, in the week of 22 September, because a user is waiting.
- Friday: what went live, what closed, what is behind the line.

## What blocks the pace

1. **The page reader has no credits.** r.jina.ai ran out on 13 September; bot-walled funders cannot be read in production until it is topped up. Community foundation and council sites are the ones most often walled.
2. **Model spend.** Each new row is one enrichment read, about a penny, plus verification. 550 rows is £6 to £10 across the quarter on the production key. The local key is never used for batches without a yes.
3. **Paul's review time.** Auto-publish is capped at 15 a day and needs a clean gate; rows that miss it wait for him. The pens should never hold more than a week's batch.
4. **Closures are not a fault.** A closed fund taken down is the product working. The counter reports net, and net is the number that matters.

## Not in this plan

Contracts and tenders (a new funding type, 2027), the full 580-row
beneficiary retag (measured as worth about 35 rows and parked), and any SEO
work before the December Search Console review.
