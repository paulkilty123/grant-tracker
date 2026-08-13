# Tranche 2 — the verification engine, evidence stamps, and the publish bar

Design proposal. Nothing here is built. Written 2026-08-13, after the publish bar
let three wrong rows through on 12 August.

---

## 0. What went wrong, in one paragraph

On 12 August the gate published 18 rows, 12 of which had never been visible
before. Two of them (The Bromley Trust — Human Rights, — Prison Reform) went
live pointing at a generic `/apply-for-funding/` page. One (Movement for Good
Awards) went live saying "Rolling, £1,000–£25,000" against a funder page that
states six dated draw windows and awards of £1,000 and £5,000. All three passed
the gate legitimately: the gate's rule is *block on wrong, not on missing*, and
an unchecked link and an unevidenced rolling flag both read as **missing**.

They are not missing. The row asserts them. That is the change this document
designs.

---

## 1. The three silences behind Movement for Good

Worth stating precisely, because the obvious diagnosis is wrong and the fix
follows from the real one.

**The obvious diagnosis — "older higher-trust provenance blocked the write" — is
not what happened.** The row's `field_provenance` shows `amount_min`,
`amount_max` and `is_rolling` all stamped `discovery:gemini` (trust 25) on
11 August. The re-read wrote as `ai_enrich:v2` (trust 60). 60 outranks 25, so
the trust ladder would have allowed the write. Nothing was refused.

Three separate mechanisms each stayed silent:

**(a) Amounts are gap-fill only.** `enrich-grant/route.ts:796-801` writes a
derived amount **only when the stored field is NULL**. Movement for Good already
held 1,000 / 25,000, so no write was attempted. This is deliberate and the
reasoning in the comment is sound — the extractor disagreed with the stored
value on 18 of 60 rows in a dry run, and several of those disagreements were the
extractor being wrong. The policy is right. Its safety net is what failed.

**(b) The safety net did not fire.** The gap-fill policy explicitly says: "if a
value already exists and the derived one differs materially, DO NOT overwrite.
Record the discrepancy instead." At a `CONFLICT_RATIO` of 2, a stored £25,000
against a per-applicant £5,000 is 5.0× and should have raised
`amount_pot_suspected`. The row's `raw_data.checks` is **null** and
`needs_intervention_reason` is **null**. No flag exists. So the one mechanism
designed to catch exactly this case produced nothing, and the reason it produced
nothing is that the amount extractor never derived a figure to compare against
(it reads prose for a single range; "£1,000 for general draws … £5,000 for
themed special draws" is two ranges and it abstained).

**(c) `enrich-grant` cannot write `deadline` or `is_rolling` at all.** Not
blocked — absent. Grep the route: it writes `deadline_cycle`, and never
`deadline` or `is_rolling`. The re-read read the page correctly, extracted all
six draw windows, and stored them in `deadline_cycle` with a verbatim citation.
Then it left `is_rolling = true` standing, because it has no code path that
could change it. **A row wrongly marked rolling can never be corrected by a
re-read.**

And the consequence compounds: `review-reasons.ts:429` only raises `no_deadline`
when `!row.is_rolling`. So `is_rolling = true` silences every downstream timing
check. It is a free pass, set by whichever low-trust source touched the row
first, and nothing in the system can revoke it.

### What Paul asked for: surface refused writes

Still worth building, but note the scope. `mergeGrantUpdate` returns
`rejected: { field, reason }[]` — reason is one of `idempotent | pinned |
lower_trust`. **It does not carry who blocked it, when, or what value was
attempted**, so no UI could name the blocking source and date even if it wanted
to. Two changes:

1. Widen the result to
   `{ field, reason, attempted, blockedBy: { source, set_at, pinned } }`.
2. Render it in the re-read panel with the same shape as the triage accept flow:
   *"Amount not updated — held by `admin:paulkilty1@gmail.com`, 26 Jul. Proposed
   £5,000. [Override]"*.

That is correct and cheap. It would not have caught Movement for Good, because
nothing was refused. Do both.

### Is there another batch of stale stamps?

Not on this row — Movement for Good carries no `admin:` stamps at all, so
nothing about it is a repeat of the Scotland batch.

**But there is one waiting for the engine.** Across live rows:

| Field | Admin-pinned, live rows | Of which, form-save signature |
|---|---:|---:|
| `amount_max` | 121 | — |
| `is_rolling` (pinned **true**) | 29 | 15 |
| `deadline` | 54 | — |

"Form-save signature" means the pin was stamped in the same second as four or
more other fields — the fingerprint of Grant Manager writing its whole form
state, not of a human deciding that value. Dates run 26 May to 29 July, i.e.
almost entirely before the 26 July fix. These are artefacts, not judgements.

The consequence: **the engine's first run will propose changes to rows whose
values are admin-pinned, and every one of those proposals will be silently
refused.** That is the same failure Paul saw on Movement for Good, arriving at
scale. So §1's refused-write surfacing is not a nicety that can follow the
engine — it is a **precondition for the engine's first run**, and the order in
§8 reflects that.

Do not bulk-strip these pins. Surface them per row with the override, and let
the engine's own evidence be the argument for unpinning each one.

---

## 2. Evidence stamps — the new primitive

The gate cannot require evidence until evidence is a thing the row can hold.
Today it is not, and the reason is structural.

`field_provenance` answers **"who last wrote this, and when"**. It cannot answer
**"when was this last checked against the funder's page, and what did the page
say"**, because of a rule that is deliberately in the system and should stay:
`mergeFieldUpdate` treats an unchanged value as `idempotent` and writes nothing.
Confirming that a machine got it right is not the same as deciding it must never
improve. So a verification run that *agrees* with the stored value leaves no
trace at all.

Those are two different questions and conflating them is what makes this
impossible. So: a new JSONB column, `field_evidence`, parallel to
`field_provenance`.

```jsonc
{
  "is_rolling": {
    "quote":      "Draw 1 23-27 March. Draw 2 7-11 September. Draw 3 1-16 December.",
    "source_url": "https://www.movementforgood.com/draw-dates",
    "checked_at": "2026-08-13T09:14:22Z",
    "by":         "verify:v1",
    "agrees":     false          // page contradicts the stored value
  },
  "apply_url": { "…": "…" }
}
```

Properties that matter:

- **A confirmation is recordable.** `agrees: true` with no write. This is the
  gap that made the whole idea impossible before.
- **Every fact carries the URL it came from**, not the row's `apply_url`. This is
  what makes multi-page sourcing (§7) storable rather than just possible.
- **Written outside `mergeGrantUpdate`.** Evidence is not a content field and
  must not be subject to the trust ladder — an `ai_*` check must be able to
  record that it read a page even where an `admin:` value stands. The stamp
  records the reading; it does not change the value.
- `apply_url` is the exception: its evidence already exists as
  `url_status` + `url_last_checked`. No new storage. The gate reads those.

The verification engine already produces exactly this shape.
`verify-row.ts` returns `Fact<T> = { value, quote }` for `deadline`,
`is_rolling`, `max_org_income`, `is_invite_only`, `still_listed`, `is_grant`,
plus a `confirmed[]` array of fields the page agreed with. It has been
throwing the confirmations away.

---

## 3. Gate policy `c3`

Current policy `c1` (`c2` is on an unmerged branch). The rule stands with two
named exceptions.

> **Block on wrong, not on missing — except for the fields the surface asserts.
> For `apply_url` and open/rolling status, unverified IS wrong.**

The justification is the same one that put `eligibility_missing` in the blocking
set. A missing amount renders as absent and misleads nobody. But the card does
not render "we have not checked this link" — it renders a live-looking Apply
button. It does not render "we do not know the timing" — it renders the word
**Rolling**, which is a positive claim that applications are open today. The
surface asserts both. Asserting something we have not checked is wrong, not
missing.

Two new codes, both `block`:

| Code | Fires when | Cleared by |
|---|---|---|
| `link_unevidenced` | `url_status != 'ok'` **or** `url_last_checked` older than 90 days **or** null | a `validate-urls` pass, or the engine |
| `timing_unevidenced` | `is_rolling = true` **or** `deadline` non-null, and `field_evidence` has no entry for that field within 90 days | the engine |

And `link_unverified` (currently `info`) is retired into `link_unevidenced`. Its
header comment justifies the `info` classification on the grounds that 57 of 60
rows were "never validated, rather than validated and found bad" and that this
was "fixed separately". **It was not fixed.** See §4.1.

Three changes that make this safe to turn on:

1. **`c3` applies to `hold`/`publish`, not to retraction.** The existing
   live/not-live split already encodes this: a blocking reason on an
   already-visible row produces `attention`, not deactivation. Keep that. The
   new codes make rows *wait*; they do not pull anything by themselves.
2. **Arm it behind the engine.** Turning `c3` on before the engine can produce
   evidence would take the publish rate to near zero — measured, only **2 of the
   55** rows published in the last week carry any timing citation. Order:
   engine ships → engine runs → `c3` arms. Not the reverse.
3. **Arming is two steps, and `c3` must enforce it in code.** Standing rule set
   by Paul, 2026-08-13:

   > I review the dry run's would-publish list first, then arm. Never again a
   > re-arm that publishes a backlog sight unseen.

   Arming does not release "what happens next" — it releases **everything
   currently in the queue that passes the gate**, including rows withdrawn since
   the last armed run. Measured the same day: with the gate disarmed, the dry run
   reported `publish: 19`, all 19 `newlyVisible`, and those 19 were exactly the
   rows pulled from public view hours earlier. Arming without looking would have
   silently undone the retraction and looked like an ordinary morning.

   Today this is a documented habit, which is the weakest kind of control. Under
   `c3` it should become a mechanism: **a run under a policy version that has not
   had a reviewed dry run is forced to `dryRun`.** Store the acknowledged version
   next to the arming flag; when `GATE_POLICY_VERSION` moves, the acknowledgement
   goes stale and the first run under the new policy can only report. A policy
   change then cannot publish its own backlog, and the protection does not depend
   on who is paying attention that morning.

   This is also the answer to a real hazard sitting in the queue right now: 19
   withdrawn rows are one environment variable away from going back out.

### 3.1 The audit: what `c3` would have caught, and what to pull now

All 55 rows the gate published in the seven days to 13 August:

| | Count |
|---|---:|
| Published | 55 |
| Already visible before the gate touched them | 33 |
| **Newly exposed by the gate** | **22** |
| Link verified (`url_status = 'ok'` and checked) | 43 |
| Timing evidenced (any citation on `deadline` or `is_rolling`) | **2** |
| **Would pass `c3` as written** | **2** |
| Rolling **and** holding dated `deadline_cycle` entries — self-contradicted | 6 |
| `apply_url` supplied by a discovery source | 10 |

**53 of 55 fail the new rule.** That number is not a retraction list, and
reading it as one would be a mistake: they fail because the evidence stamp does
not exist yet, not because 53 rows are wrong. `c3` is a bar for *publishing*, and
the gate's own live/not-live split already says a blocking reason on a visible
row means `attention`, not deactivation.

**Recommendation: pull 12.** The rows the gate made newly visible on a link
nothing has ever fetched. Pulling them restores the state of a week ago, so no
user loses anything they previously had.

| Row | Type | apply_url | Published |
|---|---|---|---|
| Movement for Good Awards | grant | `movementforgood.com/` | 12 Aug |
| Asda Foundation Grants | grant | `asdafoundation.org/` | 12 Aug |
| Ashoka Fellowship | programme | `ashoka.org/en-gb` | 12 Aug |
| Co-op Local Community Fund | grant | `coop.co.uk/local-community-fund` | 12 Aug |
| Power to Change Community Business Funding | grant | `powertochange.org.uk/our-funds/` | 12 Aug |
| Enable and Invest Grants | programme | `lloydsbankfoundation.org.uk/our-funding/` | 12 Aug |
| Access Growth Fund (Blended Finance) | **investment** | `access-socialinvestment.org.uk/our-work/growth-fund/` | 12 Aug |
| Social Investment Business Loan & Grant Funds | **investment** | `sibgroup.org.uk/` | 12 Aug |
| National Portfolio Investment Programme 2028-33 | programme | `artscouncil.org.uk/…` | 12 Aug |
| The Bromley Trust — Human Rights | grant | (link fixed by hand 13 Aug, not re-checked) | 12 Aug |
| The Bromley Trust — Prison Reform | grant | (link fixed by hand 13 Aug, not re-checked) | 12 Aug |
| Bentley national grants programme | grant | `bentleymedia.com/en/newsitem/1787-…` | 10 Aug |

Seven of the twelve point at a funder's front door rather than a fund page —
the same shape as Bromley's `/apply-for-funding/`, and precisely the shape §7's
multi-page reader exists to resolve.

Two of them are **investment**, which is the differentiator, and one of those
carries `amount_min = £5` — a discovery artefact that nothing caught. The
Bentley row is a press release, not an application page.

**Leave live, mark `attention`: 5.** York Community Fund, HPC Community Fund
Small Grants, Ilford Community Fund, National Lottery Heritage Grants
£250,000–£10m, The Randal Foundation Small Grant. Each is rolling **and** holds
dated cycle entries, so each contradicts itself — but all five were already
visible before the gate touched them, and pulling a long-live row over a
contradiction we have not yet read the page to resolve does more harm than the
contradiction. They go to the front of the engine's queue.

**Leave live, no action: 38.**

> **The Movement for Good rejection did not take.** Checked 13 August:
> `is_active = true`, `pipeline_state = 'published'`, `rejection_reason = null`.
> The row is public right now. The one silent path in that code is
> `ReviewQueue.tsx:343` — `if (!reason || !reason.trim()) return`, so cancelling
> or emptying the reason prompt aborts the reject with no toast and no other
> signal. Worth fixing on its own account: a destructive-looking button that
> does nothing and says nothing is the same class of defect as the rest of this
> document.
>
> Separately, that fund is in the catalogue **twice** — `discovery-movement-for-
> good-awards` (this row) and `cw-2026-05-06-movement-for-good-1k`, both live,
> both published, with different amounts. Discovery's dedup did not catch it.

---

## 4. The engine's home

### 4.1 First, the bug that made this urgent

`validate-urls` runs Sunday and Wednesday at 03:00 in three passes. Pass 1 checks
active rows; pass 2c checks the withheld review-queue rows — the ones a newly
discovered fund sits in. The 12 August run:

```
scraped:     checked 645, skipped 37
recovery:    checked 0
reviewQueue: checked 0
budgetExceeded: true
elapsedMs: 276697
```

Pass 1 spent 277 seconds of a 300-second function on 645 active rows and
exhausted the budget. **Pass 2c checked zero rows.** It always will: it runs
last, and pass 1 grows with the catalogue.

So the chain on 11–12 August was:

```
23:06  discovery writes 12 rows, url_status = 'unchecked'
03:00  validate-urls burns its budget on active rows; checks 0 of the 12
09:00  auto-publish treats link_unverified as 'info'; publishes all 12
```

A newly discovered row **cannot** get a link check before it publishes. Fix this
first and independently of everything else: give pass 2c its own budget slice
(propose 25% reserved), or split it into its own cron. It is a live defect, not
part of the engine build.

### 4.2 Route, schedule, storage

`verify-row.ts` exists and works. It has no caller in `src/app` — it has only
ever been run from scripts. That is the whole of "give it a proper home".

**Route.** `POST /api/cron/verify-rows` — `recordRun`-wrapped so it lands on the
Pipeline page like every other job, with a per-run summary line
(`checked / confirmed / proposals / fixable links / spend`), consistent with the
discovery yield line.

**Selection.** Oldest-evidence-first, exactly the ordering `validate-urls` pass 1
uses (`order by checked_at nulls first`). This makes the queue self-draining and
means no row can be starved.

**Batching.** Measured shape: a page fetch is up to 12s, a Haiku call ~4s, so a
row is ~16-22s serial. Vercel's cap is 300s. At 5-way concurrency that is
**~65 rows per run**. So:

| Catalogue | Runs for a full pass | At 4×/day |
|---|---|---|
| 750 rows | 12 | 3 days |
| 2,000 rows | 31 | 8 days |

Propose four runs a day (`0 1,7,13,19 * * *`), giving a full re-verification
cycle of ~3 days now and ~8 days at 2,000 rows. Both are well inside any
sensible freshness window and neither needs a schedule change as the catalogue
grows — the cycle just lengthens honestly.

**Storage.** Three writes per row:
1. `field_evidence` — the stamp, always.
2. Confirmed values — nothing (that is the point of the stamp).
3. Proposals — **not auto-applied.** Into the review queue as they are today.
   The engine's job is to produce evidence, not to decide.

Exception worth arguing for: a proposal that only ever *removes* an assertion —
`is_rolling: true → false` where the page names dated windows — could apply
automatically, because it can only ever move a row from "claims open" to "we do
not say". That is strictly safer than the status quo. Flagging it as a decision
for you rather than assuming it.

**Kill switch.** `VERIFY_ENABLED`, same pattern as the discovery flag.

---

## 5. The watchlist reader

`check-watchlist` runs Sunday and Wednesday at 04:00 and produces
`listing_changed` alerts that nothing reads. The reader:

- On `listing_changed` for a row in `between_rounds_scheduled`, queue it for the
  verification engine at the **front**, not the back.
- The engine's existing outcomes already answer the question: a `deadline` fact
  with a future date and a quote means it reopened; `still_listed: false` means
  it is gone; `no_funding_detail` means the change was cosmetic.
- A reopen candidate lands in the review queue as *"this may have reopened"*
  with the quote and the source URL, and does **not** auto-publish — a reopen is
  a positive claim about timing and falls squarely under `timing_unevidenced`
  until a human agrees.

This is a small piece of work once the engine exists, which is why it belongs in
the same tranche rather than its own.

---

## 6. Explicit goal of the first scheduled runs

Standing instruction from the catalogue health ledger, section A6, carried here
verbatim:

> Resolving "genuinely rolling vs unread deadline" with evidence should be an
> explicit goal of the engine's first scheduled runs.

**396 live rows** claim Rolling, and **all 396** carry no evidence behind the
claim — not one has a citation on `is_rolling`. (The ledger recorded 380 on
12 August; the cohort grows every time discovery adds a row, because
`is_rolling` is the default assumption when no date is found.) So the first pass
is not oldest-evidence-first; it is that cohort, ordered by how many users could
act on the row. Success is not "396 rows checked" — it is **396 rows where
`field_evidence.is_rolling` exists**, each one either a quote saying the funder
accepts applications at any time, or a proposal to unset the flag. Report the
split. A row that comes back with neither is a page-sourcing failure and belongs
in §7's evidence, not in the "done" column.

Same treatment, at the same time, for the 12 rows in §3's audit that are live on
a link nothing has ever fetched.

---

## 7. Page sourcing: today, and the next step

### 7.1 What happens today

Two different readers, both single-page, and they do not behave the same.

**`enrich-grant`** — the re-read behind the admin button. Fetches `apply_url`
direct with browser-ish headers. On failure, and only if `READER_PROXY_URL` is
set, retries through the reader proxy. If both fail it writes the brief from the
model's memory and marks it `knowledge_fallback`. **It never follows a link.**
One page, one shot.

**`verify-row`** — the verification engine. Same fetch, plus a hop:

1. Fetch `apply_url` direct → gate + extract in one model call.
2. If the gate failed for a reason a better render could fix (`no_content` or
   `no_funding_detail`) and the proxy is configured, refetch through the proxy
   and re-run.
3. **The hop.** Only if the best result so far still fails **and the failure is
   exactly `no_funding_detail`**, follow *one* candidate link and re-run.

`candidateLinks()` picks the target: same host (with `www.` stripped, because a
strict host match rejected all twelve links on the Julia Rausing Trust site),
no PDFs or images, must match `/grants?|funding|apply|eligib|criteria|
programmes?|how-to-apply|open-funds?|what-we-fund|guidelines/`, must not match a
noise list (`news|blog|privacy|careers|donate|shop|…`) unless the path itself is
a funding path. Scored by `hits × 2 + 3 if the path matches − depth`, top 3 kept,
**top 1 followed**.

**So the hop fires under exactly one condition: the page we read was the right
fund's page but contained no funding detail at all.** That is a narrow door, and
it is the wrong door for the case in front of us.

Movement for Good's homepage is *not* detail-free. It describes the awards, the
nomination process, the causes. It passes the gate. So the hop never fires — and
the draw dates, which live on a subpage, are never read. The engine returns a
confident "verified" on a page that does not contain the answer to the question
that matters. Same shape for Asda Foundation (`asdafoundation.org/`), Power to
Change (`/our-funds/`), Social Investment Business (`sibgroup.org.uk/`): rich
front doors, detail one level down.

Two more limits worth naming:

- **One URL per row, not per fact.** `VerifyResult.followedUrl` records *the* page
  the answer came from. There is nowhere to say "eligibility came from
  `/who-we-fund`, dates came from `/draw-dates`". §2's `field_evidence` fixes
  this and is a precondition for anything below.
- **The reader proxy is per-fetch, not per-row**, so a hop target on a WAF'd host
  gets no proxy retry. Minor, but it is why a hop sometimes returns nothing on a
  site whose first page needed the proxy.

### 7.2 Proposed next step: gather from up to three pages

Not a crawler. A bounded, purposeful second and third read, fired by a *missing
answer* rather than a *failed page*.

**When a hop fires** — replace the single `no_funding_detail` condition with
three, any of which fires:

| # | Condition | The case it fixes |
|---|---|---|
| 1 | Gate failed with `no_funding_detail` | today's behaviour, unchanged |
| 2 | **Gate passed, but a required field came back `notFound`** | Movement for Good: page is right, answer is elsewhere |
| 3 | **Gate returned `multiple_funds` and one named fund matches our title** | Forever Manchester: go to the specific fund's own page |

"Required" means the fields the surface asserts — `is_rolling` / `deadline`, and
eligibility. Not amount: an absent amount renders as absent and is genuinely
missing, so it does not earn a fetch. This keeps the trigger tied to the same
principle as §3, which is what stops it becoming "fetch more, generally".

**Link selection for condition 2** biases differently from today. The current
scorer looks for *funding* pages; a row that already has funding detail and
lacks dates should be looking for a *timing* page. Add a second vocabulary —
`dates|deadlines?|draws?|rounds?|closing|when-to-apply|key-dates|timetable|
schedule` — weighted by what is actually missing. Movement for Good's
`/draw-dates` scores near zero on today's vocabulary.

**Limits, all hard:**

| Limit | Value | Why |
|---|---|---|
| Domain | same registrable domain only | a link off-site is someone else's claim |
| Pages per row | **3** (`apply_url` + 2) | two hops reaches "homepage → funding → this fund"; three is a crawl |
| Depth | 2 hops from `apply_url` | same |
| Model calls per row | 5 hard ceiling | includes proxy retries; a circuit breaker, not a target |
| Repeat visits | none — normalised-URL `seen` set | already in `candidateLinks`, extend it across hops |
| Stop early | when every required field is evidenced | the common case costs nothing extra |
| Politeness | ≤1 concurrent request per host, 500ms gap | we are reading three pages now, not one |

**Evidence per page** is the point of the exercise: each `Fact` gains
`source_url`, and §2's `field_evidence` stores it per field. A row can then
honestly say its eligibility came from one page and its dates from another,
and each is separately re-checkable and separately stale-able.

**Cost.** One page read is ~12,000 chars ≈ 3,000 tokens, plus ~900 tokens of
prompt, ~400 out. On Haiku 4.5 ($1/$5 per M) that is **~0.6p per page read**.

| | Pages/row | Cost/row | 750 rows | 2,000 rows |
|---|---|---|---|---|
| Today | 1.0 | 0.6p | £4.50 | £12 |
| Proposed, expected mix (70/20/10) | 1.4 | 0.85p | £6.40 | £17 |
| Proposed, every row at the cap | 3.0 | 1.8p | £13.50 | £36 |

At four full passes a year that is **£26/year today, £68/year at 2,000 rows** —
against a whole-system spend of roughly £110/year. The money is not the
constraint and should not drive this decision.

**Wall clock is the constraint.** 1.4 pages per row at ~16-22s serial is ~30s per
row, which cuts the per-run batch from ~65 rows to ~45 and stretches a full pass
from 12 runs to 17. Still 4 days at four runs a day. Acceptable, but it is the
number that moves, and it is why the cap is 3 pages and not 5.

### 7.3 What I am not proposing

- **No sitemap or search-endpoint discovery.** Tempting, unbounded, and a
  different piece of work.
- **No cross-domain following**, including to a community foundation's shared
  application portal. That is a catalogue-structure question (one row per fund),
  not a sourcing one.
- **No hop in `enrich-grant`.** It is the human-in-the-loop path; you can already
  paste a second source. Adding autonomy where a person is already watching buys
  the least and risks the most. If the engine's multi-page read proves out, the
  right move later is for `enrich-grant` to *consume* the engine's evidence, not
  to grow its own fetcher.

---

## 8. Order of work

1. **`validate-urls` pass 2c budget** — live defect, standalone, small (§4.1).
2. **Refused-write surfacing** — widen `rejected`, render it (§1).
3. **`field_evidence` column + engine writes stamps** (§2).
4. **Engine route, schedule, Pipeline line** (§4.2).
5. **First runs: the 380 Rolling rows + the 12 unverified links** (§6).
6. **Gate policy `c3`, armed only once §5 reports coverage** (§3).
7. **Watchlist reader** (§5).
8. **Multi-page sourcing** (§7) — after §5 shows how many rows fail for
   want of a second page. That number is the business case, and we do not have
   it yet.

Note that 8 comes last on purpose. The single-page engine will tell us how big
the multi-page problem actually is, and that is a cheaper way to find out than
building it.
