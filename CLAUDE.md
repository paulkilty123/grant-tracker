# Grant Tracker — Claude Code Handover

## Project
Next.js 14 App Router + Supabase + Tailwind CSS, deployed on Vercel via GitHub auto-deploy.

- **Live site:** https://granttracker.co.uk/
- **Repo:** https://github.com/paulkilty123/grant-tracker
- **Supabase project ID:** yrndczlqjqtfgissleev
- **Pricing:** £65/6 months, £115/year (beta: invitation-only)

---

## Git — Critical Workaround

The mounted `.git` directory has persistent lock files. Always use this pattern:

```bash
# 1. Copy .git to /tmp and clear locks
rm -rf /tmp/gg && cp -a .git /tmp/gg && rm -f /tmp/gg/index.lock /tmp/gg/HEAD.lock /tmp/gg/gc.log.lock

# 2. Prefix every git command with these env vars
GIT_DIR=/tmp/gg GIT_WORK_TREE=$(pwd) git fetch origin main
GIT_DIR=/tmp/gg GIT_WORK_TREE=$(pwd) git reset origin/main   # syncs to remote, keeps working tree
GIT_DIR=/tmp/gg GIT_WORK_TREE=$(pwd) git add <files>
GIT_DIR=/tmp/gg GIT_WORK_TREE=$(pwd) git commit -m "..."
GIT_DIR=/tmp/gg GIT_WORK_TREE=$(pwd) git push origin HEAD:refs/heads/main
```

**Always `fetch` + `reset origin/main` before staging** — the local tree drifts behind remote. If remote is ahead, reset brings HEAD to remote without touching your working files.

**After every push:** Vercel takes ~1 min to deploy. Verify on the live site.

---

## TypeScript Check

Always run before committing:
```bash
npx tsc --noEmit
```
Zero output = clean. Fix all errors before pushing.

---

## Design System

### Fonts
- **Space Grotesk** — headings, UI labels, nav, numbers. Dominant font (100+ usages). Applied via `fontFamily: 'var(--font-space-grotesk)'` inline or `style={{ fontFamily: "var(--font-space-grotesk)" }}`.
- **Plus Jakarta Sans** — body prose. Loaded as `--font-dm-sans` (legacy var name) and applied in `globals.css` body. Use `fontFamily: 'var(--font-plus-jakarta, Plus Jakarta Sans, sans-serif)'` or `fontFamily: 'inherit'` inside components.
- **DM Serif Display** — decorative serif only on the landing page testimonial quote. Do not use for general headings.

> Note: `CLAUDE.md` previously said "DM Serif Display for headings" — this is wrong. Space Grotesk is the heading font.

### Border Radius
Rounded corners everywhere: `rounded-xl` (cards/panels), `rounded-lg` (inputs/buttons), `rounded-md` (pills/badges). In inline styles: `borderRadius: 10–12` for cards, `borderRadius: 6–8` for inputs, `borderRadius: 999` for pills.

### Colour Tokens
| Name | Hex | Use |
|------|-----|-----|
| Forest | `#173404` | Sidebar bg, utility buttons, final CTAs |
| Lime | `#8ECB3C` | Primary CTAs, match bar, success states |
| Mid green | `#639922` | Hover states, filled accents |
| Sage | `#3B6D11` | Green text on light bg |
| Pale green | `#F1F7E4` | Green-tinted card bg |
| Cream | `#F5F1E8` | Neutral warm bg |
| Coral | `#D85A30` | Urgency, overdue |
| Charcoal | `#2C2C2A` | Primary text |
| Mid | `#5F5E5A` | Secondary text |
| Light | `#8A8986` | Tertiary/placeholder text |

### Button Hierarchy (locked rule)
- **Lime fill** (`#8ECB3C`, `#173404` text) — genuinely primary CTAs only: Find Funding, Finish & see matches, Save changes on forms, card-level + Pipeline / + Save.
- **Outline** (border `#2C2C2A`, white bg, hover fills dark) — page-level Add actions: "+ Add Opportunity" (Pipeline), "+ Add deadline" (Deadlines).
- **Forest fill** (`#173404`, `#F1F7E4` text) — utility/navigation: Search, Continue, Done.
- **Ghost/text** — lowest priority supporting actions.

### Funding Type Colours
| Type | Dot | Bg | Text |
|------|-----|-----|------|
| Grant | `#97C459` | `#F1F7E4` | `#3B6D11` |
| Programme | `#F0997B` | `#FAECE7` | `#993C1D` |
| Investment | `#85B7EB` | `#E6F1FB` | `#0C447C` |
| In-Kind | `#EF9F27` | `#FAEEDA` | `#854F0B` |

### Pipeline Stage Colours
| Stage | Bg | Text |
|-------|-----|------|
| Identified | `#F5F1E8` | `#5F5E5A` |
| Applying | `#EAF3DE` | `#3B6D11` |
| Submitted | `#C0DD97` | `#173404` |
| Won | `#639922` | `#fff` |
| Declined | `#FAECE7` | `#993C1D` |

---

## Database

### Key Tables / Views
- **`scraped_grants`** — grant catalogue (~300 rows, target 1,500+). UUID `id`, `is_active`, `url_status`, `deadline`, `apply_url`, `external_id` (null for catalogue-seeded rows).
- **`grants_with_funder`** — view joining `scraped_grants` + funder table. Primary query surface for all grant lookups.
- **`pipeline_items`** — user's CRM. `org_id`, `grant_name`, `stage`, `deadline`, `grant_url`, `created_by` (nullable, ON DELETE SET NULL).
- **`grant_interactions`** — `org_id`, `grant_id` (text, mix of UUIDs and legacy string IDs), `action` ('saved'|'dismissed'|'applied'|'liked'|'disliked'|'flagged').
- **`organisations`** — one per user (owner_id = auth.uid()).

### Important Gotcha: grant_interactions.grant_id type
`grant_interactions.grant_id` is `text`, but `scraped_grants.id` is `uuid`. When querying `grants_with_funder` with `.in('id', savedIds)`, always filter `savedIds` to valid UUID format first:

```typescript
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const savedIds = Array.from(new Set(interactions.map(r => r.grant_id).filter(id => UUID_RE.test(id))))
```

Without this filter, non-UUID legacy IDs cause a Postgres cast error, the query silently returns null, and no rows are shown.

### Seed Data
`src/lib/grants.ts` is fallback seed only — new grants go directly into Supabase.

---

## Key Library Files

| File | Purpose |
|------|---------|
| `src/lib/matching.ts` | 6-dimension match scoring (max 100): location, themes, beneficiaries (optional), grantSize, funderType, eligibility. Structure mismatch caps at 44. IDF-weighted sector scoring. |
| `src/lib/grants-normalise.ts` | Converts `scraped_grants` DB rows → `EnrichedGrant`. Note: `id = external_id ?? id` (UUID) |
| `src/lib/utils.ts` | `getDeadlineAlerts`, `formatDeadline`, `formatRange`, `PIPELINE_STAGES` |
| `src/lib/pipeline.ts` | `createPipelineItem`, `updatePipelineItem`, `updatePipelineStage`, `deletePipelineItem` |
| `src/lib/interactions.ts` | `recordInteraction`, `removeInteraction`, `getInteractions` |
| `src/lib/classify.ts` | 19-sector taxonomy + funding type classification |

---

## App Structure

```
src/app/
  dashboard/
    page.tsx           — Dashboard home (matches, pipeline summary, deadlines widget)
    pipeline/page.tsx  — Kanban CRM (5 stages, drag-drop, modal edit)
    deadlines/page.tsx — ← Main recent work (see below)
    search/page.tsx    — Find Funding (4 tabs: Grants/Programmes/Investment/In-Kind)
    profile/page.tsx   — Organisation profile + sector config
    account/page.tsx   — User account settings
  layout.tsx           — Root layout + font loading
```

---

## Deadlines Page — Current State

`src/app/dashboard/deadlines/page.tsx` (~1,450 lines). Recently overhauled. Key architecture:

### Layout
Two-column grid: list (left, ~75%) + sidebar calendar (right, 240px). Hides sidebar at ≤900px.

### Data Sources
Loaded in `loadData()`:
1. **Pipeline alerts** — all `pipeline_items` for the org, processed via `getDeadlineAlerts()`
2. **Match rows** — `grants_with_funder` with `deadline >= today`, scored via `computeMatchScore`, filtered to ≥55%, top 20
3. **Saved grants (with deadline)** — `grant_interactions` action='saved' → UUID-filtered IDs → `grants_with_funder` where `deadline >= today`
4. **Saved grants (no deadline)** — same query, split client-side, shown in "Needs a deadline" section

### Sections
- **Needs a deadline** — pipeline items without deadline + saved grants without catalogue deadline. Saved rows show a "Saved" badge; setting a date creates a pipeline item.
- **Scheduled** — merged & sorted: pipeline alerts + saved grants (with deadline) + match rows. Day-filter via calendar click.
- **Sidebar calendar** — full-cell treatment: green (has deadline), coral (urgent ≤7d), lime (selected), cream+border (today). `calMarkerMap` built from all three sources.
- **Sources filter** — Pipeline / Saved / Matches toggles with counts.

### Components (all inline in page.tsx)
- `AddDeadlineModal` — manually log a deadline not in pipeline
- `EditDeadlineModal` — edit deadline on an existing pipeline item
- `DayAlertsSheet` — multi-item day picker (pipeline items only)
- `DatePickerInput` — custom date picker replacing native `<input type="date">`
- `StageChip`, `TypeChip` — pill helpers
- `buildCalendarDays()` — Mon-start calendar grid helper

### State
```typescript
alerts            // DeadlineAlert[] — pipeline items with deadlines
noDeadlineItems   // PipelineItem[] — pipeline items without deadline
matchRows         // { grant, score }[]
savedGrantRows    // EnrichedGrant[] — saved with upcoming deadline
savedNoDeadline   // EnrichedGrant[] — saved without catalogue deadline
deadlineInputs    // Record<id, string> — pipeline date picker values
savedInputs       // Record<id, string> — saved grant date picker values
showPipeline/showSaved/showMatches  // Sources filter toggles
calYear/calMonth  // Calendar nav
dayFilter         // ISO date string | null — calendar day click filter
```

---

## Current Priorities (Beta launch: ~26 Apr 2026)

Focus is getting the product stable for beta invites. In scope now:
- Polish and bug fixes on existing pages
- Catalogue depth (currently ~300 grants, target ~500 for beta)

Deferred post-beta:
- 360Giving data import
- Borough / community foundation batch
- Funder intelligence deepening
- Readiness Score / Match Briefing feature

---

## Rules

1. **Commit after every file change.** Vercel deploys from GitHub only.
2. **TypeScript clean before every push.** `npx tsc --noEmit` must produce no output.
3. **Minimal changes.** Fix the stated problem. Don't refactor surrounding code unless asked.
4. **Verify on live site** after every push (~1 min Vercel deploy).
5. **No border-radius: 0** anywhere — rounded corners are a hard design rule.
