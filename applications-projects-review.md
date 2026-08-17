# Applications & Projects — review (final state)

End-to-end review of the live site across both sections, updated after the latest deploy. Marks what's resolved vs outstanding so this is a single current source of truth.

---

## Verdict

Both sections are in good, shippable shape. The core "where do I start" problem is solved, the two sections now read as one sequential workflow (define → write) rather than parallel twins, and a single visual language carries across both. What remains is polish plus one feature (the back-link), not structural work.

---

## Resolved (confirmed live)

- Draft-first empty answer — 3-step path, document-pencil icon, primary "Draft a starting version", quiet "write it from scratch".
- Tier-coloured score chips and ring (green ~7+, amber ~4–6, coral <4).
- Sentence case throughout (your answer, guide, tips to improve, next best fix).
- Jump to next fix, Preview/Edit toggle, inline placeholder highlight (gold block in preview).
- Empty-answer tips panel is now inert ("Tips and a score appear here once you've drafted or written").
- "How it works" contrast fixed — filled forest numbered circles with connecting line.
- Stat tiles on both landings; loading skeletons on the list.
- Creation funnel — "New application" goes straight to the funder form, with a "Start a project instead →" cross-nudge; fork retired.
- New-project stepper added (1 Describe → 2 Review & match), matching the application wizard.
- Funder-fit list — sparkle swapped to pencil; top match filled, the rest outline.
- Icon for "Start an application" unified across both sections (pencil).
- Overdue deadlines flagged in red; application rows show dates.

---

## Outstanding

### Quick polish
1. **Remaining sparkle** — the "Re-plan the answers, your answers won't change" button still uses the AI sparkle. Swap to a refresh/list icon; grep for any other sparkle usages.
2. **"Redraft" label** — an answered question still offers "Draft a starting version"; should read "Redraft" once there's content.
3. **Project row dates** — application rows show a date; project rows don't. Add for parity.
4. **"Ready to start" button style** — all filled on the Applications list vs top-filled/rest-outline on funder-fit. Low priority.

### Decision needed
5. **"Programme" badge on the projects list.** It's the AI-assigned `type_label` from `src/app/api/projects/extract/route.ts` ("programme" = ongoing multi-strand service; "campaign" = time-bound; else "project"). It's redundant inside a section called Projects, AI-guessed (sometimes wrong), drives no list behaviour, and its coral (`#993C1D`/`#FAECE7`) is off the accent palette. Recommendation: remove the badge from list rows (keep `type_label` in data), or only show it when `type_label !== 'project'`.
6. **Match-tier colours** — current green/gold vs the existing green/dusty-teal/slate palette noted elsewhere. Lock one and apply wherever match scores appear.

### Feature (main remaining)
7. **Application → project back-link** ("Part of: [project]"). The biggest missing piece — turns the two flat lists into a navigable hierarchy and resolves the duplicate "Youth Fund" rows (which dates alone don't fully separate).

---

## Bottom line

Nothing blocks use. Items 1–4 are quick; item 5 is a one-line decision; item 7 is the one feature still worth prioritising. Once the back-link is in, these sections are done.
