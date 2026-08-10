# Handover — cohort feedback triage, 10 August 2026

Session brief: five issues from written feedback by two cohort users (Jo,
Olympias Music; Charlotte, Mustard Tree). Items 1 and 2 were user-blocking and
were to be fixed on separate branches. Items 3 to 5 were propose-first.

**Status: items 1 to 4 done. Item 5 not started.**

---

## STATE OF THE REPO — read this first

`main` is untouched and level with `origin/main`. **Nothing has been pushed.
Nothing has been deployed.** Three local branches:

| Branch | Commits | Contents |
|---|---:|---|
| `fix/password-reset-session` | 2 | Item 1 fix + vitest + tests + flow doc |
| `fix/pipeline-save-entitlement` | 2 | Item 2 fix + admin entitlement control |
| `docs/cohort-feedback-audit-2026-08-10` | 1 | Items 3 and 4 audit docs |

`npx tsc --noEmit` clean on all three. `npm test` passes (30 tests total: 18 on
the auth branch, 12 on the pipeline branch).

**Vitest is new to this repo.** It is introduced independently on both fix
branches (Paul approved unit-test scope only). `package.json` will conflict
trivially on the second merge; keep both `test` scripts, they are identical.
`vitest.config.mts` is byte-identical on both branches.

### The one production change made this session

**7 organisations were granted `apply_access = true`**, on Paul's explicit
instruction, after a dry run showed the naive query would have hit 20 rows
including his own test orgs and one named "delete me". Scoped to the *active*
(oldest) org per affected owner:

```
a892ef3e-751a-45e1-b5f5-9dd8ea974082  Mustard Tree (Charlotte)
fd01df28-22e2-4593-bed6-233833c2d48b  Olympias Music Foundation (Jo)
86df2e31-c00c-4b3b-b660-f75410012cbf  Learning with Parents
dd8d3a4a-4be1-4a53-ac50-adf2693fbd22  Social Enterprise UK
db03824c-e808-4b14-ba83-a062d74b70ab  Project Female
59be8965-5a56-4ee7-ac41-c97eeeccd1df  ASP Belong
a2f6a7c6-4531-40d4-a9d8-9d0579a9a88e  Bikeworks CIC
```

The MCP test fixture org was deliberately excluded. Verified afterwards by
evaluating the real RLS `WITH CHECK` expression against each: all 7 now pass.
**This took effect immediately; it needed no deploy.** No other data was changed
by any part of this session.

---

## ITEM 1 — password reset "Auth session missing!" · FIXED

Branch `fix/password-reset-session`.

### Root cause

`src/app/auth/reset-password/page.tsx` read `?code=` and nothing else. When the
code was absent it called `setExchanging(false)` **without setting an error**, so
the password form rendered as fully usable with no session behind it.
`updateUser()` then threw `AuthSessionMissingError`. That error text can only be
produced by `updateUser()` running with no session, which is what made Jo's
symptom perfectly repeatable.

Supabase lands on that page in four shapes; only one was handled:

| Shape | When | Old behaviour |
|---|---|---|
| `?code=` | PKCE, after `/auth/v1/verify` succeeds | handled |
| `?token_hash=&type=recovery` | if the template sends it | dead form |
| `?error=access_denied&error_code=otp_expired` | token already spent | dead form |
| `#access_token=` | implicit flow, fragment | dead form |

Row 3 is the everyday case: Outlook/M365 safe-links prefetch the URL, spend the
single-use token, and the human then arrives to error params.

**Confirmed against production data**: Jo (`jo@olympiasmusic.com`) last signed in
27 July, requested another recovery email on 10 August, never completed one.
`recovery_sent_at` moves, so the emails were sending correctly the whole time.

### What changed

- New `src/lib/auth/recovery-link.ts` — pure parser over query **and** fragment,
  branching on all four shapes, errors winning over any other param.
- **Token redeemed on click, not on GET.** A scanner fetching the page no longer
  burns the token. This is the actual prefetch mitigation.
- Form only renders once a session is confirmed; session re-checked at submit.
- Dead links get an explicit expired state with an inline resend form.
- Underlying errors logged rather than swallowed.
- `src/middleware.ts` no longer bounces authenticated users off
  `/auth/reset-password`. It used to, silently burning the link for anyone with a
  live session in the browser where they opened the email.
- 18 unit tests in `recovery-link.test.ts`.

### Verified

Driven in a browser on localhost against three URL shapes: spent-token redirect
→ expired state with resend; `token_hash` → Continue button with nothing consumed
on load; bad token redeemed → fails safe to expired state. Screenshots taken.

### OPEN — blocking, and order-sensitive

The click-to-redeem protection is **dormant** until the Supabase email template
changes from `{{ .ConfirmationURL }}` to:

```
{{ .SiteURL }}/auth/reset-password?token_hash={{ .TokenHash }}&type=recovery
```

**Deploy the code FIRST, change the template SECOND.** The new page handles both
shapes so deploying under the old template is safe. The reverse is not: the old
page code ignores `token_hash` entirely, so flipping the template while
production still runs the old page would send *every* resetting user into the
dead form — widening the bug from "people whose links get pre-scanned" to
"everyone". Paul initially chose "change it now"; this ordering risk was raised
and is unresolved.

Full detail and a step-by-step rollout in `docs/password-reset-flow.md`.

### Not done

No end-to-end test of a real token (generate link → redeem → set password → sign
in). Paul chose unit-test scope only, because the integration version would
create and delete a real user in production Supabase on every run.

---

## ITEM 2 — pipeline save "Failed to save" · FIXED

Branch `fix/pipeline-save-entitlement`.

### Root cause

Not Charlotte-specific. `pipeline_items` RLS requires
`organisations.apply_access = true`. Postgres rejected every insert with **42501**.

Migration `030_apply_access_entitlement.sql` (2026-06-21) introduced this
deliberately as a GA blocker, seeded `true` for a **one-time list of 20 email
addresses**, defaulted everyone else to `false`, and added
`trg_enforce_apply_access_immutable` so only `service_role` / `postgres` /
`supabase_admin` can change it. **Nothing in the application has ever been able to
set it** — verified: `apply_access` is read-only in every file in `src/`.

7 real accounts were blocked. The interesting part is who:

| Org | Why |
|---|---|
| Bikeworks CIC | Owner **is** on the allowlist; org created the same day, just after the seed ran. Timing miss. |
| Learning with Parents | Allowlist has `jen.robinson-slater@`; actual account is colleague `chris.britt-searle@`. **72 saved grants, 0 pipeline, since 13 July.** |
| Project Female | Allowlist has `pip.projectfemaleuk@gmail.com`; account is `projectfemaleuk@gmail.com`. |
| Olympias Music | Allowlist has `hema@`; account is `jo@`. **Jo — hit by both bugs at once.** |
| ASP Belong, Social Enterprise UK, Mustard Tree | Genuine post-seed signups. |

The allowlist was per-email; the cohort is per-organisation. Colleagues and
second accounts at invited organisations fell straight through.

### What changed

- `src/lib/pipeline-errors.ts` maps Postgres codes (42501 entitlement, 23505
  duplicate, 23502/3/14 missing data, 22P02 bad enum, PGRST301 expired session)
  and **always logs the underlying error** with a context label. 12 unit tests.
- Error toasts get an alert icon, coral styling, `role="status"`, 6s not 3s, and
  rounded corners (the toast had none, against the hard design rule). Success
  keeps the tick. Previously `✓ {toast}` was hardcoded for every message.
- `programmes/page.tsx` reported **"Already in pipeline" for every failure**, so
  an entitlement rejection read back as success. Fixed.
- Grant-detail button offered "Retry" on an unretryable error; now shows why.
- `pipeline/page.tsx` star toggle no longer swallows its error.
- **`POST /api/admin/apply-access`** — grant/revoke behind the existing
  `requireAdmin` / `ADMIN_SECRET` pattern, using `getAdminDb()` (service-role).
  Reads before writing so a bad id 404s; reports whether anything changed; turns
  a zero-row update into a loud error.
- Admin users table: an On/Off toggle, a **"No pipeline access" filter chip**, and
  a visible error if the write is refused.
- `/api/admin/users` now returns `apply_access` and `org_count`, **and orders orgs
  oldest-first**. It had no ordering, so for a multi-org user it reported on — and
  would have toggled — an arbitrary org rather than the one the app resolves.
- `Organisation` type gains `apply_access` / `companion_access`, documented as
  RLS-enforced.
- Search guards both write paths before calling, and "+ Add to pipeline" drops
  out of the lime primary-CTA treatment when entitlement is absent. Still visible
  and clickable so the feature stays discoverable; the click explains itself.

### Deliberately left alone

Two `catch {}` blocks guarding best-effort lookups (deadlines grant preview,
pipeline autofill). Not writes.

### OPEN

The endpoint's **write path is unexercised.** Auth (401), validation (400 × 3)
and read (404 on unknown org) were all verified against real Supabase on
localhost. The actual UPDATE was not: the safety classifier blocked it as an
unauthorised production write, correctly. Evidence it will work: the trigger
explicitly permits `service_role`, `getAdminDb()` uses the service-role key, and
a refusal `raise exception`s with 42501 rather than silently no-opping, so the
route surfaces it as a 500 with a message naming the likely cause. A round-trip
on a throwaway org would close this off.

---

## ITEM 3 — catalogue staleness · ANALYSED, NOTHING IMPLEMENTED

`docs/catalogue-staleness-audit-2026-08-10.md`.

**The brief's premise did not survive the data.** Asked to flag every live row
with a past deadline: **there are zero**. Expiry works. URL health is good too —
738 of 742 live rows checked 2026-08-09, none dead.

The real defect is missing deadlines, not stale ones. Of 742 live rows:

| Shape | Rows | Share |
|---|---:|---:|
| Real future deadline | 181 | 24% |
| No deadline, flagged `is_rolling` | 395 | 53% |
| No deadline, not rolling | 165 | 22% |

**Nothing can ever expire a row that never had a deadline.** A fund that quietly
closes stays live and labelled "Rolling" forever: deadline expiry can't see it,
URL validation can't either (page still 200s).

Verified by sampling two rows against the funders' own pages: Clothworkers
correct; **JRCT Power and Accountability wrong** — we show open+rolling, funder
says EOI closed 13 July, new applicants invite-only, next round September 2026.
One in two is not a rate, but it proves the failure mode.

Corrections to the brief's figures:
- Published-but-inactive is **169**, not 137. It has grown.
- Archived-but-live is **9**, confirmed, but these are real working funders
  (Morrisons, Steel Charitable Trust, Amex, Grocers'), all URL-ok. Their
  `field_provenance.pipeline_state` is null. It is an **admin-queue visibility**
  problem, not a user-facing one.
- **No pin is protecting a stale deadline.** 184 rows have a pinned deadline, 64
  live, of which 48 pinned to a future date, 16 pinned to NULL, **0 to a past
  date**. All 184 pins came from an `admin:` source. The 16 pinned-to-NULL rows
  can never gain a deadline, so they are Rolling forever.
- **56 live rows are in a non-published state** (9 archived + 45
  tagged_awaiting_review + 2 tagged) and are shown to users, because no user
  surface filters on `pipeline_state`.

Two bugs found on the way:
- **`grant_closed` has never once been persisted**, in any row, in any state. The
  validator computes the verdict and `validate-urls` has a branch for it. This is
  precisely the check that would have caught JRCT.
- **88 live rows have `url_status = 'unchecked'`** and are shown anyway.

Also: Find Funding filters on `is_active` **only**
(`search/page.tsx:1429`), while the dashboard additionally excludes dead URLs and
past deadlines (`dashboard/page.tsx:118-122`). Two definitions of "live"; Find
Funding is the permissive one.

Proposals (unimplemented, need sign-off): do **not** auto-unpublish anything (it
would remove 75% of the catalogue); stop asserting "Rolling" when we merely have
no deadline; fold undated rows into the **existing** `reenrich-stale` cron rather
than adding one — ~7 rows/day, **~£1.90/month**, arithmetic from documented
pricing not a measurement, because no cron has ever recorded actual token usage.

---

## ITEM 4 — income limits and invite-only · ANALYSED, NOTHING IMPLEMENTED

`docs/eligibility-enforcement-audit-2026-08-10.md`.

**Initial read was wrong and was corrected.** Both mechanisms already exist and
work. Neither is display-only.

- **Income is a hard constraint.** Structured `max_org_income` → branched engine
  → `eligibilityStatus = 'ineligible'` and `score = Math.min(score, 30)`
  (`matching.ts:2063-2065`).
- **Invite-only is already badged and filterable**: purple "✉ Invite only" pill
  (`search/page.tsx:562`) plus a `showInviteOnly` toggle defaulting to true
  (`search/page.tsx:1317, 1928`).

**The failure is field coverage, not logic:**

| | Live rows | Coverage |
|---|---:|---:|
| `max_org_income` | 96 / 742 | 13% |
| `min_org_income` | 21 / 742 | 3% |
| `is_invite_only = true` | 20 / 742 | 3% |

On all four grants Charlotte flagged for income, `max_org_income` is null, so the
hard path never ran. The fallback is a **6-point penalty** on a 100-point score
(`matching.ts:1752-1758`), with a 10% tolerance, and unknown income band passes.
That is why she saw them at 66 to 81. Note `parseIncomeCapFromText` has a regex
written *specifically* for A B Charitable Trust's "upper threshold of £1.5
million" wording — and it still surfaced at 66.

Org-side data is not the bottleneck: 34 of 39 orgs have `annual_income_band`.

A conservative regex finds **30 live rows** with an income limit in prose and no
structured value, and **8 more** with invite-only language and no flag — including
**The Julia Rausing Trust**, which Charlotte explicitly flagged and which is
`is_invite_only = false`. Both are floors, not ceilings.

### The finding that outranks both

**`match_feedback` is collected, displayed on the admin page, and never actioned.**

482 flags, 156 since July, most recent today. **403 down vs 79 up: 84% negative.**
Top reasons all-time: `eligibility_issue` 195, `wrong_sector` 145, `wrong_style`
141, `wrong_size` 65. `wrong_size` has largely stopped since July (the size-floor
work landed); `wrong_style` is now fastest-growing.

On **7 August** one user left 13 negative flags with free text, every one on a
high-scoring match (64–81). Three days later **all 13 grants are still live and
unchanged**, Julia Rausing still has `is_invite_only = false`, and all four
income grants still have `max_org_income = null`. **She typed the caps out by
hand — £1.5m, £750k, £500k** — exactly the values that belong in the empty
column. Three of her flags were "Not open" at scores 68–75, independently
confirming item 3's undated-rows defect.

Smaller problems in the same area:
- The feedback admin page **mislabels rows**: `match_feedback.grant_id` holds a
  mix of UUIDs and `external_id`s, but `api/admin/feedback/route.ts:31-33` joins
  only on `scraped_grants.id`, so some rows show a raw id instead of a title.
- Every 7 August entry has an **empty `reasons` array** but populated free text,
  so the tag counts understate reality.

**Recommendation, highest leverage in the whole review:** route negative feedback
into the existing review queue via a provenance-marked
`pipeline_state = 'tagged_awaiting_review'`, which gives it an admin tab the same
way `system:reenrich_chain:v1` produces Tag Review today. No LLM spend, no new
cron. Turns 482 existing signals into work.

---

## ITEM 5 — category cap on org profiles · NOT STARTED

Untouched. The ask: what the current cap is, where it is enforced (UI, schema,
matcher), and the matching-quality trade-off of raising it. Decision only, no
change.

One lead already found: `src/types/index.ts` documents `impact_sectors` as
"1–3 impact sectors from the 14-sector taxonomy", while `CLAUDE.md` describes a
19-sector taxonomy in `src/lib/classify.ts`. Worth checking whether the comment,
the taxonomy, or both have drifted. Relevant context: the repo has a known
tension where `impact_sectors` is **both a hard gate and a score**, so a correct
additional tag can *lower* a match score. That mechanism should be explained
concretely before recommending a bigger number, because the honest fix may be a
different scoring model rather than a higher cap.

---

## DECISIONS PAUL MADE THIS SESSION

1. Email template: "change it now, verify against live" — **but the ordering risk
   was raised afterwards and is unresolved.** Do not flip the template before the
   code is on `main`.
2. Test scope: vitest, **unit tests only**. No production-touching integration
   test.
3. Apply access: grant to **all 7** real accounts (done).
4. UI: gate the buttons **and** build a way to grant access (both done).
5. Mid-session instruction: **work sequentially, one item at a time, no subagents
   unless asked.** Four background agents launched early were stopped; one
   (item 2 diagnosis) had already returned and its findings were independently
   re-verified before use.

## OPEN DECISIONS

- Whether to smoke-test the `apply-access` write path on a throwaway org.
- The rule for undated rows (item 3 proposal A).
- Whether to enable the freshness check (item 3 proposal B, `reenrich-stale` is
  currently disabled by default via `REENRICH_CRON_ENABLED`).
- Whether to route feedback into the review queue (item 4 part C).
- Whether the 56 non-published-but-live rows should be visible at all.
- Item 5 entirely.

## GOTCHAS WORTH REMEMBERING

- `git add -A` in this repo sweeps in ~48 untracked working documents (audit
  reports, data dumps, strategy notes) that live in the working tree. **Always
  stage explicit paths.** This was done wrong once and corrected.
- Always dry-run an entitlement UPDATE. The obvious "grant to every org owned by
  an affected user" query would have hit 20 rows including Paul's own test orgs.
- `match_feedback.grant_id` is text and holds both UUIDs and `external_id`s; join
  on both or rows silently disappear.
- The `grants_with_funder` view does **not** filter rows (1,818 = 1,818);
  `is_active` alone is the visibility rule.
- `next.config.mjs` has `eslint.ignoreDuringBuilds: true`, so a pre-existing lint
  error in `search/page.tsx` (unescaped quotes, ~line 3177 on main) is not a
  deploy risk.
