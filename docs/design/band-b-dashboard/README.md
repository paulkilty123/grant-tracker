# Band B, pass 2 — the dashboard

**Companion files** in this folder:

- `dashboard-states.html` — the whole page in three states: urgent, steady, day one
- `pipeline-card.html` — the pipeline card in detail (**build variant A**, total as a headline)
- `strip-states.html` — the act-now strip's weights and quiet states

**Scope:** `src/app/dashboard/page.tsx` only, plus one query change. The shell (sidebar, page background) is already done and unchanged by this.

**This is not a recolour.** Pass 1 restyled the page; this changes what's on it, in what order, and at what size. Six changes, and any one can be dropped without breaking the others — they're listed in the order I'd do them.

---

## 0. Two data changes gate the design

Neither is styling. Both need deciding before the cards they affect get built.

**a. Applications don't carry their project.** `page.tsx:191` selects `id, grant_name, funder_name, status, questions, opportunity_id` — **no project reference**. The row title is `a.title` (= `grant_name`) and the funder survives only as two initials in the monogram at `:790`. The live consequence is three rows all reading "Youth Fund" with no way to tell them apart. The redesigned card shows fund name over project name, so the project must come through the query. **If you can't get it cheaply, say so and I'll design a fallback rather than have you ship the current ambiguity restyled.**

**b. `profileComplete` is not completeness.** `page.tsx:446` is `impact_sectors.length > 0 && legal_structure` — two fields. The sidebar shows **Profile 86%**, a much richer measure. A user can be "complete" here while the sidebar says 40%, and the page will promise matches scored on very little. Either make them the same number, or rename this one `canRunMatching`, which is what it actually tests. **I've deliberately left a "finish your profile" candidate out of the strip's priority ladder until this is settled** — I didn't want to build on a signal I don't trust.

---

## 1. Page order

Current: a 2×3 grid of six equally-weighted cards, deadlines bottom-right. Nothing is primary, and the most time-critical block is last in reading order.

New order, top to bottom:

1. **Greeting** — see §6
2. **Act-now strip** (new, full width) — §2
3. **Matches** | **Upcoming deadlines** — what's out there
4. **Your applications** | **Your projects** — what you're working on
5. **Pipeline**, full width — where the money is

Grouping the cards in pairs by what they're for gives the eye a route through. Pipeline going full width also fixes a proportion problem: four stage tiles plus a footer were cramped at half width.

---

## 2. The act-now strip — new component

The one thing a dashboard exists to answer is *what should I do now?* Three slots maximum.

### It is a priority queue, not three fixed slots

Candidates are scored, the top three fill the strip, and **if fewer than three qualify it shows fewer**. Nothing is padded.

| | Candidate | Condition | Weight |
|---|---|---|---|
| 1 | Deadline on work already begun | `daysUntil ≤ 7` and a draft or pipeline entry exists | Urgent |
| 2 | Deadline on a strong match | `daysUntil ≤ 7`, `score ≥ 80`, not started | Urgent |
| 3 | Draft near done, clock running | `answered/total ≥ .5` and `daysUntil ≤ 30` | Urgent |
| 4 | New strong match this week | `score ≥ 80` and `lastSeenAt ≥ mondayISO` | Steady |
| 5 | Draft part-written, no clock | `0 < answered < total` | Steady |
| 6 | Project ready, never applied | `project.ready` and 0 applications | Steady |
| 7 | Strong match unreviewed | `qualityCounts.strong > 0` | Steady |
| 8 | New matches this week | `newMatchesThisWeek > 0` | Steady |
| 9 | No project described | 0 projects | Steady |
| — | Nothing qualifies | — | All clear |

Every signal already exists on the page: `qualityBucket` at `:265–269`, `newMatchesThisWeek` at `:335`, `daysUntil` in the `DlRow` type at `:369`, `WorkProject.ready` at `:181`.

### Three weights, one container

**The container is always a white card.** Do not invert it to `--deep` when urgent — I proposed that and it was wrong. On a deep panel the slot tints composite to `#3B4542`, `#30514C` and `#3A5046`: separations of **1.20–1.37:1** from the panel, so three hues become three identical greys and the colour system stops working. On white the same tints give 8.8–10.5:1 for deep text and stay recognisably themselves.

| Weight | Heading | Signals |
|---|---|---|
| **Urgent** | "Needs you this week" | danger flag beside the heading (`2 close in 6 days`); leading slot in `--tint-terra` with a solid danger countdown pill |
| **Steady** | "Where to pick up" | no flag, no terracotta; subtitle states the truth — "Nothing closes for 3 weeks." |
| **Day one** | "Start here" | two slots, not three padded out |
| **All clear** | — | not a panel: one `--tint-sage` line, "Nothing needs you this week", next deadline named |

**The weight of the highest-ranked item sets the treatment**, not the count. One urgent item among two steady ones is still urgent. That's what stops it crying wolf — and the all-clear state matters more than it looks, because it's what earns the strip credibility on the weeks it does shout.

**No top border on the card.** Tried it, it fights the corner radius; the flag and the terracotta slot carry the escalation alone.

### Slot anatomy

Tinted background · 32px saturated icon tile with a `--deep` glyph · family-coloured eyebrow · `--deep` title · `--ink-muted` body · one button, `--deep` fill (ghost for the lowest-priority slot).

**Body text stays in ink tokens throughout.** Only the eyebrow, the tile and the background carry hue — that's what keeps four coloured boxes from reading as a carnival.

---

## 3. Card changes

### Matches (was "Your matches summary")

**Invert the number hierarchy.** `61 matches` is currently 40px and stated twice (1 + 6 + 54 is the same 61). `Strong = 1` sits at 20px. Swap them: "**1** strong match" as the headline, the rest of the distribution as one quiet line beside it. The count that should decide what you do next is currently sized as if it matters a fifth as much as the pool it came from.

**Delete the by-funding-type chart** (`:955–957`, constant at `:859–865`). It's the only chart on the page, it takes a quarter of a card, and **there is nothing you can do with it here** — you can't filter by type on this screen. Move it to Find Funding where those four categories are controls, or drop it. If it stays, it must at least link through to a filtered search.

**The score badge must stop borrowing the funding-type colour.** At `:1040` the percentage pill uses `cfg.pillBg` / `cfg.pillFg` — the same map as the type tag at `:1046`. So 83% renders amber and 74% coral *because of what kind of funding they are*, not how well they match. Two independent dimensions wearing one colour invites reading a ranking that isn't there. Badge goes neutral: `rgba(255,255,255,.72)` over the row tint, `--deep` text. The top-scoring row gets a `--deep` fill as a quiet nod that it's the strong one.

Match rows carry the funding-type tint as a full background plus a 4px left rail in the saturated hue.

### Upcoming deadlines

Structure unchanged. Urgent rows (`isUrgent`, `d ≤ 30` at `:1194`) get a `--danger-tint` row background and a **solid** `--danger` pill; beyond 30 stays plain with an outlined pill. Keep the `${d}d` label format at `:1195` — do not expand it to "6 days".

**On day one this card is not empty.** `alerts` at `:369–420` is `pipelineRows` **plus** `catalogueRows`, so a new account still gets deadlines from its own matches. Add one muted line under the list: *"From your matches. Deadlines you add to your pipeline appear here too."* Without it, a user with an empty pipeline reasonably wonders how the app knows about deadlines at all.

### Your applications (was "Continue writing")

**Rename.** Two of the four rows are at 0 of 8 and 0 of 4 — never opened. "Continue" is wrong for them.

**Group into "In progress" and "Not started."** Started rows keep progress bars; not-started rows show the question count instead.

**Two lines per row:** fund name, then project name with the project's colour square. This is what makes three "Youth Fund" rows distinguishable — and it depends on §0a.

### Your projects

Icon tile takes the project's colour (see §4).

### Pipeline — build variant A

Currently four equal tiles and a footer. Three changes:

**Tiles to 132px, value pinned to the bottom, 21px → 30px.** Label top, value at the base, so the four numbers align regardless of label length.

**Promote the total.** `Total in pipeline: £635k` is the most important number on the card and currently the smallest, bottom-right. It becomes a 40px headline above the tiles: **£635k** *in play*, with "across 3 opportunities" and the declined figure on the same row. Declined comes out of the footer — it's an outcome, not a footnote.

**Add a proportion bar** between the total and the tiles: a stacked bar of the stage values in the ladder's own tones, 8px, 2px gaps, stage order. Four equal tiles give £500k and £15k the same visual weight; the bar shows that **£500k is 79% of the whole pipeline and it's sitting in Identified**. Do not make the tile widths themselves proportional — a £0 stage would vanish and labels wouldn't fit at 2%.

**Empty state:** total reads `£0`, not a dash — zero in play is a true statement, a dash is an absence of information. Stage tiles keep dashes, because "nothing yet" differs from "£0 of value". Footer explains the mechanism: *"Save a match to your pipeline and it starts here, in Identified."*

**Reminder from pass 1:** the ladder at `:343–347` is **not** shared with the Pipeline page, which has its own `STAGE_BG_HEX` at `pipeline/page.tsx:23–29`. They had already diverged. Changing one does not change the other.

---

## 4. New tokens

Accent tints and their deep steps, for the strip slots and project colours:

```
--tint-sage:#E3F0E4   --fg-sage:#1B6B3D
--tint-gold:#F9F1D9   --fg-gold:#7A5E11
--tint-sky:#E7F0FA    --fg-sky:#2A5A85
--tint-teal:#CDE7EA   --fg-teal:#1F5F66
--tint-terra:#F4D8D0  --fg-terra:#8C3B28
```

Measured: `--deep` on each tint runs **7.9–10.5:1**; each `--fg-*` on its own tint **5.0–6.3:1**; a `--deep` glyph on the saturated hue tile **6.4–7.7:1** for sage, gold and sky, 4.4 for teal, 3.7 for terracotta (fine as an icon tile at the 3:1 non-text floor — which is why the eyebrow above terracotta uses `--fg-terra`, not terra itself).

### Funding-type palette — validated, do not adjust by eye

The brand accents **fail as data colours**: run as a categorical set, sage and sky fall below the chroma floor and read as grey, all four sit outside the lightness band, and adjacent pairs fall under the normal-vision separation floor. Re-stepped:

| Type | Bar | Tag background | Tag text | Contrast |
|---|---|---|---|---|
| Grants | `#22874C` | `#E4F1EA` | `#1B6B3D` | 5.62:1 |
| In-kind | `#B08A20` | `#F6EFD9` | `#7A5E11` | 5.42:1 |
| Investment | `#3C79AC` | `#E8EFF5` | `#2A5A85` | 6.24:1 |
| Programmes | `#94402A` | `#F2E8E5` | `#7A331F` | 7.52:1 |

All six checks pass on **all pairs**, not just adjacent ones, so the set survives re-sorting. **Don't lighten these back toward the brand pastels — that's exactly what failed.** `accelerator` and `blended_finance` at `:864–865` keep aliasing to programme and investment.

### Project colours — new idea, agree or kill

Each project gets a hue from a **fixed order: sage, gold, sky, teal, terracotta.** It appears on the project's icon tile, on every application belonging to it, and as a small square beside the project name. Three of Paul's four applications are for Sea Change and you can now see that without reading.

**Never cycle.** A sixth project does not get a generated hue — it falls to neutral, like the unassigned application. Colour that repeats stops meaning anything, which is worse than no colour.

This surfaced something: **one application belongs to no project at all.** It renders as a grey tile reading "No project assigned", visibly outside the scheme. That's probably a data problem worth reporting rather than styling politely.

---

## 5. What is not designed

- **Anything below the checklist.** `page.tsx` is 1,218 lines; the lime CTA at `:736` and the lime progress fill at `:785`/`:799` are in territory I haven't reviewed.
- **The member sidebar.** Still admin-only in every mockup — a real user sees five nav items, not thirteen.
- **Loading and error states** for any card.
- **Mobile.** Every mockup is desktop. The strip's three slots and the pipeline's four tiles both need a stacking rule.

---

## 6. Smaller items

**The greeting repeats the cards.** `:717–721` builds a subtitle from five conditional fragments — projects ready, deadlines this week, applications in progress, new matches, and a fallback. With the strip present, the first three are restated immediately below it. Drop them; `newMatchesThisWeek` is the only part not visible elsewhere.

**On day one the greeting becomes "Welcome, {name}."** rather than "Good evening" — same slot, different job, and the one place the onboarding warmth still belongs.

**Empty cards make one offer, not three.** Dashed border, muted glyph, one sentence on what the card will hold, one button.

---

## 7. Definition of done

- No lime `#8ECB3C` anywhere on the dashboard
- The score badge no longer shares a colour map with the funding-type tag
- The act-now strip is a white card in every state, and shows fewer than three slots when fewer qualify
- Applications are grouped in-progress / not-started, and each row names its project
- Pipeline total is the largest number on its card
- No contrast value below the floors in §4 or in the Band A spec's §2
- On a new account: matches and deadlines populated, applications / projects / pipeline in their empty states
