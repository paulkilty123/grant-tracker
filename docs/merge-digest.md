# Merge digest

Finished branches waiting on Paul's go, newest first. One entry per branch: a
plain English line saying what it does, then the deploy gate evidence.

Nothing in the "Waiting" section is on `main`. `main` only moves on an explicit go.

The nine branches merged on 13 August have moved to
[`merge-digest-archive-2026-08-13.md`](merge-digest-archive-2026-08-13.md), so
this file only ever lists work that is actually waiting.

---

## Standing rule, added 2026-08-13: re-arming auto-publish is two steps

Set by Paul after a re-arm would have released a 19-row backlog unseen.

**Never arm and let it run in the same action.** The sequence is:

1. Call the route with `?dryRun=true` and read the would-publish list. That
   parameter overrides both `?apply=true` and `AUTO_PUBLISH_ENABLED`, so the
   question is safe to ask of an armed or disarmed production route.
2. Review the list.
3. Only then set `AUTO_PUBLISH_ENABLED=true`.

Arming does not publish "what happens next"; it publishes **everything currently
sitting in the queue that passes the gate**, including rows withdrawn since the
last run.

When gate policy `c3` lands, this belongs in the route rather than in a document:
a policy-version change should force a dry run before the first armed run under
the new version.

---

# Waiting

## `feat/field-evidence`

**What it does:** starts checking the catalogue against the funders' own pages on
a schedule, and gives a row somewhere to record what the page said. Until now a
check that agreed with us left no trace at all, and the engine that does the
checking had never once been run by anything other than a person typing ids.

Tranche 2 items 4 and 5 (`docs/tranche-2-design.md` §2, §4.2).

**Commits:** `389009b` (column and library), `cacca3f` (stamp from the command
line), `45e8902` (the engine's route, queue and kill switch), `d476a8c` (the
Pipeline line)

### The gap this closes

`field_provenance` answers "who last **wrote** this". It cannot answer "when was
this last **checked** against the funder's page", because `mergeFieldUpdate`
treats an unchanged value as `idempotent` and writes nothing. That rule is right
and should stay. Its consequence is not: a verification run that **agrees** with
the stored value leaves no record whatsoever. The engine has been computing a
`confirmed[]` array on every run since it was written and discarding it, because
there was nowhere to put it.

So "verified last week" and "never looked at once" are the same picture, on every
row, and that is the whole reason 53 of the 55 rows published in the week to
13 August carry no citation on their timing.

New `jsonb` column `field_evidence`, one entry per field:

```jsonc
"is_rolling": {
  "quote":      "Nominations open all year",
  "source_url": "https://movementforgood.com/",
  "checked_at": "2026-08-15T20:16:22.504Z",
  "by":         "verify:v1",
  "agrees":     true
}
```

Three design points, each of which had a wrong answer available:

- **`agrees` is three-valued.** `null` means we read the page and it did not
  address this field. That is **not** evidence and `isConfirmed()` returns false
  for it, but it is stored, because otherwise a silent page is indistinguishable
  from a page never read: the engine would re-read the same rows on every pass
  forever, and section A7's 137 timing-less rows would have nowhere to record
  their answer.
- **`agrees: false` also fails `isConfirmed()`.** A field the page contradicts is
  not merely unverified, it is known wrong. A gate that read "we checked and it
  disagreed" as satisfied would be worse than one with no evidence column at all.
  `isContradicted()` tells the two apart for reporting.
- **`source_url` is per field, not per row**, even though today every fact in a
  run comes from one page. It is what makes multi-page sourcing storable rather
  than merely possible.

Writes bypass `mergeGrantUpdate` deliberately. Recording that a page was read is
not a claim about what the value should be, so an `ai_*` check must be able to
stamp a field whose **value** an `admin:` source owns, or the 121 admin-pinned
amounts and 54 admin-pinned deadlines would be permanently unverifiable, which is
the opposite of the point.

The write goes through a `merge_field_evidence` RPC rather than a
read-modify-write, so concurrent stamps cannot lose each other, and it returns
the merged object so the caller can prove the write landed. A null return
**throws**: that is what a cron writing through a cookie-scoped client looks like
under RLS, and three crons in this codebase reported success while writing
nothing.

### The engine's home

`verify-row.ts` has worked for weeks and has never had a caller in the app. So
nothing in the catalogue has ever been checked on a schedule, and "when was this
row last read against the funder's page" has had no answer for any row.

`GET /api/cron/verify-rows`, `recordRun`-wrapped, four times a day
(`0 1,7,13,19 * * *`), **disarmed**: `VERIFY_ENABLED` is not set, so the
scheduled run reports the queue and fetches nothing. Arming it is one variable
and it is yours to set. A disarmed run still costs nothing and still answers
"how much is unverified", which today is:

| | |
|---|---:|
| Eligible to verify | 958 |
| Never checked | 951 |
| **Live, asserting their own timing, never checked** | **508** |
| Excluded (882 rejected or archived, 33 quarantined) | 915 |

**It writes `field_evidence` and nothing else.** No value on any row changes, so
it is safe to point at the live catalogue: a user cannot see a difference. It
deliberately does not move `pipeline_state` either — §12 proposes letting the
engine act unattended on the removal classes, that argument is sound, and the
decision is yours to make rather than mine to assume.

**Selection is in SQL, not in JavaScript.** "Oldest evidence first" is an
ordering over the contents of a jsonb column; fetching a window and sorting it in
JS is how this codebase has produced confident wrong answers before. Three bands,
so the 508 rows that assert timing with nothing behind them come first rather
than eventually.

**Every deadline is absolute from `startedAt`** and the run stops on the clock,
not on a count. `validate-urls` defined its third pass as "whatever is left" and
that pass got nothing on every run it ever made.

### A defect the live run found, and its fix

The first real run over three rows exposed something the design did not
anticipate. A page that fails the gate produces no facts, so it produced no
stamps, so **it could never drain from the queue** — it would come back at the
front of every run, four times a day, for ever. The catalogue holds 138 rows
whose page does not describe our fund. That is 552 pointless fetches a day.

Every visited row now carries a `_page_read` stamp recording the attempt and its
outcome, whatever happened. Proven by making the same call twice: the
`wrong_fund` row appeared in the first run and not the second, and
`neverChecked` fell by exactly three.

### Deploy gate

```
Regression: tsc clean. 192 tests pass (15 files), 26 of them new.
            eslint clean on all changed files. next build clean, route registers.
            vercel.json parses; 37 crons, 0 malformed, within the Pro limit of 40.
            Both migrations applied to prod and then PROVEN, not assumed:
              053 — a DO block asserted shallow merge preserves siblings,
                    same-key replace keeps siblings, a miss returns null, then
                    cleaned its probe row. EXECUTE granted to service_role and
                    postgres only, not anon or authenticated.
              054 — the batch function returns band 0 first, and the two rows
                    stamped earlier sort to positions 957 and 958 of 958. Had the
                    ordering been wrong they would not be last.
            Mutation-tested: relaxing isConfirmed() to accept a silent-page stamp
            fails 3 tests. The suite can fail.
            Run end to end against production rows five times, including the
            drain proof above.
Free-surface fingerprint: NOT APPLICABLE. No MCP route, tool, schema or response
            shape is touched. The column is not in grants_with_funder and no
            user-facing surface reads it.
Accent check: PASSED. The Pipeline page gains a text line. Zero accent lines
            touched, counted on the diff.
Named rollback: 7073226
```

**Not verified as a scheduled run.** The cron is disarmed and unmerged, so the
first live proof is whatever the first armed run reports.

---

# Decided, and what came of it

## Multi-page sourcing moved ahead of the engine's acting powers

Your call, 15 August, with the cheap guard added as cover in the meantime.
`docs/tranche-2-design.md` §11 is reordered accordingly. Also built on this
branch: `cf7c094` (the front-door guard), `94d5915` (multi-page sourcing).

**The guard.** `is_rolling = true` may no longer be confirmed *or* proposed from
a page that names no single fund. `false` is untouched: that only removes an
assertion. Measured against the live catalogue, 673 live rows, 227 on a front
door; of the 386 claiming rolling, **139 are withheld and 247 remain
confirmable**, so the engine still does most of its A6 work.

**Multi-page.** Three conditions now fire a hop instead of one: no funding
detail (unchanged), the gate passed but timing is unanswered, or the page covers
several funds and one is ours. Timing is the trigger because it is what the
surface asserts. Hard limits: 3 pages, 2 hops, 5 model calls, same domain, a
seen set across hops, 500ms between requests to a host, and stop as soon as
timing is answered so the common case costs nothing extra.

### The acceptance test now passes, on the third attempt

Both rows, 16 August, after the dated-cycle extraction (`01835e8`):

| Row | Result |
|---|---|
| Movement for Good — £1,000 Draws | `is_rolling` **contradicted, proposes false** |
| London LGBT+ Fund | full three-entry cycle, from which `nextCycleDeadline` derives **2027-08-12** |

That second date is the one §9 of the design set as this row's definition of
done. The engine reaches it on its own now.

**What changed.** The extraction asked for one closing date; a draws page states
three and it abstained. It now reads the whole schedule into `deadline_cycle`,
with the funder's own labels, day and month only. And a dated schedule is treated
as a **takedown**: once the page has named its rounds we are no longer guessing,
so a cycle contradicts a rolling flag rather than merely withholding it. That is
the difference between a row that stays wrong for ever and one that gets
corrected, and it only ever moves a row from "claims open today" to "we do not
say".

The cycle is proposed, never written. `expire-grants` and the admin sweep already
roll a deadline forward from `deadline_cycle`, so landing the cycle is enough,
and a second copy of that maths is exactly how those two came to share a bug.

### Two bugs the acceptance runs found, one of them live

**A single date off a multi-round page is one of several.** Asked for "the"
closing date, Movement for Good's homepage returned 18 October, from the £5,000
Animals & Wildlife draw, for our £1,000 draws row. Worse, that answer made timing
look *answered*, so the hop to the fund's own page stopped firing. A wrong date
is not merely wrong: it suppresses the machinery that would have found the right
one. A lone date from a page that plainly runs in rounds is now withheld.

**An announcement date is not a deadline, and this one was live.** The
opening-date fix filtered one word family and stopped there, because every cycle
in the catalogue then carried at most an opens/closes pair. Real schedules have a
third kind of date:

```
17 June       Fund Launches
12 August     Application Window Closes
30 November   Outcomes Communicated
```

The opening filter removed 17 June and then chose **30 November**, the day
decisions are published. A fundraiser would have planned against a date three and
a half months after applications shut. `nextCycleDeadline` is shared with
`expire-grants`, which writes dates onto rows unattended at 02:00, so this was a
live defect rather than an engine-only one. Now excluded: outcomes, decisions,
announcements, notifications, panels, trustee meetings, shortlists, interviews,
results, payments, reporting and completion. Unlabelled and neutrally labelled
entries still count, so the 288 bare day/month cycles behave exactly as before.

It is the same shape as the bug it sits beside, one class along, and worth naming
as a pattern: **a denylist answers "is it this bad thing", when the question is
"is it a deadline".**

### The earlier attempt, kept because the reasoning still holds

You set Movement for Good as the proof. Re-running `120e1d2a`:

```
pages: movementforgood.com  ->  /draws/1000  ->  /draws/special
is_rolling   silent
deadline     silent
```

**What passed.** The hop fires on the right condition and finds the right page:
`/draws/1000` scores near zero on the old funding vocabulary and was
unreachable before. The row **no longer certifies a false Rolling claim**, which
was the whole danger. Under `c3` it would not publish.

**What did not.** The engine does not yet *correct* the row. It reached the page,
quoted the draw dates under another field, and still returned nothing for
`deadline`, because the extraction asks for one closing date and that page has
three dated windows, so it abstains. Same shape as the amount extractor
abstaining on Movement for Good's two award tiers, recorded in §1(b).

**What it needs:** the extraction has to be able to return a dated *cycle*, not a
single date, and propose it into `deadline_cycle`. That is a real next piece,
not a tweak. I have not started it.

**A second defect the run found, fixed here.** The first multi-page attempt
reached `/draws/1000` and *still* certified `is_rolling` from "Nominations open
all year" sitting on that same page. Both sentences are true: nominations are
taken continuously, awards are decided in dated draws. So a rolling claim may
not stand on a page that also states dated windows. Two distinct day-and-month
dates plus round vocabulary, both required, because either alone over-fires.
That is the third instance in this file of a sentence being accurate about its
own subject and wrong about the field it was offered for.

The London LGBT+ Fund is the control and is unchanged: `round_closed`, deadline
contradicted, quoting the funder's own closing sentence.

---

## `discover-sweep` targeted slice: proved, not guessed

**Vercel's 300s function timeout killed it.** The runtime log says so verbatim:
`Task timed out after 300 seconds`, at 08:35:35 UTC on 15 August.

The Arts Council query took **192 seconds**, against a hardcoded estimate of 60.
The look-ahead check then asked whether there was room for the GLA query,
answered with the wrong estimate (192 + 60 = 252, under the 270s budget), and
launched a query that could never finish. Neither safety net could fire: the
parent's own `AbortSignal.timeout(250_000)` would not have tripped until
08:37:59 and the child's `maxDuration = 270` not until 08:38:19. The orphaned
child kept spending Sonnet 5 with web search for four and a half minutes after
its caller was dead.

`recordRun` writes `finished_at` only on a normal return or a catch. A runtime
kill is neither, so `ok IS NULL` is the correct and documented signature. It is
1 of 105 runs across 16 jobs in 30 days, so this is not systemic.

**The structural bug is one line of arithmetic:** for the targeted slice the
second query's abort deadline is *unreachable by construction*. Any query
starting later than 50s in has `start + 250s > 300s`, so the timeout that exists
to prevent this can never fire first. The general slice survives only because it
runs exactly one query starting at elapsed zero, and even that took **247 of 270
seconds** on the 15th. It is 23 seconds from the same cliff.

**All three built, `b93bf42`:**

1. **Split into one query per invocation.** `?slice=targeted-ace` on odd days,
   `?slice=targeted-gla` on even ones, the shape `crawl-grants?batch=N` already
   uses. Proved disjoint and jointly covering every day of the month. Removes the
   arithmetic rather than correcting it, and alternate-day scheduling makes it
   free: one funder a day instead of two every other day.
2. **The abort is derived from the budget actually remaining**, never a constant,
   so a future overrun returns through `recordRun` as a visible failure. The
   look-ahead also gates on a 200s floor rather than a 60s mean, because a mean
   cannot bound a worst case and using one as a ceiling is what let the doomed
   query start.
3. **The alarm.** `reapAbandonedRuns` runs at the top of every `recordRun`:
   anything open longer than fifteen minutes, five times Vercel's hard cap, is
   closed as `ok = false`, which the Pipeline page already renders red. No new
   cron entry, no new schedule to forget, and with 38 jobs a day the detection
   lag is minutes rather than the four days this one took. It reuses the existing
   red rather than inventing a second signal nobody watches, and it can never
   throw: bookkeeping that breaks the job it observes is worse than none.

   **Proved against production**: it found and closed the real 15 August row.
   One open row before, none after.

---

# Decisions

## The single-page reader certifies front-door claims. `c3` cannot be armed on it.

**Settled 15 August: multi-page moves first, plus the cheap guard. See above.**
Kept here because it is the reasoning behind the reorder.

The first live stamping run went over two rows. One worked exactly as designed.
The other did something worse than fail.

**London LGBT+ Fund** — outcome `round_closed`, `deadline` stamped
**CONTRADICTS**, quoting the funder's own page:

> "Wednesday 12 August 2026 Application Window Closes The fund will close to
> applications at 12pm noon."

That is the machinery working. A contradiction is now recorded somewhere other
than a console.

**Movement for Good — £1,000 Draws** (`120e1d2a`, live) — `is_rolling` stamped
**AGREES**, quoting:

> "Nominations open all year"

The quote is real, it is on the page, and it is grounded. And it certifies the
exact claim the row was pulled up for on 12 August. Nominations are collected all
year; awards are made in six dated draws, which is why our own catalogue carries
a sibling row (`921bffd3`, £5,000 Special Draws) with a dated deadline of
24 May 2026. The surface renders `is_rolling = true` as **Rolling**, a positive
claim that you can apply and be considered today.

The engine never saw the draw dates, because they are on a subpage and the hop
only fires when the first page has **no funding detail at all**. `movementforgood.com/`
is rich in funding detail. So the hop did not fire, the page was silent on
`deadline`, and the model reached for the one timing-ish sentence it could see.

**Why this is a decision and not a bug fix.** §3 designs `c3` so that a quoted,
agreeing stamp on `is_rolling` is sufficient to publish. This run shows a quoted,
agreeing stamp being produced for a row that is wrong, from a page that is
honest — the page is simply not the whole story. §11 currently orders multi-page
sourcing **last** (12), after `c3` arms (10). On this evidence that order is
backwards: arming `c3` on single-page evidence would not raise the bar, it would
put a citation under the same errors.

I see three ways forward and I have a recommendation:

1. **Move multi-page sourcing (§7.2) before `c3` arms.** §12 already says it is
   "required, not deferred" on the strength of A2's 138 rows; this is a second,
   independent reason. **Recommended.**
2. **Refuse to confirm `is_rolling` from a front-door URL.** Cheap, computable —
   §3.1 already found seven of twelve bad rows pointing at a funder's front
   door — and it fails safe. But it only narrows this one field.
3. **Accept it and let `c3` arm on single-page evidence.** I would not: it makes
   the citation the thing that is wrong, which is harder to spot than no citation.

Not urgent, in the sense that nothing reads `field_evidence` yet. It is only
urgent relative to `c3`, and `c3` is items away.

**I have deliberately left the Movement for Good stamp in place.** It is
misleading as evidence and accurate as a record: it is the proof of this finding,
and deleting it would be tidying away the only thing that demonstrates the
problem.

---

# Since the merge — what the crons have and have not proven

Two nights have run on the 13 August merge. The scorecard is mixed and one item
is worse than mixed.

| Fix | Status |
|---|---|
| `AUTO_PUBLISH_LIMIT=0` means stop | **Proven.** `applyLimit: 0`, `armed: false`, `written: 0` on both the 14th and the 15th. |
| Discovery slice split | **Proven.** The `general` slice ran both days and queued 13 then 11 social investment rows — the category that had never once been searched. |
| Cycle-label opening dates | **Unproven, and may stay that way.** `expire-grants` ran clean both nights with `rolledCount: 0`. It selects `is_active = true`, and the rows that need a roll are mostly in the dead zone. It cannot prove itself until the drain runs. A green run of zero rows is not evidence. |
| `validate-urls` queue-first | **Proven, 16 August.** Before: `reviewQueue {checked: 0}`. After: `{candidates: 60, checked: 60, skipped: 0, atLimit: true, dead: 10}` — exactly the fingerprint predicted. It found **10 dead links** on its first run, among them Enable and Invest Grants and Access Growth Fund, two of the twelve rows §3.1 recommended pulling. |
| Reject button | **Proven, incidentally.** Movement for Good Awards (`e05d267d`) is now `is_active = false`, `pipeline_state = 'rejected'`. It was still public on 13 August. |

**One new defect.** The `discover-sweep` `targeted` slice started at 09:30 on
15 August and never reported back: `ok IS NULL`, no `summary`, no `error`, no
`finished_at`. By `cron_runs`' own documented convention that means a crash or a
timeout. It is the alternate-day slice, so the next scheduled attempt is the
17th. Not chased yet.

**The queue behind the brake is growing.** `publish` was 70 on the 13th, 76 on
the 14th, 88 on the 15th; `queueSize` 121 → 127 → 141. The brakes are holding,
but whatever gets reviewed before arming gets bigger every day.

---

# The review session: what is and is not ready

Measured 16 August, against the live queue.

**The queue is 163. The gate would publish 94 of them, 53 newly visible.**
Blocked: 19 attention (10 `amount_ungrounded`, 7 `amount_pot_suspected`,
2 `page_unreadable`), 50 hold (18 `link_dead`, 10 `no_brief`, 8
`applicant_individual_only`, 7 `deadline_passed`, and a tail).

**Nought of the 163 carries a single evidence stamp.** The engine is disarmed,
so nothing in the queue has been read against its funder's page. Every reason on
the review screen is derived from what the row already holds, not from what the
funder says. The one genuine external check is the link, and that is in good
shape because of the queue-first fix: of the 103 rows not yet public, 76 are
`url_status = ok` and 59 were checked in the last three days. Eight have never
been checked at all.

**Of those 103, 48 claim rolling and 30 state no timing whatsoever.** So 78 of
them assert or omit the one thing the surface turns into a claim, with nothing
behind it.

**The Review Inbox does not render `field_evidence`.** Confirmed by grep: the
column appears in no file under `src/app` or `src/components`, and it is not in
the review page's column list. So even after the engine runs, the review screen
would look exactly as it does today. That is a piece of work, not a setting.

## Recommended order

1. Merge, so the announcement-date fix reaches the nightly job.
2. Run the engine over the queue: 163 rows at ~60 a run, four runs a day, so
   under a day and roughly £1.50.
3. Build the evidence panel on the review row, so a decision has the quote and
   the source URL beside it.
4. Then the review session.
5. Then arm, two-step, with `AUTO_PUBLISH_LIMIT=5`.

At a cap of 5 and 41 already-live rows published first, the first eight or nine
days change nothing a user can see while exercising the whole write path. That
is the canary, and it is deliberately dull.

---

# Waiting on you: the cadence design

`docs/verify-cadence-design.md`, proposal only, nothing built. Two corrections
to the brief are in it and both change what is worth building:

- **`check-watchlist` is not daily.** Sundays and Wednesdays, 120 entries a run,
  239 active, so a **7-day full cycle with zero headroom**.
- **It does not cover the catalogue.** 54 of 963 eligible rows (5.6%) have an
  exact-URL watchlist entry, 261 (27%) share a host, and **134 of 239 watchlist
  entries map to no eligible row at all**. There is no foreign key and no code
  joins them. It is a discovery instrument, not a mirror of the catalogue.
- **The change signal is mostly cosmetic.** ~14 of 17 changes on 16 August were
  news carousels, jobs boards, blog lists, a maintenance banner and a typo fix.
  Essex Community Foundation has fired 14 times in 24 cycles.
- **387 alerts, none ever resolved**, growing ~54 a week.

So the watchlist earns a targeted role rather than the general one, and the
single most valuable item in the design is a join that was never built: **44 rows
sit in `between_rounds_scheduled` and exactly one is watched**, because the
manual admin button enrols them and the automatic transition in `grant-merge.ts`
does not.

The three shapes, sized: **198** evidenced always-open (180 days), **474** dated
(windows around the dates, no clock), **402** read but silent on timing
(14 → 28 → 56 → 112 → 180, reset on any answer).

Recommended order is in §6 and is deliberately not the order of interest: the
silent backoff first, because it is the smallest change and saves the most reads.

---

# Done, no longer waiting

| Action | Status |
|---|---|
| `AUTO_PUBLISH_ENABLED=false` in Vercel | Set 2026-08-13. Confirmed on two scheduled runs since. |
| `AUTO_PUBLISH_LIMIT=0` in Vercel | Now live, and now means stop rather than uncapped. Second independent brake. |
| `PROCESS_DISCOVERY_ENABLED=true` in Vercel | Running daily, 10 processed per run. |
| `ADMIN_SECRET` rotated | Verified consistent. |
| Migration `053_field_evidence` | Applied to prod 2026-08-15, before the file was committed, per the house convention. |
