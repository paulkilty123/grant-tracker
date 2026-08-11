# Merge digest

Finished branches waiting on Paul's go, newest first. One entry per branch: a
plain English line saying what it does, then the deploy gate evidence.

Nothing here is on `main`. `main` only moves on an explicit go.

> Both current branches add this file. If git flags an add/add conflict on
> `docs/merge-digest.md`, take **this** version, from
> `fix/lifecycle-live-defects` — it already contains both entries.

---

## `fix/lifecycle-live-defects`

**What it does:** turns discovery back on properly, so the catalogue starts
finding social investment again, and stops the system hiding a fund on the day
it reopens.

**Commit:** `c173867`

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

### Cost, and this is the one thing worth a decision

Daily discovery is a real increase. Sonnet 5 at $3/$15 per MTok, against the
output token counts already measured in the file (2,943 targeted, 11,864
general), plus web search:

| | now | after |
|---|---|---|
| cadence | 2 targeted per week, general never ran | 2 targeted + 1 general per day |
| cost | **~$1.20/month** | **~$17/month** |

That is **+$193/year against a system that currently spends about $110/year in
total**, so it roughly triples catalogue API spend. I think it is right, because
you called investment coverage a launch problem and this is the only feed that
addresses it, and because $17/month buys the differentiator. But it is your call
and it is the largest single cost change in this work.

Halving it is a one character edit: `40 8 * * *` to `40 8 */2 * *` runs the
general slice every other day, ~$9/month, and still walks all 15 queries
monthly. Say if you want that instead and I will change it before merge.

Input token counts are estimated, output counts are measured, so treat the total
as the right order of magnitude rather than exact.

### Deploy gate

```
Regression: tsc clean. 107 tests pass (9 files). next build clean.
            eslint 36 errors, identical to main's baseline, none new.
            vercel.json parses; 36 cron entries, within the Pro limit of 40.
            Slice routing exercised against a dead self-call target, so queue
            construction was verified with no model spend (output above).
Free-surface fingerprint: NOT APPLICABLE. No MCP route, tool, schema or
            response shape is touched by this branch.
Accent check: PASSED. No rendered surface changed.
Named rollback: 5ba4669
```

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
env cap for exactly this. **Set to 10 in Vercel on 2026-08-11.**

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
| `AUTO_PUBLISH_LIMIT=10` in Vercel | Set 2026-08-11 |
| `PROCESS_DISCOVERY_ENABLED=true` in Vercel | Set 2026-08-11, proven by a manual run: 10 processed, 10 imported, 0 failed, 26s. Queue 54 to 44 pending. |
| `ADMIN_SECRET` rotated | Verified consistent: local matches production, admin route returns 200, `CRON_SECRET` unchanged and still authenticating. |

The rotation had one side effect worth recording: `ADMIN_SECRET` and
`CRON_SECRET` were previously identical, which made `isCronCaller` unable to
tell a cron from an admin. Several routes carry a documented "manual admin
trigger bypasses the arming gate" branch that was therefore **unreachable**.
Those now work, so `reenrich-stale` and `verify-cf-funds` can be triggered by
hand past their disabled flags.
