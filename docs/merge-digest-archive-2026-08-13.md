# Merge digest archive — the 13 August tranche

These entries described nine branches that were **merged to `main` on 13 August
2026** (`48d2e67..6efea04`) and deployed. They are kept verbatim because the
reasoning in them is the record of why each change was made, and a merge commit
message is a worse place to look for it.

Nothing in this file is waiting on anyone. The live digest is
[`merge-digest.md`](merge-digest.md).

Two statements below were true when written and are no longer:

- the opening line "Nothing here is on `main`" — everything here is
- the correction saying `AUTO_PUBLISH_LIMIT` is inert — it merged on 13 August
  and is now live, verified at `applyLimit: 0` on the 14th and 15th

---

# Merge digest

Finished branches waiting on Paul's go, newest first. One entry per branch: a
plain English line saying what it does, then the deploy gate evidence.

Nothing here is on `main`. `main` only moves on an explicit go.

> Both current branches add this file. If git flags an add/add conflict on
> `docs/merge-digest.md`, take **this** version, from
> `fix/lifecycle-live-defects` — it already contains every entry.

---

## Standing rule, added 2026-08-13: re-arming auto-publish is two steps

Set by Paul after a re-arm would have released a 19-row backlog unseen.

**Never arm and let it run in the same action.** The sequence is:

1. Call the route with `?dryRun=true` and read the would-publish list. That
   parameter overrides both `?apply=true` and `AUTO_PUBLISH_ENABLED`, so the
   question is safe to ask of an armed or disarmed production route.
2. Review the list.
3. Only then set `AUTO_PUBLISH_ENABLED=true`.

This is not a nicety. Arming does not publish "what happens next"; it publishes
**everything currently sitting in the queue that passes the gate**, including
rows withdrawn since the last run. On 13 August the dry run reported
`publish: 19`, all 19 `newlyVisible` — the exact set pulled from public view
hours earlier. Re-arming without step 1 would have undone the retraction and
looked like a normal morning.

When gate policy `c3` lands, this belongs in the route rather than in a
document: a policy-version change should force a dry run before the first armed
run under the new version.

---

## `fix/validate-urls-queue-first`

**What it does:** makes sure a newly discovered fund actually gets its link
checked before anything can publish it. Until now the check that decides this
was the one job guaranteed never to run.

**Commit:** `3c60c21`

### The pass that gates publishing was the one that starved

`validate-urls` runs three passes. The third checks withheld review-queue rows,
which are `is_active=false` and therefore invisible to the catalogue sweep
(`is_active=true`) and to the recovery pass (dead rows only). It exists to break
a genuine deadlock: a row is held because its link is unverified, and nothing
else will ever verify it while it is held.

It ran last, on whatever budget the sweep left. It never got any. From the
2026-08-12 run, recorded in `cron_runs`:

```
scraped:     checked 645, skipped 37
recovery:    checked 0
reviewQueue: checked 0
budgetExceeded: true
elapsedMs: 276697
```

277 seconds of a 270-second budget spent before it was reached. This was not a
bad day: the sweep grows with the catalogue and this pass was defined as the
remainder, so it would have starved on every run forever.

The consequence is the 12 August incident. Twelve rows discovered at 23:06 on
the 11th were published at 09:00 on the 12th on a link nothing had ever
fetched — because the only job that could have checked them ran at 03:00 in
between and had nothing left by the time it got here.

This also retires a claim in `publish-gate.ts`, which classifies
`link_unverified` as informational partly on the grounds that the pass was
"fixed separately". The pass existed; the budget never reached it.

### The change

The review-queue pass runs **first**, with its own 60s slice of the 270s
budget, and its row limit rises from `RECOVERY_LIMIT` (40) to `QUEUE_LIMIT`
(60) — enough to drain the 121-row queue in about two runs and stay ahead of
discovery's daily additions after that.

Deadlines remain absolute from `startedAt`, so the run still finishes inside the
300s function cap. The sweep yields 60 of its 270 seconds. That trade is the
whole argument: an active row has been checked before and is already in front of
users, so delaying it one run costs a little staleness. Delaying this pass costs
a publish decision made blind.

The summary now reports `candidates` / `skipped` / `atLimit` for the pass. A
bare `checked: 0` read exactly like "nothing to do" for the entire time this was
broken, which is why nobody caught it.

### Deploy gate

```
Regression: tsc clean (only the pre-existing stale .next/types errors for
            deleted src/app/mcp/keys pages, identical on a clean baseline).
            eslint clean on the changed file.
            Budget arithmetic re-checked: all four deadlines are absolute from
            startedAt, so total wall clock is unchanged at 270s inside a 300s cap.
Free-surface fingerprint: NOT APPLICABLE. No MCP route, tool, schema or
            response shape is touched.
Accent check: NOT APPLICABLE. No UI.
Named rollback: origin/main at branch point.
```

**Not verified against a live run.** This is a cron and the next scheduled
invocation is Sunday 03:00. The starvation itself is proven from recorded run
data; the fix is reasoned from the budget arithmetic, not yet observed. First
run to check: `reviewQueue.checked` should be non-zero and `atLimit` true.

---

## `fix/reject-must-not-fail-silently`

**What it does:** makes the Reject button tell the truth. It could previously do
nothing, say nothing, and leave a wrong grant public.

**Commit:** `9761f7a`

### The emergency brake was a no-op

Movement for Good Awards was rejected in the Review Inbox on 12 August. It
stayed `is_active = true`, `pipeline_state = 'published'`,
`rejection_reason = null`, and remained public for a further day. Nothing on
screen said the brake had not engaged.

Three silent exits, all closed:

- **A cancelled prompt and an empty reason were the same branch.**
  `if (!reason || !reason.trim()) return` swallowed both, wordlessly. They are
  different intentions and now get different messages.
- **A dropped connection reached nobody.** The fetch promise rejected and the
  click simply did nothing.
- **HTTP 200 was treated as done.** It only means the request was understood.
  `mergeGrantUpdate` returns early without writing when nothing is actually
  changing, so a write that never landed was indistinguishable from one that did.

`patch()` gains an optional `expect` list. Reject and Publish now name the
fields the server must confirm it wrote (`is_active`, `pipeline_state`) before
either may show a success toast.

Publish is included deliberately: it is the other action a person treats as
final, and "Published X" over a row that never moved is the same lie in the
opposite direction.

### Deploy gate

```
Regression: tsc clean (same pre-existing stale .next/types baseline).
            eslint clean on the changed file.
            No behaviour change on paths that already reported correctly:
            the new argument is optional and unused by revertField and fixLink.
Free-surface fingerprint: NOT APPLICABLE. Admin surface only, no MCP contact.
Accent check: PASSED. Toast variants only, existing tokens, no accent added.
Named rollback: origin/main at branch point.
```

**Not verified in the browser.** The Review Inbox is behind an admin session and
I will not enter credentials. The assertion path is exercised by the shape of
`update-grant`'s response, which is already covered where `rejected` is read.
Worth one manual Reject after deploy to see the new confirmation wording.

---

## Correction, 2026-08-13: `AUTO_PUBLISH_LIMIT` is not live

Recorded here because the entry below and the table at the foot both read as
though the cap is in force. It is not.

The env-reading code is real and correct, but it lives in `dc40d4d` **on
`fix/eligibility-honest-surface`, which is unmerged**. Production reads the cap
only from `?limit=`, and `vercel.json` registers the cron path bare, so
`applyLimit` is `Infinity` on every scheduled run. Proven 13 August: the 09:00
run published 12 rows with `applyLimit: null` while `AUTO_PUBLISH_LIMIT=10` had
been set in Vercel for two days.

**The switch that does work is `AUTO_PUBLISH_ENABLED`.** Set to `false` and
redeployed on 13 August; verified against production, `armed: false`,
`dryRun: true`, `written: 0`.

**Pre-merge fix required on that branch:** `AUTO_PUBLISH_LIMIT=0` currently
falls through to uncapped, because the guard is `envLimit > 0`. Zero must mean
stop, not "no limit" — it is the value anyone reaches for to halt the job, and
it currently does the opposite of what it looks like. Do not merge that branch
until this is changed.

---

## `fix/lifecycle-live-defects`

**What it does:** turns discovery back on properly, so the catalogue starts
finding social investment again, and stops the system hiding a fund on the day
it reopens.

**Commits:** `c173867` (the four defects), `8f62169` (rotation rebalance + yield instrumentation)

### Discovery was running at 40% and saying so

The sweep plans two targeted queries at ~34s plus three rotated general ones at
~246s each. That is 314s against a function cap that has never been above 300s,
so the look-ahead budget check skipped every general query on every run since
the cron was created. **It was right to.** The 246s is measured and recorded in
the file, not padding, so no change to the arithmetic fixes it.

Nobody noticed because `stoppedEarly: true` was the normal state. The three
skipped queries are the social investment, blended finance and CDFI ones, so
the thinnest part of the catalogue was being fed by a code path that had never
once executed.

Split by `?slice=`, the same shape `crawl-grants` already uses with `?batch=`:

| slice | what it runs | measured |
|---|---|---|
| `targeted` | both blocked funders (Arts Council England, GLA) | ~68s |
| `general` | exactly one rotated thematic query | ~246s |
| none | everything, budget-limited. Manual use, unchanged. | |

Verified by pointing the self-call at a closed port, so queue construction ran
for real with no model spend:

```
slice=targeted  planned 2  ran 2  stoppedEarly false
slice=general   planned 1  ran 1  stoppedEarly false   <-- was skipped 100% of runs
slice=<none>    planned 5  ran 5
```

Rotation now steps by 1 instead of by `MAX_QUERIES`, which at one query per run
would have skipped four in five queries forever, the same class of bug the split
exists to fix.

### A closed round stayed in the catalogue

`expire-grants` marked a row closed and left `is_active=true`, on the reasoning
that a "Closed, next round TBC" placeholder beat the row vanishing. That
reasoning does not survive contact with the surfaces: every user-facing query
accepts a null deadline, so the row sat in results looking open, and the
placeholder only appeared once someone opened the detail page.

Now it hides only when there is **no known reopen date**. A row that has one
stays visible, because "opens 1 September" is a real lead.

### Reopening a fund removed it from the catalogue

`check-coming-soon` set `is_active=false` on the day a fund reopened, and sent it
to `captured`, where fresh scrapes go. The most positive event in a grant's life
triggered a retraction, and a reopening was indistinguishable from a new find.

It now leaves visibility exactly as it was and routes to
`tagged_awaiting_review`. A live row stays live and the gate treats it as
`attention`; a between-rounds row stays hidden but enters the gate's queue and
can publish itself. When the verification engine has a home, this is the event
that should enqueue a verify.

### `check-stale-rounds` deleted

Its own header records the predicate as unreachable, and production agrees:
**zero rows carry `system:check_stale_rounds` provenance, ever.** A cron entry
implying coverage it does not provide is worse than no cron.

### Composition and cost, signed off 2026-08-12

The rotation was rebalanced before settling the cadence, because the totals hid
two problems.

**In-kind had no queries at all.** 50 live rows, every one from a scraper or
entered by hand. The job whose whole purpose is finding funders nobody has
catalogued had never searched the category we call a differentiator. Five
in-kind queries added, with their own prompt context, because the obvious
reading of "funding" excludes donated services and the sweep would have returned
nothing.

**Two funders were taking 46% of the budget.** Arts Council England and the GLA
ran daily, for funders whose pages move on a scale of weeks. Dropped to alternate
days. Their `fundingType` hint was also `programme`, and both award
predominantly grants; it never reaches the model on a targeted query but it is
the fallback row type, so it is now the grant-shaped category.

| slice | cadence | queries | cost |
|---|---|---|---|
| targeted | alternate days | 2 (ACE, GLA) | $3.95/month |
| general | daily, 20-day rotation | 20: grant / investment / programme / **in-kind**, 5 each | $9.12/month |
| | | | **$13.07/month** |

Cheaper than the $17 a daily-everything rotation would have cost, with the
missing category covered. Output token counts are measured (2,943 targeted,
11,864 general); input is estimated, so treat the total as the right order of
magnitude.

Dropping to every other day remains a one character edit (`40 8 * * *` to
`40 8 */2 * *`), which is the lever for the four-week review below.

### Yield is now measured, not estimated

Cost per published row was not computable: `discover-grants` tracked real usage
and returned it, `discover-sweep` threw it away, and across 37 recorded runs
exactly one carried usage. Spend is now banked **before** the success branch,
because a query that searched, burned tokens and then failed to parse still cost
money.

Yield renders on the **Pipeline page**, as a second line under the existing row
counts, keyed on the summary carrying the shape rather than on the job's name.
Verified end to end against a real scheduled run:

```
found 10 (grant 5, prog 5) · 26 in review · 11 published (grant 9, inv 1, prog 1)
```

`found` is that run. `in review` and `published` are the cumulative state of the
whole discovery cohort, because a run cannot know the fate of its own rows: they
take days to be enriched, gated and published. The question the line answers is
whether the funnel converts.

The manual POST path records a run too, so a morning where the button was pressed
no longer looks identical to a morning where nothing ran.

**Four-week review due 2026-09-09.** Cost per published row, by category, from
`cron_runs.summary.usage` against the published counts. A written roll-up then,
once, not a standing document.

### Deploy gate

```
Regression: tsc clean. 113 tests pass (10 files), 6 of them new and covering
            the yield formatter, the first asserting the exact rendered line
            against a summary copied from cron_runs rather than invented.
            next build clean. eslint 36 errors, identical to main's baseline.
            vercel.json parses; 36 cron entries, within the Pro limit of 40.
            Slice routing exercised against a dead self-call target, so queue
            construction was verified with no model spend (output above).
            Yield and usage verified end to end by running the scheduled path
            locally: 10 imported, real usage and funnel written to cron_runs.
Free-surface fingerprint: NOT APPLICABLE. No MCP route, tool, schema or
            response shape is touched by this branch.
Accent check: PASSED. The Pipeline page gains a text line, no accent.
Named rollback: 5ba4669
```

The Pipeline page render was not screenshotted: it is behind an admin session and
I will not enter credentials. It is covered by the unit test instead, which is
the stronger check anyway because it pins the producer's shape to the renderer's
expectation.

### Known residue, not fixed here

One live row still carries the old "Closed, next round TBC" placeholder from
before this fix. `expire-grants` will not revisit it, because its selection
requires a non-null past deadline and this row's deadline is already null. It is
a single row and a data fix rather than a code one, so I have left it. Say if
you want it swept.

---

## `fix/eligibility-honest-surface`

**What it does:** stops the app telling a charity it is eligible for a grant
whose eligibility nobody has read, and takes 37 rows out of Paul's review queue
that were only waiting because the machine had improved them.

**Commits:** `2c7e663` (lifecycle review doc), `dc40d4d` (the fix), `9c04758` (digest)

### The three steps, in the order they had to happen

1. **`tags_changed` demoted to info.** It blocked because the classifier used to
   narrow eligibility whenever a page was silent on legal form: 152 structure
   values removed against 117 added in one pass. That was fixed at source before
   this branch. `classify.ts` now requires positive evidence to remove a
   structure, and the 24 rows narrowed by the old behaviour had their values
   restored, so a narrowing that survives today is one the page supports.

2. **The surface stopped asserting eligibility it did not have.** `[]` meant
   nobody had established the funder's rule. Every consumer read it as "no
   restriction", because the check everywhere is `length > 0`. On the search card
   that rendered as `Eligible  —  ✓`: a green tick beside an em dash, on 20 live
   rows. All six user-facing surfaces now render the gap, and the tick requires a
   positive match against a list we actually hold.

3. **`eligibility_missing` demoted to info,** which only became safe once step 2
   shipped. The wrongness was never in the row. The row honestly held nothing and
   the app turned nothing into "yes".

### What a user sees now

![Eligibility not fully stated on the funder's site](evidence/eligibility-not-fully-stated.png)

Verbatim: **"Eligibility not fully stated on the funder's site. Check directly
before applying."** Reproduce at `/grants/manual-2026-05-01-bfi-audience-projects`.

Previously this section was absent entirely, which is what read as "no
restriction". It now renders on both grant detail pages, the grant modal, the
search card meta cell and its expanded panel, and the deadlines drawer. MCP
carries it as a new `eligibility.eligible_structures_note` field beside the
array, because an external model reading a bare `[]` infers "open to all" too.

### Measured effect on the queue

Against the live queue via `npx tsx scripts/gate-dry-run.ts`:

| | before (policy c1) | after (policy c2) |
|---|---|---|
| publish | 4 | **49** (26 already live, 23 newly visible) |
| attention | 45 | 17 |
| hold | 43 | 28 |

Nothing that blocked for a reason a person actually needs to judge has moved.
`applicant_individual_only`, `applicant_not_social_sector`, `link_dead`,
`deadline_passed`, `amount_ungrounded`, `amount_pot_suspected`, `quarantined`,
`no_brief` and `page_unreadable` all still block.

### Canary

23 rows would become newly visible on the first 09:00 run. The route's cap was
only reachable by hand (`?limit=`), and `vercel.json` registers the cron path
bare, so a scheduled run could never carry one. Added `AUTO_PUBLISH_LIMIT` as an
env cap for exactly this. **Set to 10 in Vercel on 2026-08-11 — but see the
correction above: that variable is inert until this branch merges, and `0` must
be made to mean stop before it does.**

The route publishes already-live rows first, so the first two or three runs
change nothing a user can see while still exercising the full write path
(merger, trust ladder, state transition, RLS). That is deliberate: the crons this
route was modelled on reported success for their whole existence while RLS
silently rejected every write. Unset the variable once the newly-visible rows
look right.

### Deploy gate

```
Regression: tsc clean. 107 tests pass (9 files). next build clean.
            eslint 36 errors, identical to main's baseline of 36, none new.
            gate-dry-run against live data confirms tags_changed and
            eligibility_missing no longer appear in any blocked list.
Free-surface fingerprint: UNCHANGED, and asserted rather than assumed.
            Pre-merge baseline captured from production:
            5 tools, sha256 4eb66cb6a1cdbf1010ee9306089d7be860e44accd86830d2c6465ccc442a9cda
            No tool name, description or input schema is touched. The MCP change
            is additive to a tool RESPONSE (eligibility.eligible_structures_note),
            which hard constraint 4 permits but requires declaring. Re-run
            scripts/agent-eval/mcp-toollist.ts after deploy and compare.
Accent check: PASSED, accent discipline held. No lime accent added or moved.
Named rollback: 5ba4669
            Main moved from c873fc3 to 5ba4669 while this branch was in flight
            (docs/mcp-handover only, no code, no overlapping files). The branch
            is still based on c873fc3 and merges cleanly either way; the rollback
            target is main's tip at merge time. Re-read it if main moves again.
```

### Note on scope

The fundraiser-facing note keys on the durable signal, `eligible_structures`
being empty. It deliberately does **not** key on the narrowing diff, which lives
at `field_provenance.pipeline_state.diff` in a slot the feedback router
overwrites wholesale, so a note derived from it would vanish the first time
anyone flagged the grant. Narrowed rows stay visible in the admin review queue,
which already renders the diff and offers a per field revert. Paul confirmed
admin-only visibility is enough for these, 2026-08-11.

---

## Done, no longer waiting

| Action | Status |
|---|---|
| `AUTO_PUBLISH_LIMIT=10` in Vercel | Set 2026-08-11, **but inert** — the code that reads it is unmerged. See the correction above. |
| `AUTO_PUBLISH_ENABLED=false` in Vercel | Set 2026-08-13 and redeployed. This is the working brake. Verified against production: `armed: false`, `dryRun: true`, `written: 0`. |
| `PROCESS_DISCOVERY_ENABLED=true` in Vercel | Set 2026-08-11, proven by a manual run: 10 processed, 10 imported, 0 failed, 26s. Queue 54 to 44 pending. |
| `ADMIN_SECRET` rotated | Verified consistent: local matches production, admin route returns 200, `CRON_SECRET` unchanged and still authenticating. |

The rotation had one side effect worth recording: `ADMIN_SECRET` and
`CRON_SECRET` were previously identical, which made `isCronCaller` unable to
tell a cron from an admin. Several routes carry a documented "manual admin
trigger bypasses the arming gate" branch that was therefore **unreachable**.
Those now work, so `reenrich-stale` and `verify-cf-funds` can be triggered by
hand past their disabled flags.
