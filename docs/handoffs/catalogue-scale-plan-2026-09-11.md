# Catalogue scale plan, 11 September 2026

Written for Paul after the Crowdfunder meeting. The ask on the table is a
"comprehensive, broad database". The number we can defend is not the biggest,
it is the one nobody else can claim: every live row read against the funder's
own page inside 30 days. Today that is 614 of 614. The plan grows the count
without letting that slip.

## Where the rows are today

| bucket | rows |
|---|---:|
| live and published | 614 |
| held, hidden, still marked published (expired, reopening unknown) | 141 |
| between rounds with a reopening date | 128 |
| awaiting review | 28 |
| captured or enriched, not yet reviewed | 10 |
| rejected | 262 |
| archived | 856 |

Run-rate over the last fortnight: 105 rows added, 60 went live. Call it 30
live a week with the current machinery.

## Month one, to 11 October: 614 to about 900 live

Four levers, cheapest first. None needs a new source.

**1. Reopenings, now that the sweep works (fixed 10 Sept).** 128 rows carry a
reopening date and surface a month ahead. Expect 30 to 40 to reach the queue
by mid October as autumn rounds open. Zero spend, Paul's click each.

**2. Widen the evidence pass to hidden-published rows.** The 01:00 read
already re-reads the 141 hidden rows and banks what the page says. The second
pass in check-coming-soon only looks at `between_rounds_scheduled`, so a
hidden-published row whose page now says "open" reaches nobody. Half a day.
Prove it by making one reappear. Zero spend, evidence already bought.

**3. Throughput.** Two settings hold the pipeline at a walking pace:
- `process-pipeline-queue` runs once a day, 12 rows. It was built for every
  five minutes. Vercel is Pro now, so sub-daily is allowed. Move to six
  staggered runs a day (72 rows). This is the enrichment spend lever: up to
  72 page reads a day on the production key. Canary for a week and read the
  bill before going further.
- auto-publish applies at most 5 a day. With the gate proven, raise to 15.
  Same gate, same holds, more of them a day.
- Merge the reenrich-publish-loop fix (branch `fix/reenrich-publish-loop`)
  so republishes stop eating the daily slots.

**4. Two Opus batches a week from handoff briefs.** This is what produced the
regions batch (18 live) and the sectors batch. Briefs to write: Scotland
community foundations (the funding.scot seam), Northern Ireland, remaining
Welsh regions, and the sector gaps the matcher shows (young people,
employment, housing). Each batch is 10 to 20 rows staged with quotes, Paul
activates. Spend is page reads only.

Expected: 30 a week from batches, 10 a week from reopenings, 10 a week from
throughput, roughly 200 more live in a month.

## Months two and three: to 2,000 live by December

The breadth engine, in order.

**5. 360Giving as the funder list.** Free, open, 300-plus publishers with
their grants made. The `ingest-360giving` route exists. Use it for the funder
name, website and what they actually fund, then find the programme page and
put it in the discovery queue. The gaps 360Giving admits (duration, local and
devolved funding, eligibility) are exactly what our verification adds. This
is where "thousands" becomes true and defensible.

**6. Charity Commission register, grant-makers only.** The register's
classification for charities that make grants to organisations, filtered by
income, is the seam behind anyone's "20,000 funders". Names and websites are
free; each one costs a page find and a read. Start with income over £500k
and a website; that is the working set that actually runs programmes.

**7. Keep the 30-day read.** Every row the breadth engine adds joins the
nightly read. If verify-rows cannot keep every live row inside 30 days, stop
adding and fix that first. The claim is worth more than the count.

## What not to do

- Searching for programmes by hand. Four tests in September produced two.
- Grouped provider rows to make the count look bigger. One row per fund.
- Publishing ahead of the engine's read to hit a number.

## Decisions for Paul

1. The throughput canary in lever 3 spends on the production key. Rows per
   day, not pounds: up to 72 enrichments a day for a week, then read the bill.
2. The order of the batch briefs in lever 4.
3. Whether the Crowdfunder number to aim at is 900 by his trial or the 30-day
   read at 100%. Both are true today only if we keep them both.
