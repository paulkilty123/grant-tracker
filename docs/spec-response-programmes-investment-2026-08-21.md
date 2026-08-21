# Code response: programmes and investment as first-class catalogue types

**Responds to:** `spec-programmes-investment-catalogue.md` (Paul, 21 Aug 2026)
**Verified against:** live Supabase `yrndczlqjqtfgissleev` and the worktree at `worktree-grants-b`, 21 Aug 2026.

---

## The headline

The spec is written as though this is a schema project. It is not. **Almost every
structure it proposes already exists and was built between May and August.** What
does not exist is the population of those fields, the rendering of them, and the
one gate the spec correctly identifies as the highest-stakes part of the whole
piece.

Already built, verified in live:

| Spec asks for | Already there |
|---|---|
| `opportunity_kind` with four values | `scraped_grants.funding_type` = `grant` / `programme` / `investment` / `in_kind`, indexed twice |
| Kind-specific field blocks | Migration 019 shipped `si_*` (6 cols), `prog_*` (8 cols), `ik_*` (3 cols) |
| Neutral naming for new code | `public.opportunity` view, `funder→provider`, `funding_type→type` |
| `instrument` | `funding_subtype`, with a per-kind taxonomy in `src/lib/funding-subtypes.ts` |
| Per-kind eligibility semantics | `src/lib/eligibility.ts` branches on kind: `investmentChecks`, `programmeChecks`, `inKindChecks` |
| Kind in MCP search | `funding_type` filter, `z.enum(['grant','programme','investment','in_kind'])` |
| Kind in matcher weighting | Org-centred kinds already reroute 15 beneficiary points to themes |
| Intake window machinery | `deadline_cycle`, `next_open_date_parsed`, `between_rounds` deadline type, `verify-cadence.ts` |
| Index-page watching | `funder_watchlist` + `watchlist_alerts` + `watchlist-diff.ts` + `watchlist-signals.ts` + a daily cron |
| Per-kind discovery sourcing | `discovery-queries.ts`, five queries each for programme, social investment, in-kind |
| Relevance flag | `civil_society_relevant` column, populated on 749 rows |
| Individual-vs-org audience | `applicant_type` with a CHECK constraint on `individual`/`organisation`/`both` |

So the September build is not a migration. It is a **population, enforcement and
rendering** job on scaffolding that is already in the ground.

### The counter-headline: the scaffolding is empty

Out of 1,924 rows:

| Field | Populated |
|---|---|
| `si_instrument_type` | 4 |
| `si_min_investment` / `si_max_investment` | 2 |
| `si_repayment_term_months` | 0 |
| `prog_application_cycle` | 12 |
| `prog_location_mode` | 11 |
| `prog_length_weeks` | 8 |
| `prog_next_cohort_start` | 1 |
| `prog_cohort_size` | 1 |
| `ik_support_type` | 8 |
| `ik_value_estimate` | 0 |
| `next_cohort_date` | 0 |
| `org_stage` | 0 |

And the live layer is smaller than the spec assumes. Published and active:

| Kind | Live rows | Has a deadline | Rolling | No timing signal at all |
|---|---|---|---|---|
| grant | 513 | 136 | 168 | 211 |
| in_kind | 44 | 1 | 35 | 8 |
| investment | 37 | 2 | 33 | 2 |
| programme | **22** | 3 | 5 | **14** |

Twenty-two live programmes, fourteen of which cannot say whether they are open.
That is the real baseline for §9, and it is worth writing down before any metric
is set against it.

---

## The thing that is actually broken, and it is the thing the spec is most right about

§4 says the equity-versus-structure gate "must be deterministic code, not model
judgement", and §9 sets "zero instances of an equity instrument matched to a
structure that cannot take it" as a success metric.

**No such gate exists anywhere in the codebase, and the metric is violated in
live data today.**

Three of the four live equity-tagged rows list at least one legal structure that
cannot legally hold equity:

| Row | Structures listed that cannot hold equity |
|---|---|
| Black Seed VC (Black Seed Ventures) | `cic_guarantee`, `ltd_guarantee` |
| Tech for Good Programme (Bethnal Green Ventures) | `ltd_guarantee` |
| Social Investment Fund for London (City Bridge Foundation) | `sole_trader`, `registered_charity`, `cic_guarantee`, `ltd_guarantee`, `cio` |

A company limited by guarantee has no share capital. A charity or CIO cannot
issue shares at all. The City Bridge row is near-certainly mistagged as well,
their social investment is loans and blended, so that is both a gate failure and
a data failure in one row.

Why nothing catches it: the `eligible_structures` "hard gate" in `matching.ts`
is **not a hard gate**. It caps the eligibility score at 4 with a floor of 1 and
leaves the row visible, deliberately, so a row never silently disappears. That is
the right call for a grant with a fuzzy structure list. It is the wrong call for
an instrument the org legally cannot accept. On the MCP side the array is passed
through as information and never filtered on.

`investmentChecks` handles ticket size versus income, repayment term, security
versus asset lock, and charity plus interest. It does not once look at
`si_instrument_type`, which is null on all but four rows anyway.

**This is the piece to build first, and it can be built this month independently
of everything else in the spec.** It is small, it is deterministic, it is
testable, and it is the only part of this work where being wrong is
advice-shaped rather than inconvenient.

---

## Answers to Q1 to Q8

### Q1. Schema shape, and the migration path

**Recommendation: no new schema. Use `funding_type` as the kind and `funding_subtype`
as the instrument. Retire `si_instrument_type`.**

The spec's instinct was common core plus JSONB. The repo already chose common
core plus sparse typed columns, and it has held up: the columns are cheap, they
are in both views, they are indexed, and they survive `mergeGrantUpdate()`'s
trust ladder like everything else. JSONB would lose all of that and force the
MCP flattening you were worried about.

The real Q1 problem is different and worse: **there are two competing instrument
fields.** `funding_subtype` carries the instrument on 39 published investment
rows. `si_instrument_type` carries it on 4, with a CHECK constraint listing five
values that do not match `funding_subtype`'s six. Pick one. `funding_subtype`
wins on population, on rendering, and on having a taxonomy module and label set
already.

Three cleanups fall out, all cheap:

1. **52 rows carry a `funding_subtype` invalid for their `funding_type`**, 32 of
   them live. `in_kind`/`goods` (8 live), `programme`/`support_programme` (6),
   `programme`/`includes_grant` (5), `programme`/`training` (3), plus a tail.
   Some of these are the taxonomy being too narrow rather than the data being
   wrong. `revenue_share` and `community_shares` are real investment instruments
   the spec names and `SUBTYPES_BY_FUNDING_TYPE` does not list, so
   `isValidSubtypeForFundingType()` returns false for them today. Widen the
   taxonomy where the data is right, fix the rows where it is not.
2. **14 rows still carry legacy `funding_type` values** (`blended_finance` 4,
   `social_investment` 4, `corporate_grant` 3, `support_programme`,
   `corporate_programme`, `accelerator`). All are inactive and unpublished, so
   this is a tidy, not a risk.
3. **The LLM prompts disagree with each other about the enum.**
   `autofill-grant` offers five values, `process-discovery-queue` five,
   `discover-grants` ten, `bulk-deep-search` ten, and only two of those lists
   agree. That is where the legacy values came from and it will keep producing
   them. One shared constant, imported by every prompt.

Migration path for rows "wearing grant costumes": do not run a sweep. The
`funding_type` classifier already runs on enrichment, and a bulk reclassification
would fight the trust ladder on rows an admin has touched. Add funding-type
disagreement as a review-queue reason instead, and let it surface through the
existing gate.

### Q2. Founder restrictions

**Recommendation: flag, never gate, and confirm the spec's instinct. But do not
put it in a new column yet.**

We hold nothing about founders. Age, gender and ethnicity of the people running
an org are not in `organisations` and should not be, so any gate would be a gate
on data we would have to ask for, and asking is a product decision far bigger
than this spec.

The nearest existing home is `diversity_tags`, which already exists on
`scraped_grants` and already carries funder-side targeting. The honest v1 is: a
`founder_restrictions text[]` of rendered strings ("founders aged 18 to 30",
"women-led") that surfaces in the same place `who_can_apply` does, never touches
the matcher, and is subject to the same no-quote-no-fact rule as everything else.

One caution. A restriction that is displayed but not matched on will pull the
match score up on programmes the user is barred from, because the eligibility
dimension will read clean. If founder restrictions become common in this layer,
that gap gets visible fast. Worth measuring after the first twenty programme
rows rather than designing for now.

### Q3. Does the watchlist extend to source-index pages

**Recommendation: yes, and it already does, but the join is missing, not the
watcher.**

`funder_watchlist` is URL-keyed with a `funder_type`, a region, a fingerprint and
a count. Nothing in it is funder-specific. Pointing it at Good Finance or Find a
Grant works today with a row insert.

The evidence is in `watchlist-signals.ts`, which documents that 134 of the
watchlist's 239 entries map to no catalogue row at all. Those 134 are already
source-index pages in everything but name. They produce alerts that nothing
consumes.

So the split you asked about is not between two watchers. It is between two
**consumers** of one watcher:

- a changed page that maps to a catalogue row is a **re-verification** trigger,
  which `watchlist-signals.ts` now handles;
- a changed page that maps to nothing is a **discovery** trigger, and there is no
  code for that at all. The added lines go into `watchlist_alerts` and stop.

Build the second consumer: added lines from an unmapped listing page become
`discovery_queue` rows. That table already exists with `url`, `title`,
`funding_type`, `status` and `duplicate_of`, and it already feeds
`process-discovery-queue`. This is a join, not a subsystem, and it turns 387
unresolved alerts from a backlog into an input.

Add a `kind_hint` and a `relevance_profile` to `funder_watchlist` when you do it.
Do not add a per-source cadence, see Q on §7 below.

### Q4. Relevance filter

**Recommendation: separate cheap classifier, and there is already a column
waiting for it.**

`civil_society_relevant` is a boolean on `scraped_grants`, it is in both views,
and it is populated: 597 true, 152 false, 1,175 null. **It is read by no code
anywhere in `src/`.** That is a field that exists and never renders, which is
exactly the failure mode the spec warns about in §3.

So the answer to "rubric in extraction or separate classifier" is: separate, and
it partly exists. Reasons to keep it separate rather than folding it into the
extraction pass:

- it must run **before** extraction, or you pay full extraction cost on the XR
  startup launchpad you are about to reject;
- the reject log the spec wants is only auditable if the decision is a discrete
  step with its own record;
- extraction prompts are already long and this dilutes them.

The reject log should be a `discovery_queue` status rather than a new table:
`status='rejected_relevance'` with the reason and the quote in `notes`. Spot
checks then run off a query, and the 5% false-reject target in §9 is measurable
without building anything.

One correction to §5c. "Conservative threshold" is the wrong dial. Use the floor
rule from CLAUDE.md instead: if the classifier cannot find positive evidence of
social-sector relevance, it does not reject, it routes to review. A confident
reject on thin evidence is the same mistake as a confident accept, and this layer
will be full of thin pages.

### Q5. Is `in_kind` a kind or an attribute

**It is a kind, it has been since May, and merging it with the corporate work
would be a regression.**

`in_kind` is a first-class value in `classify.ts`, `funding-subtypes.ts`,
`discovery-queries.ts`, `opportunity-adapter.ts`, the MCP enum, the matcher's
org-centred weighting, `cron-runs.ts` reporting and `review-reasons.ts`, which
already carries a special case: there is no "fund" in a donated-products offer,
so the missing-amount reason does not fire on it. There are 44 live rows.

`corporate-matching.ts` is a separate scoring path for corporate funders, which
is a funder attribute, not an opportunity kind. A corporate funder can give a
grant, a programme or in-kind support. Those are orthogonal and should stay so.

Nothing to merge. The one thing worth taking from the in-kind work into
programmes is `review-reasons.ts`'s per-kind exemptions, because "no amount" is
about to be equally wrong for an equity-free accelerator.

### Q6. Individual-person opportunities

**Recommendation: agree with your lean, out of scope, and the flag you would need
already exists but is inert.**

`applicant_type` is `individual` / `organisation` / `both`, CHECK-constrained,
defaulting to `organisation`, indexed. It is written in exactly one place, the
360Giving ingest route, and **read nowhere**. Two rows are `individual`, one is
`both`, none are live.

So carrying artist fellowships behind the flag is unsafe today: nothing filters
on it, and the moment a live `individual` row exists it will be matched to
organisations as though it were an org fund. If you ever want them, the work is
not the flag, it is wiring the flag into the matcher, the three list filters and
the MCP scorer, the same five surfaces that the empty-`eligible_structures`
problem turned up in on 11 August.

Out of scope stands. Worth a line in the ledger that the flag is inert, so nobody
later assumes it is protecting anything.

### Q7. Free versus paid line

**Recommendation: do not gate the kind. Gate depth, as everywhere else, and note
that rule 6 already constrains this more than the spec realises.**

The eligibility rule is settled: `who_can_apply` and `exclusions` stay complete
on every tier. For this layer `what_you_give_up` is eligibility-adjacent in the
strongest sense. Telling a free user about an accelerator without telling them it
takes 6% is the same category of harm as hiding an exclusion, and it is worse
here because the cost is not a wasted application, it is equity. **`what_you_give_up`
and `structures_eligible` should be free-tier, always, on the same reasoning as
rule 6.** I would add that to the rule rather than decide it per feature.

What can sit behind the paid line is the same thing as everywhere: how many
programme rows you see, and the depth fields (`prog_cohort_size`, `duration`,
`delivery_mode`, funder intelligence). The MCP layer already declares omissions
per tier, so this costs nothing new.

If you want the hidden-layer framing to earn money, the lever is quantity and
freshness, not withholding the terms.

### Q8. What the spec missed

**1. The decay proposal in §7 is already solved better than the spec proposes.**
`verify-cadence.ts` keys re-verification off what the page said, not a clock:
`dated` beats `always_open` beats `silent`, and migration 056 clears
`verify_due_at` whenever a timing column changes so a date arriving from any
write path makes the row due at once. A per-kind cadence would be a step
backwards, it reintroduces the clock the design deliberately removed. The
programme problem is not cadence, it is that **14 of 22 live programmes hold no
date at all**, so they fall to the `silent` shape and back off to 180 days. Fix
the dates and the existing cadence handles cohorts correctly for free.

**2. §7's "auto-demote at window close" partly exists and partly conflicts.**
`expire-grants` runs daily and there is a known desync between archived state and
live state (migration 063 guarded half of it, 181 published-and-hidden rows are
still open). Adding a per-kind demotion path before that is closed will make the
desync harder to reason about, not easier.

**3. The publish gate will reject most programme rows for the wrong reason.**
`publish-gate.ts` blocks on wrong, not on missing, which is right. But
`review-reasons.ts` only exempts `in_kind` from the no-amount reason. An
equity-free accelerator has no amount by design and will queue behind a code that
does not apply to it. That exemption needs to extend to programmes before any
volume arrives, or §9's "cost per published row by kind" will measure the gate,
not the layer.

**4. `what_you_get` as a structured list is the field I would cut from v1.**
Cash, services with notional value, mentoring, workspace and network is five
sub-shapes to extract, verify and quote, and `prog_includes_funding` plus
`prog_funding_amount` plus prose already carries most of the decision value. It
is the field most likely to produce confidently wrong structure from a vague
page. `what_you_give_up` is worth every bit of the effort; `what_you_get` is not,
yet.

**5. The IP rule in §5b needs one addition.** Resolving tracking redirects to
origin is right, but Klaviyo and similar links expire. Store the resolved origin
URL and record the newsletter only as a `grant_sources` provenance entry, never
as `apply_url`, and capture the resolution at ingest time rather than lazily. A
tracking link that has expired by the time anyone follows it is indistinguishable
from a dead fund.

**6. `next_cohort_date` and `prog_next_cohort_start` are two columns for one
thing,** both effectively empty (0 and 1 rows). Drop one before populating
either.

---

## What I would actually do, in order

1. **Now, this month, independent of everything else.** Build the instrument
   versus structure gate: a deterministic function keyed on `funding_subtype`,
   an explicit list of structures that cannot hold share capital, wired into
   `investmentChecks` as a `blocker` and into the matcher as a genuine exclusion
   rather than a score cap. Add it to the standing regression suite with the
   three live failing rows as fixtures. Then fix those three rows. Small, and it
   closes an advice-shaped hole that is open in production right now.
2. **Now, cheap.** One shared `funding_type` enum constant across the four LLM
   prompts. Widen `SUBTYPES_BY_FUNDING_TYPE` for `revenue_share`,
   `community_shares` and the in-kind and programme values the data already uses.
   Clean the 14 legacy `funding_type` rows.
3. **Now, cheap, and it unblocks the metric.** Extend `review-reasons.ts`'s
   no-amount exemption from `in_kind` to `programme`.
4. **September, with the feed work.** Wire unmapped watchlist alerts into
   `discovery_queue`. Add `kind_hint` and `relevance_profile` to
   `funder_watchlist`. Point it at Good Finance and Find a Grant. This is the
   whole of §5a and it is a join plus two columns.
5. **September.** Relevance classifier as a pre-extraction step writing
   `civil_society_relevant`, with `rejected_relevance` in `discovery_queue` as
   the audit log. Then make something read that column, it has been dead since
   it was created.
6. **September plus.** `what_you_give_up` and `founder_restrictions` as rendered,
   quote-backed fields. Newsletter ingestion last, it is the only genuinely new
   subsystem in the spec.

Everything before step 4 is admin-only, data and tests. On a green gate that goes
in without asking, per the branch discipline split. Step 1 changes what users see
on three live rows, so that one comes to you with the rows named.

---

## One number for the 9 Sep review

If the programme layer is judged on survival and cost per published row, the
baseline it starts from is **22 live rows, 14 of which cannot say whether they
are open**. Any coverage claim made before those 14 hold a date is a claim about
the schema, not about the catalogue. Trust beats coverage, same as the community
foundation call.
