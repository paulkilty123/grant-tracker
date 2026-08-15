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

**What it does:** gives a row somewhere to record that a human-readable sentence
on the funder's page was actually read, and what it said. Until now a check that
agreed with us left no trace at all, which is why the publish bar cannot ask for
evidence.

**Commits:** `389009b` (column, library, engine wiring), `cacca3f` (stamp from the command line)

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

### Deploy gate

```
Regression: tsc clean. 184 tests pass (15 files), 18 of them new.
            eslint clean on all four changed files.
            The migration was applied to prod and then PROVEN, not assumed: a DO
            block asserted shallow merge preserves siblings, same-key replace
            keeps siblings, and a miss returns null, then cleaned its probe row.
            Privileges checked: EXECUTE is granted to service_role and postgres
            only, not anon or authenticated.
            Mutation-tested: relaxing isConfirmed() to accept a silent-page stamp
            fails 3 tests. The suite can fail.
Free-surface fingerprint: NOT APPLICABLE. No MCP route, tool, schema or response
            shape is touched. The column is not in grants_with_funder and no
            user-facing surface reads it.
Accent check: NOT APPLICABLE. No UI.
Named rollback: 7073226
```

Verified end to end against two production rows, which is where the finding
below came from.

---

# Decisions

## The single-page reader certifies front-door claims. `c3` cannot be armed on it.

**This changes the order of work in `docs/tranche-2-design.md` §11 and I have not
changed it — it is yours to call.**

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
| `validate-urls` queue-first | **Unproven.** Next scheduled run is Sunday 16 August, 03:00 UTC. First thing to check: `reviewQueue.checked` non-zero, `atLimit` true. |
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

# Done, no longer waiting

| Action | Status |
|---|---|
| `AUTO_PUBLISH_ENABLED=false` in Vercel | Set 2026-08-13. Confirmed on two scheduled runs since. |
| `AUTO_PUBLISH_LIMIT=0` in Vercel | Now live, and now means stop rather than uncapped. Second independent brake. |
| `PROCESS_DISCOVERY_ENABLED=true` in Vercel | Running daily, 10 processed per run. |
| `ADMIN_SECRET` rotated | Verified consistent. |
| Migration `053_field_evidence` | Applied to prod 2026-08-15, before the file was committed, per the house convention. |
