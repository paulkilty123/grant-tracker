# Income limits, invite-only, and the feedback loop — 10 August 2026

Answers Charlotte's report that she is matched to funders whose income limit she
exceeds, and that invite-only funders appear as ordinary matches. Includes the
`match_feedback` data from the admin feedback page, which turns out to be the
most useful evidence in the whole review.

Nothing here is implemented. All figures are from production on 2026-08-10.

---

## The short answer

Both mechanisms **already exist and already work**. Neither is display-only.

- Income limits: a structured `max_org_income` **caps the match score at 30** and
  marks the grant ineligible. That is a hard constraint, not a hint.
- Invite-only: `is_invite_only` drives a purple "✉ Invite only" badge **and** a
  user-facing filter toggle.

**The failure is field coverage, not logic.** The columns are empty on the rows
that matter, so the enforcement never fires.

| | Live rows with the field | Coverage |
|---|---:|---:|
| `max_org_income` | 96 / 742 | **13%** |
| `min_org_income` | 21 / 742 | 3% |
| `is_invite_only = true` | 20 / 742 | 3% |

---

## Part A — income limits

### What the matcher actually does

Three mechanisms, in `src/lib/matching.ts`:

**1. Structured, hard (`matching.ts:2063-2065`).** The branched eligibility engine
reads `grant.minOrgIncome` / `grant.maxOrgIncome`. A blocker gives:

```ts
eligibilityStatus = 'ineligible'
eligibilityReason = branchedVerdict.reason
score = Math.min(score, 30)
```

A 30-point ceiling is a genuine hard constraint. **This only fires when
`max_org_income` is populated: 13% of live rows.**

**2. Prose-parsed, soft (`matching.ts:1752-1758`).** For everything else,
`parseIncomeCapFromText()` regexes the eligibility prose for five phrasings. If
the org exceeds the parsed cap:

```ts
eligibilityScore = Math.max(1, eligibilityScore - 6)
```

Six points off a dimension capped at 15, inside a 100-point total. A grant
scoring 83 becomes 77 and still sits near the top of the list. There is also a
**10% tolerance** (`orgIncomeWithinCap`: `midpoint <= cap * 1.1`), and an unknown
income band returns `true`, i.e. passes.

**3. Unresolved-gate downgrade (`matching.ts:2080-2096`).** Where gate language is
present but no value could be resolved, the verdict is downgraded to
`check_required` with a clear message. Good design, and it is the safety net for
mechanism 1's coverage gap.

### Why Charlotte still saw them

On **all four** grants she flagged for income, `max_org_income` is `null`, so the
hard path never ran. She saw them at scores 66 to 81:

| Score | Grant | Her comment |
|---:|---|---|
| 81 | Bentley Advancing Life Chances — National Fund | "We are over their annual income limit" |
| 77 | Stronger Communities Fund (We Love MCR) | "Max income cap of £750,000 p.a - we exceed this" |
| 72 | Help the Homeless Grants | "restricted to small charities with an annual turnover of less than £500,000" |
| 66 | Migrants and Refugees (A B Charitable Trust) | "only charities under £1.5m turnover" |

Note A B Charitable Trust: `parseIncomeCapFromText` has a pattern written
specifically for its "upper threshold of £1.5 million" wording, with a comment
saying the other patterns missed it. It still surfaced at 66. So even where the
prose path is tuned for a funder, a -6 penalty does not remove it from view.

Org-side data is not the bottleneck: **34 of 39 orgs have `annual_income_band`.**

### What extraction would take

A conservative regex over description, eligibility criteria, `who_can_apply` and
`exclusions` finds **30 live rows** stating an income limit with no structured
value. That is a floor, not a ceiling: my pattern is cruder than the matcher's
own `extractIncomeGate`, and Charlotte found four in one sitting that it did not
catch, so the true figure is higher.

- **Pipeline already supports it.** `max_org_income` / `min_org_income` are
  already in `DIFF_FIELDS` for `cron/reenrich-stale` and already written by
  `enrich-grant` and `backfill-income`. No schema change. No new route.
- **Cost.** ~30 to 150 rows through the existing enrich chain at roughly £0.009
  per row is **under £1.50** even at the top of that range. Cost is irrelevant
  here; accuracy is the only real question.
- **Accuracy risk is real.** The repo's own experience is that amount extraction
  ran about a third wrong on hard cases. Income gates are compound ("between
  £150k and £1.5m", "under £1.5m unless working nationally"), and the standing
  rule for compound thresholds is to leave the field null so the row surfaces as
  `check_required` rather than guessing. **Propose, never auto-apply.**

---

## Part B — invite-only

### It is already badged and already filterable

- `src/lib/grants-normalise.ts:71` maps the column to `isInviteOnly`.
- `src/app/dashboard/search/page.tsx:562` renders a purple "✉ Invite only" pill.
- `src/app/dashboard/search/page.tsx:1928` filters:
  `const matchesInviteOnly = showInviteOnly || !g.isInviteOnly`, with
  `showInviteOnly` defaulting to `true` (line 1317) — shown by default, hideable.

That is already close to the design I would have recommended: visible, marked,
user-controlled. **No change to the mechanism is needed.**

### The gap is the flag

Only 20 live rows carry it. A conservative prose scan finds **8 more** with
invite-only language and no flag. The clearest case is the one Charlotte hit:
**The Julia Rausing Trust**, flagged by her as "Invite-only", is
`is_invite_only = false` in our data and scored 68.

Worth noting `src/app/dashboard/deadlines/page.tsx:1912` sets `isInviteOnly` on
its rows but never renders the badge, so an invite-only grant reaching the
deadlines surface appears unmarked. Small inconsistency, cheap to fix.

### Recommendation

Keep badge-and-filter. Do **not** exclude invite-only funders outright: a
relationship-led funder is often exactly the useful intelligence, and a wrongly
excluded funder is invisible and unappealable, which is worse than a badged bad
match. Spend the effort on the flag's coverage instead, and consider defaulting
`showInviteOnly` to off for orgs that have said they only want fundable
opportunities.

---

## Part C — the finding that outranks both

**Feedback is collected, displayed, and then nothing happens to it.**

`match_feedback` holds **482 flags**, 156 since July, the most recent today.
**403 down to 79 up: 84% negative.** Reason tags, all time:

| Reason | n | since July | avg score shown |
|---|---:|---:|---:|
| eligibility_issue | 195 | 73 | 51 |
| wrong_sector | 145 | 53 | 53 |
| wrong_style | 141 | 75 | 54 |
| wrong_size | 65 | 12 | 48 |

`wrong_size` has largely stopped since July, which suggests the size-floor work
landed. `wrong_style` is now the fastest-growing complaint.

On **7 August** one user left 13 negative flags with free text, every one on a
**high-scoring** match (64 to 81). Three days later:

- **All 13 grants are still live and unchanged.**
- The Julia Rausing Trust still has `is_invite_only = false`.
- All four income-cap grants still have `max_org_income = null`.
- **She gave us the values in plain text**: £1.5m, £750k, £500k. Those are
  precisely the numbers that belong in `max_org_income`, already typed out by a
  domain expert, sitting unused in a table.

The 13 break down as: 4 income cap, 3 not open, 2 geography, 1 invite-only,
1 legal structure, 1 beneficiary mismatch, 1 sector nuance. Note that three
"Not open" flags at scores 68 to 75 are the same defect as the undated-rows
finding in the staleness audit — independent confirmation from a real user.

Two smaller problems in the same area:

- **The feedback admin page mislabels some rows.** `match_feedback.grant_id` is
  `text` and holds a mix of UUIDs and `external_id`s, but
  `src/app/api/admin/feedback/route.ts:31-33` joins only on
  `scraped_grants.id`. Rows keyed by `external_id` fall back to displaying the
  raw id instead of the grant title.
- **Users are skipping the tags.** Every one of the 7 August entries has an empty
  `reasons` array but populated `free_text`, so the tag counts above understate
  reality and the free text is the real signal.

### Recommendation — highest leverage of anything in this review

Route negative feedback into the existing review queue. A flag on a live grant is
a human telling us a specific row is wrong, with the correction attached. The
machinery to act on it already exists: a provenance-marked
`pipeline_state = 'tagged_awaiting_review'` gives it a filtered admin tab, the
same way `system:reenrich_chain:v1` produces the Tag Review tab today.

This costs no LLM spend and needs no new cron. It is the cheapest quality win
available, and it is worth more than either extraction project above, because it
turns 482 existing signals into work rather than leaving them in a table nobody
reads.
