# Catalogue staleness audit, 10 August 2026

Prompted by Jo (Olympias Music) and Charlotte (Mustard Tree) independently
reporting inaccurate deadlines as the single worst thing about the product. Jo's
figure: of 149 matches, 3 were genuinely open, eligible and new.

**Every number below comes from a query run against production on 2026-08-10.
The SQL is included so it can be re-run.** Nothing here has been changed; the two
proposals at the end are for sign-off, not implemented.

---

## Headline: the premise was wrong, and that matters

The brief asked me to flag every live row with a deadline in the past and decide
a rule for them.

**There are none. Zero.** The expiry machinery works.

```sql
select count(*) from scraped_grants
where is_active and deadline is not null and deadline < '2026-08-10';
-- 0
```

URL health is good too: of 742 live rows, 738 were URL-checked on 2026-08-09,
none are `dead`, and the oldest check on any live row is one day old.

So the users' complaint is real but the cause is not stale deadlines. It is
**missing** deadlines, and an unearned claim of "rolling" laid over the top.

### What "live" means here

Find Funding queries `grants_with_funder` filtered on `is_active = true` and
nothing else (`src/app/dashboard/search/page.tsx:1429`). The view does not filter
rows (1,818 base rows, 1,818 view rows), so `is_active` alone is the visibility
rule. `pipeline_state` is **not** a visibility filter on any user surface.

Note the dashboard uses a *different, stricter* rule
(`src/app/dashboard/page.tsx:118-122`): `is_active`, plus `url_status != 'dead'`,
plus a date predicate. Two surfaces, two definitions of live. That is the
long-standing dashboard-vs-Find-Funding count drift, and it means Find Funding is
the permissive one.

---

## 1. What the live catalogue is actually made of

742 live rows:

| Shape | Rows | Share |
|---|---:|---:|
| Real future deadline | 181 | 24% |
| No deadline, flagged `is_rolling` | 395 | 53% |
| No deadline, not flagged rolling | 165 | 22% |
| Deadline **and** rolling (contradictory) | 1 | — |

```sql
select
  count(*) filter (where is_rolling is true and deadline is null)     as rolling_no_deadline,
  count(*) filter (where is_rolling is not true and deadline is null) as not_rolling_no_deadline,
  count(*) filter (where is_rolling is not true and deadline is not null) as real_deadline
from scraped_grants where is_active;
-- 395 | 165 | 181
```

**Three quarters of what we show has no deadline at all.** For 395 of those we
assert "Rolling" in the interface. That assertion is not evidence-based: nothing
verifies it, and nothing can expire it, because expiry keys off a deadline that
is null.

This is the actual defect. A fund that quietly closes its programme stays live
and labelled Rolling forever. Deadline expiry cannot catch it (no deadline). URL
validation cannot catch it (the page still returns 200).

### Verified instance

Sampled the two oldest-enriched rolling rows and checked them against the
funder's own page.

- **Clothworkers Foundation, Open Funding** — correct. Genuinely open, genuinely
  rolling, despite `last_enriched` of 2025-01-15 (19 months ago).
- **JRCT, Power and Accountability** — **wrong**. We show it as rolling and open.
  The funder's page says the expression-of-interest stage "has now closed"
  (13 July), new applicants can only proceed if invited, and the next round is
  September 2026. So it is simultaneously closed, invite-only, and dated, and we
  present it as an open rolling fund.

One wrong out of two is not a rate, and should not be quoted as one. It does
establish that the failure mode is real and that `is_rolling = true,
deadline = null` is not a trustworthy signal of "open".

---

## 2. The dead zones

```sql
select pipeline_state::text, is_active, count(*)
from scraped_grants group by 1,2 order by 3 desc;
```

| pipeline_state | is_active | Rows | Visible to users? |
|---|---|---:|---|
| archived | false | 853 | no |
| published | true | 686 | **yes** |
| published | false | **169** | no |
| tagged_awaiting_review | true | **45** | **yes** |
| tagged | false | 39 | no |
| rejected | false | 10 | no |
| archived | true | **9** | **yes** |
| tagged_awaiting_review | false | 3 | no |
| tagged | true | 2 | **yes** |
| captured / between_rounds_scheduled | false | 2 | no |

Three corrections to the brief's framing:

- **Published-but-inactive is 169, not 137.** It has grown since it was last
  counted. These are invisible to users but still count as "published" in admin
  views, so the review queue understates the backlog.
- **Archived-but-live is 9, confirmed.** But these are *not* a user-facing
  correctness problem. They are real, working funders (Morrisons Foundation,
  Steel Charitable Trust, American Express, The Grocers' Charity, Garfield-style
  household names), all URL-checked 2026-08-09 and `ok`, two with future
  deadlines. Their `field_provenance.pipeline_state` is **null**, meaning nothing
  recorded who archived them. This is the known expire-grants pipeline_state
  desync: `is_active` was restored without `pipeline_state` following. The user
  sees a good funder; the *admin queues* are the ones being lied to.
- **56 live rows are in a non-published state** (9 archived + 45
  tagged_awaiting_review + 2 tagged). Because no user surface filters on
  `pipeline_state`, all 56 are being shown to users while formally awaiting
  review. Worth a decision in its own right: either the publish gate means
  something or it does not.

---

## 3. Pins

```sql
with pins as (
  select g.id, g.is_active, g.deadline, k.key as field, k.value->>'source' as source
  from scraped_grants g, lateral jsonb_each(coalesce(g.field_provenance,'{}'::jsonb)) k
  where (k.value->>'pinned')::boolean is true
)
select count(distinct id) from pins;                      -- 593 rows carry >=1 pin
select count(*) from pins;                                -- 1,794 pinned fields
select count(distinct id) from pins where is_active;      -- 368 live rows
```

Deadline pins specifically:

| | Rows |
|---|---:|
| Rows with a pinned `deadline` | 184 |
| of which live | 64 |
| live, pinned to a **future** date | 48 |
| live, pinned to **NULL** | **16** |
| live, pinned to a **past** date | **0** |
| pinned by an `admin:` source | **184 (all of them)** |

**No pin is currently protecting a stale deadline.** Zero live rows have a pinned
past deadline. So pinning is not the cause of the staleness complaint, and the
"376 pinned rows" figure in the brief does not correspond to a deadline problem.

Two things worth knowing anyway:

- **Every single deadline pin came from an `admin:` source.** Nothing else can
  pin. That is the known behaviour where an `admin:` source forces `pinned: true`
  even when `pinned: false` was intended, so these are unlikely to all be
  deliberate acts of judgment.
- **16 live rows have their deadline pinned to NULL.** Those rows can never
  acquire a deadline through re-enrichment. They are permanently deadline-less
  and will show as Rolling forever. That is a small but genuine self-inflicted
  subset of section 1.

---

## 4. Two bugs found on the way

**`grant_closed` has never once been persisted.**

```sql
select url_status, is_active, count(*) from scraped_grants group by 1,2;
-- ok/true 654 | dead/false 615 | ok/false 321 | unchecked/false 140 | unchecked/true 88
```

`grant_closed` appears nowhere, in any state, ever. The URL validator computes
that verdict and `validate-urls` has a branch for it that sets
`pipeline_state = 'tagged_awaiting_review'` while leaving the row active. Since
the value never lands in `url_status`, either the detection never fires or the
write is being lost. **This is precisely the check that would have caught JRCT**,
so it is worth a look independently of anything below.

**88 live rows have `url_status = 'unchecked'.'** They are shown to users without
a successful URL verdict. Not dead, but not confirmed either.

---

## Proposal A — needs sign-off: what to do about undated rows

There is no past-deadline population to write a rule for. The rule that is
actually needed governs the 560 undated live rows.

| Option | Effect | Risk |
|---|---|---|
| **Auto-unpublish undated rows** | Removes 560 of 742 live rows | Catastrophic. Most are genuinely rolling. Rejected. |
| **Stop asserting "Rolling" without evidence** | Interface change only; 395 rows change label | Low. Honest. Does not shrink the catalogue. |
| **Re-read undated rows on a cycle, route changes to review** | Catches JRCT-shaped drift | Moderate cost, uses existing machinery |
| **Badge undated rows as unverified** | User-visible hedge | Weakens confidence in rows that are genuinely fine |

**Recommendation: the middle two, together.**

1. Separate "we know this is rolling" from "we have no deadline". Today they are
   the same field. `is_rolling` is set on 395 of the 560 undated rows and is
   effectively derived from the absence of a deadline, so it carries no
   information. A row that has never been confirmed rolling should not say
   Rolling. That is an interface and data-model change, **zero rows removed from
   the catalogue**.
2. Put the undated rows on a re-read cycle (Proposal B) so a closure like JRCT's
   surfaces within the cycle rather than never.

Applied today this would **remove nothing** and **relabel 395 rows**. I would not
auto-unpublish anything: a wrongly removed funder is invisible and unappealable,
which is worse than one that is visible and marked uncertain.

---

## Proposal B — needs sign-off: recurring freshness check

**Scope.** The 560 live rows with no deadline, plus the 88 live rows with
`url_status = 'unchecked'`. Not the whole catalogue: the 181 dated rows are
already governed by expiry, and URL health is already good.

**Cadence.** N = 90 days, matching the existing `STALE_AFTER_DAYS = 90` in both
`cron/reenrich-stale` and `review-reasons.ts`, so nothing new has to be tuned.
560 rows over 90 days is about **7 rows a day**.

**How it fits existing machinery, with no new cron job.**
`cron/reenrich-stale` already runs daily at 03:30, already re-reads and re-tags,
already routes a material change to `pipeline_state = 'tagged_awaiting_review'`
with a provenance marker, and already has a `BATCH_LIMIT` of 6. Its current
selection predicate is brief-age based. The change is to **add the undated-row
population to that predicate**, not to build anything new. It is currently
disabled by default (`REENRICH_CRON_ENABLED !== 'true'`), so enabling it is
itself a decision.

The admin side needs no new surface either: a distinct provenance source string
gives it a filtered tab in `admin/urls`, the same way `system:reenrich_chain:v1`
already produces the Tag Review tab.

**Cost.** Per row the chain makes two Haiku 4.5 calls (enrich, `max_tokens`
4096; classify, single-row batch). At the repo's recorded Haiku 4.5 pricing of
$1/M input and $5/M output, and a typical ~4k-token input:

- input 4,000 × $1/1M = $0.0040
- output ~1,500 × $5/1M = $0.0075
- ≈ $0.0115 per call-pair, ≈ **£0.009 per row** at the repo's 0.79 USD→GBP factor

7 rows/day ≈ **£0.06/day, about £1.90/month**. A full one-off sweep of all 648
in-scope rows is **about £5.90**. This is small enough that cost is not the
deciding factor; throughput and review load are.

**Throughput impact.** 7 rows/day against a `BATCH_LIMIT` of 6 means the undated
population would consume the entire existing daily budget. Either raise the batch
limit or accept a longer cycle. Worth noting the batch limit was sized for a
5-minute cron that has only ever run daily.

**Caveats I could not resolve.**

- **No cron has ever recorded its actual token usage.** `cron_runs` exists (added
  2026-08-09) and can store a usage tally, but of 17 routes calling `recordRun`
  only `process-discovery-queue` passes usage through, and the enrichment chain
  discards it across self-HTTP boundaries. So the cost figure above is arithmetic
  from documented pricing, **not a measurement**. First real proof would come
  from wiring usage through on a canary run.
- I have not verified that fixing `grant_closed` would catch JRCT specifically;
  it is a plausible mechanism, not a tested one.
- Whether the 56 non-published-but-live rows should be visible at all is a
  separate policy question I have not assumed an answer to.
