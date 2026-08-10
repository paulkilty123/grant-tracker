# Proposal — route match_feedback into the review queue

10 August 2026. **Proposal only. Nothing implemented, no data changed, no
migration applied.** Branch `feat/feedback-to-review-queue`.

Every figure below is from a query run against production on 2026-08-10.

---

## 1. The headline correction: it is not 482 rows of work

The brief says 482 flags, 84% negative, currently unused. That is right, but only
a fraction is actionable, and treating the whole set as a queue would bury the
signal.

```sql
-- negatives, resolved against scraped_grants on BOTH id forms
with neg as (
  select f.*, coalesce(g1.is_active, g2.is_active) as live,
         coalesce(g1.id, g2.id) as gid
  from match_feedback f
  left join scraped_grants g1 on g1.id::text = f.grant_id
  left join scraped_grants g2 on g2.external_id = f.grant_id
  where f.direction = 'down'
) ...
```

| | Count |
|---|---:|
| Negative flags | 403 |
| …with free text | **48** |
| …tag-only, no text | 355 |
| …on grants already dead/archived | 106 |
| **Free text AND still live** | **36** |
| Distinct live grants those 36 cover | 36 |
| Live grants flagged down by **2+ different users** | 74 |
| Live grants flagged down by **3+ different users** | 22 |
| Distinct users who have ever flagged | 10 |

Two useful cohorts, not one:

- **Tier A — 36 rows.** Free text on a live grant. A stated reason, often with the
  correction attached. Charlotte's 13 sit here. Highest information density.
- **Tier B — 74 rows.** Multiple different organisations independently rejected
  the same live grant. Strong smell even with no text, but it does **not** say
  what is wrong, so it cannot auto-propose a fix.

The remaining 355 tag-only single-user flags are weak: `wrong_sector` with no
text tells you a grant was wrong for someone, not what is wrong with the row.
**Recommend not routing them at all.**

Note `grant_id` resolved for all 403 once joined on both `id` and `external_id`.
Joining on `id` alone (which `api/admin/feedback/route.ts:31-33` does today)
silently loses rows.

---

## 2. The finding the design turns on: a flag is not always a catalogue defect

A flag means "this grant is wrong **for me**". Only some of those mean "this
grant **row** is wrong". Checked against Charlotte's 13:

**Buttle UK — Chances for Children Grants.** She wrote *"Don't work directly with
children & YP - are an adult charity"*. The row says:

```
target_beneficiaries = [children, young_people, lgbtq, carers, homeless, women_girls]
```

**The catalogue is correct.** Buttle UK does fund children and young people. The
row also correctly carries `homeless`, which is very likely why Mustard Tree, a
homelessness charity, matched at all. Nothing here should be edited. Treating
this as a catalogue correction would *damage* an accurate row.

**Jerwood — Annual Funding Round.** *"Excellence in arts - we offer arts for
wellbeing"*. Row is `impact_sectors = [creative]`, `target_beneficiaries =
[general_public]`. Not factually wrong; the taxonomy simply cannot express
arts-excellence versus arts-for-wellbeing. That belongs in the tagging-quality
backlog, not the review queue.

**The Julia Rausing Trust.** *"Invite-only"*. Row is `is_invite_only = false`.
That **is** a catalogue defect with a one-field fix.

So triage is mandatory, not optional. Three outcomes:

| Class | Meaning | Destination |
|---|---|---|
| `catalogue_gap` | A field on the row is missing or wrong, and a value can be proposed | **Review queue** |
| `match_precision` | The row is accurate; the match was wrong | Matcher signal. Not a review row. |
| `taxonomy_gap` | The row is defensible; the taxonomy cannot express the distinction | Tagging-quality backlog |

Of Charlotte's 13, roughly 10 are `catalogue_gap`, 1 is clearly `match_precision`
(Buttle), 1 is `taxonomy_gap` (Jerwood), 1 is arguable. **That ratio is unusually
good because she is a careful reviewer citing funder policy.** Do not assume it
holds across all 10 users.

**Keying must be by grant id, never title.** There are two live rows titled
"Stronger Communities Fund" (We Love MCR / Manchester, and a Somerset one). Her
£750k correction applies to one of them.

---

## 3. How a flag becomes a review-queue row

No new infrastructure. The queue's entry condition is already state-based:

```ts
// src/app/dashboard/admin/review/page.tsx:29
const QUEUE_STATES = ['captured', 'enriched', 'tagged', 'tagged_awaiting_review']
```

**Entry.** For a `catalogue_gap` flag on a live grant, set:

```
pipeline_state = 'tagged_awaiting_review'
field_provenance.pipeline_state = {
  source: 'system:user_feedback:v1',
  reason: 'user_flagged',
  set_at: <iso>,
}
```

This is the same pattern `system:reenrich_chain:v1` already uses to earn its own
Tag Review tab in `admin/urls`, so a distinct source string gives feedback its own
filtered tab with a count, with **zero schema change** for the entry mechanism.

**Crucially, this does not hide the grant from users.** Visibility is governed by
`is_active` alone; no user-facing surface filters on `pipeline_state` (verified:
45 live rows already sit in `tagged_awaiting_review`). One user's dislike should
not pull a grant off the surface, and it will not.

**Surfacing the reason.** `deriveReviewReasons(row)` is a pure function over the
grant row (`src/lib/admin/review-reasons.ts:277`), so reasons are derived at
render, not stored. Add one `ReviewReasonCode`:

```ts
'user_flagged'   // severity: 'check'
```

To show the actual text — which is the entire value, since Charlotte typed the
income caps — the review page query must **join `match_feedback` on both id
forms** and pass the flags into the row. That adds a field to `ReviewRow`. The
alternative, denormalising the text into the provenance JSON, avoids a join but
duplicates data and goes stale; **recommend the join**.

---

## 4. What happens on accept — the real decision

Every field Charlotte's flags target is a `TRACKED_FIELD`: `max_org_income`,
`min_org_income`, `is_invite_only`, `eligible_structures`, `location_tag`,
`deadline`, `impact_sectors`, `target_beneficiaries`. So every accept goes through
`mergeGrantUpdate()` and the trust ladder, and **the source string decides whether
the value can ever improve again.**

```ts
// src/lib/grant-merge.ts:203-209 — admin auto-pins, regardless of pinned:false
if (newProv.source.startsWith('admin:') && !currentProv.source.startsWith('admin:')) {
  resultProv = { ...newProv, pinned: true, previous: {...} }
}
// :185-190 — once pinned, only another admin: source can overwrite it
```

`grant-merge.ts` itself documents this as the origin of the catalogue's pinning
debt (54% of active rows carry at least one pin) and states the governing
principle at lines 170-172:

> confirming that a machine got it right is not the same as deciding the value
> must never improve

Three options for the accept write:

| Option | Source | Trust | Pinned? | Consequence |
|---|---|---:|---|---|
| **A** | `admin:feedback-<id>` | 100 | **yes, forced** | Truthful (a human decided) but permanent. If the funder later changes their £750k cap, nothing automated can ever update it. Adds to pinning debt. |
| **B** | `manual_extract:feedback-<id>` | 50 | no | **Unsafe.** `ai_enrich` (60) outranks it, so the next enrichment could overwrite Charlotte's verified figure with a worse LLM guess. |
| **C** | `user_verified:feedback-<id>` | **70 (new tier)** | no | Above `ai_enrich` (60), below `360giving` (80). A fundraiser citing the funder's own policy beats an LLM page-read, but the value stays improvable. |

**Recommend C**, with an explicit "lock this value" checkbox that writes option A
when Paul wants a figure frozen.

C is the only option that both protects the human-supplied value from being
clobbered by enrichment *and* honours the "accept ≠ freeze" rule the codebase
already sets out. Its cost is one new entry in `TRUST_BY_TYPE`, which is shared
merge logic touched by every write path, so it is the one genuinely non-trivial
change here and wants care.

**Accept, concretely:** `mergeGrantUpdate({ id, fields: { max_org_income: 750000 },
source: 'user_verified:feedback-<flag-id>' })`, then mark the flag resolved. If
the row has no other outstanding review reason, return it to `published`.

**Reject:** mark the flag resolved with a reason, write **nothing** to the grant,
and return `pipeline_state` to `published`. A rejected flag must never re-queue.

---

## 5. Required schema change

`match_feedback` has no resolution tracking (`id, user_id, grant_id, direction,
reasons, free_text, match_score_at_time, created_at, updated_at`). Without it the
router re-queues the same flags forever and rejected flags come straight back.

Minimum viable:

```sql
alter table public.match_feedback
  add column if not exists reviewed_at timestamptz,
  add column if not exists resolution  text,      -- 'applied' | 'rejected' | 'not_a_catalogue_issue'
  add column if not exists triage_class text;     -- 'catalogue_gap' | 'match_precision' | 'taxonomy_gap'
```

Needs sign-off before applying.

---

## 6. Triage: who classifies?

36 rows could be done by hand. It will not stay at 36, and the value extraction
("£750,000" → `max_org_income: 750000`) is the fiddly part.

Recommend an LLM triage pass over free text producing `{triage_class,
target_field, proposed_value, confidence}`, run through the existing enrich
plumbing. At ~500 tokens per flag on Haiku 4.5 the whole backlog is **well under
£1**; cost is irrelevant, accuracy is not.

It must **propose, never auto-apply** — consistent with the standing rule after
amount extraction ran about a third wrong on hard cases. Every proposal lands in
the queue for a human accept. Where the value is compound or ambiguous ("under
£1.5m unless working nationally"), leave `proposed_value` null so the row surfaces
as a check rather than a guess.

---

## 7. Suggested phasing

1. **Phase 1 — Tier A, 36 rows.** Schema change, triage pass, queue entry, accept
   and reject actions. Starts with Charlotte's 13.
2. **Phase 2 — Tier B, 74 rows.** Multi-user corroboration with no text. Queue
   with a `user_flagged` reason but **no proposed value**; a human decides what is
   wrong. Only after Phase 1 proves the accept path.
3. **Not proposed.** The 355 tag-only single-user flags.

---

## 8. Decisions needed before I build anything

1. **Accept trust model — A, B or C?** This is the one that matters. C needs a new
   tier in shared merge logic.
2. **Approve the `match_feedback` migration** (three columns).
3. **LLM triage, or hand-triage the first 36?**
4. **Does `match_precision` go anywhere**, or is it just excluded for now? There
   is no matcher-feedback backlog surface today.
5. **Phase 2 at all?** 74 rows of "three orgs rejected this" with no stated reason
   is real signal but expensive to action.

Also worth fixing while in here, unrelated to the queue: the feedback admin page
joins only on `scraped_grants.id`, so flags keyed by `external_id` display a raw
id instead of a grant title.
