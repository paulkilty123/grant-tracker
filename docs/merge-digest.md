# Merge digest

Finished branches waiting on Paul's go, newest first. One entry per branch: a
plain English line saying what it does, then the deploy gate evidence.

Nothing here is on `main`. `main` only moves on an explicit go.

---

## `fix/eligibility-honest-surface`

**What it does:** stops the app telling a charity it is eligible for a grant
whose eligibility nobody has read, and takes 37 rows out of Paul's review queue
that were only waiting because the machine had improved them.

**Commits:** `5c081de` (lifecycle review doc), `68a7ba2` (the fix)

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
env cap for exactly this.

**Suggested: set `AUTO_PUBLISH_LIMIT=10` before merging.** The route publishes
already-live rows first, so the first two or three runs change nothing a user can
see while still exercising the full write path (merger, trust ladder, state
transition, RLS). That is deliberate: the crons this route was modelled on
reported success for their whole existence while RLS silently rejected every
write. Unset the variable once the newly-visible rows look right.

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
Named rollback: c873fc3
```

### Note on scope

The fundraiser-facing note keys on the durable signal, `eligible_structures`
being empty. It deliberately does **not** key on the narrowing diff, which lives
at `field_provenance.pipeline_state.diff` in a slot the feedback router
overwrites wholesale, so a note derived from it would vanish the first time
anyone flagged the grant. Narrowed rows stay visible in the admin review queue,
which already renders the diff and offers a per field revert.

---

## Waiting on you

| Action | Why |
|---|---|
| `AUTO_PUBLISH_LIMIT=10` in Vercel | Canary for the 23 newly visible rows above. Unset when they look right. |
| `PROCESS_DISCOVERY_ENABLED=true` in Vercel | Releases the 54 discovery items stranded since 26 July. |

**Proposed discovery drain rate.** The queue holds 54 pending items and the cron
runs weekly (`30 9 * * 2`) at 10 items a run, which is six weeks of artificial
delay. Each item is one Haiku call with a 20 second timeout, so 10 items is about
200 seconds against a 300 second `maxDuration`: raising the per-run limit is the
one thing that does not work, because 20 items would exceed the function budget.

**Recommend moving it to daily (`30 9 * * *`) and leaving the limit at 10.** That
drains the backlog in under a week and then idles at whatever discovery produces.
Sub-daily and daily schedules are both permitted now the account is on Pro. Worth
doing in the same branch as the discovery sweep budget fix, since that fix roughly
doubles the inflow: it restores the three rotated queries that are currently
skipped on every run, which are the social investment ones.
