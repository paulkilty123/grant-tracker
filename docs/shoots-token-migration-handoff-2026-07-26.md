# Shoots design-token migration — handoff

Branch: `shoots/design-tokens` (not merged to `main`, no deploy). ~56 commits, one focused change per commit, `tsc --noEmit` clean at every single commit.

## What this branch did, in order

1. **Landed the new Shoots token set additively.** Deleted zero-importer dead code (`TopBar.tsx`, `Logo.tsx`, `ConfirmStrip`, `useAdminGate.ts`). Added the full Shoots palette to `tailwind.config.ts` + `globals.css` alongside the existing Grant Tracker tokens — nothing removed. Resolved four name collisions by renaming both sides (`sage`→`sage-deep`+new `sage`, `cream` retired+new `cream`, `border` retired→`border-warm`, `gold`→`gold-deep`+new `gold`). Added `src/config/brand.ts` and routed the 258 brand-name strings through it (except `gt_oat_`/`gt_ort_`/`gt_mcp_` wire-format prefixes, which must never rename).

2. **Built `scripts/hex-token-map.ts`** — the mapping from every old raw hex literal in `src/**/*.{ts,tsx}` to its new token. This is the load-bearing artifact for everything downstream; read its own header before touching it. Key structure: `DOC_MAPPING` (design-doc-confirmed), `POLYSEMOUS_VALUES` (occurrence-keyed — same hex, different token depending on where it appears; this is where the four funding-type dot colours and their traffic-light-borrowing admin tools live), `DECIDED_MAPPING`, `ONE_OFFS` (deliberately not tokens), `NEAREST_TOKEN_MAPPING` (algorithmic, redmean colour distance), `THREE_DIGIT_MAPPING`, `EXCLUDED_VALUES` (currently just `#5A9080` — see below), `KNOWN_GAPS`.

3. **Ran the actual sweep**: ~2,450 hex literals across ~35 directory-scoped commits, replaced with `var(--token)` or the matching Tailwind class. Deliberately out of scope and left as raw hex: `src/app/api/**` and `opengraph-image.tsx` (email HTML / Satori-rendered OG image — CSS custom properties don't resolve there, so a token reference would silently break rendering, not fix anything), the pipeline-stage colour duplication (6 independent copies of stage bg/text — explicitly told to leave this alone, it's primitives-pass work), `#8ECB3C` (RETIRED — lime is being replaced by a button-hierarchy redesign, not a token rename).

4. **Added the ESLint rule** (`.eslintrc.json`, `no-restricted-syntax`) that fails on any raw `#hex` literal in `.ts`/`.tsx` going forward, with the same file exemptions as above. Every pre-existing exception (RETIRED lime, pipeline-stage dupes, alpha-suffixed hex, two genuinely-unresolved polysemous occurrences) has an inline `eslint-disable-line` with a reason. `next lint` is clean.

5. **A follow-up audit turned up three more issues, now also fixed:**
   - **Token collapse**: 15 tokens have 3+ old distinct hex values mapped onto them; some of those collisions land in the same file/component, silently erasing a distinction that used to be visible (e.g. `#5A9080` — excluded rather than force-mapped, because every candidate ordinal rung either collides with an adjacent tier's own colour or is the wrong role; see `EXCLUDED_VALUES` in the mapping file for the full reasoning).
   - **Pale-tint mismapping**: the nearest-token algorithm mapped several deliberately-tinted values to generic neutral tokens because each looked individually close to a neutral in isolation. Fixed: the danger-delete-org card and a scan-feedback error banner in `profile/page.tsx` (both had lost their pink/red tint to `surface-page`), and `TAB_INACTIVE_STYLES` in `search/page.tsx` (a 4-way funding-type tab scheme whose backgrounds had all independently collapsed to the same neutral token, and whose icon/count colours were borrowing semantic state tokens for category identity — the same category-vs-state confusion already fixed elsewhere). Added two new tokens for this, `teal-deep` and `terra-deep` (`tailwind.config.ts` + `globals.css`), following the existing `gold-deep`/`sage-deep` precedent — **contrast on their own pale background is ~3.0–3.24:1 for all four of `gold-deep`/`teal-deep`/`terra-deep`/`sage-deep`, which is consistent with the existing `gold-deep` precedent but does NOT hit 4.5:1 text-AA. A real accessibility pass across these four is still needed, not done here.**
   - **RGBA/rgb/hsl blind spot**: the hex sweep and lint rule only ever saw `#hex` — 370 functional-notation colour literals existed across 45 files, 88 of them an exact RGB-shadow of a hex already tracked in the mapping file. Converted the 68 that were confirmed sitting within 15 lines of that same token's `var()` usage (i.e. definitely the same component, definitely now mismatched) to `color-mix(in srgb, var(--token) N%, transparent)`. Left alone: ~86 legitimate neutral `rgba(0,0,0,*)`-style shadows/overlays, and ~20 non-adjacent shadow values that weren't confirmed alongside a collision.

6. **Added `scripts/check-functional-colors.mjs`** (`npm run lint:colors`) — a CI script, not a custom ESLint rule (arithmetic-on-parsed-channels isn't expressible as a `no-restricted-syntax` selector, and this repo's `.eslintrc.json` is the legacy config format; a real custom rule wants flat config or a plugin package, bigger than warranted). Reuses `hex-token-map.ts`'s mapping rather than reverse-parsing `tailwind.config.ts`'s live colour list — important distinction, some rows are a deliberate rebrand repaint (`#173404`, old dark-forest-green, maps to `deep`, whose current value `#1D3C3E` is a different hue entirely), and the live config still carries the old value under legacy alias names, so a fresh reverse-lookup would suggest the wrong, pre-rebrand token.

## State right now

- `tsc --noEmit` clean, `next lint` clean, both token sets still fully coexisting (nothing old removed).
- **`npm run lint:colors` currently exits 1 — 154 findings.** These are pre-existing raw rgba/rgb/hsl values that exactly match a known token (the ~20 non-adjacent ones from the audit, plus others this more exhaustive scan turned up that the manual proximity check didn't specifically enumerate). Building the check was the ask; it hasn't been used to clear the backlog yet, and isn't wired into any CI gate.
- Branch has **not** been pushed before this session — check `git push` status before assuming it's backed up.
- Not merged to `main`. Per this repo's standing discipline, `main` only moves on Paul's explicit go, through the deploy gate (regression suites, accent check, free-surface fingerprint, named rollback).

## Deliberately NOT done (primitives-pass work, flagged not fixed)

- **6-way pipeline-stage colour duplication** (`STAGE_STYLE` in `deadlines/page.tsx` and `briefing/PlanView.tsx`, `STAGE_BG_HEX` in `pipeline/page.tsx`, `tones` in `PipelineModal.tsx`, `stageData` in `dashboard/page.tsx`, `STAGE_COLOURS` in `admin/users/[id]/page.tsx`) — explicitly told to leave alone.
- **`FT_BRAND`** (`grants/[id]/page.tsx`) and similar funding-type badge objects elsewhere in the app have the exact same category-vs-state conflation `TAB_INACTIVE_STYLES` had (bg/text on `state-success`/`state-error`/`state-info`/`state-warning` pale/solid pairs, only the dot on the true `type-*` token) — **not fixed**, only the one occurrence explicitly named was in scope this session.
- **`gold-deep` vs `state-warning`** consolidation candidate — visually close, kept deliberately separate (one decorative, one semantic), noted in `tailwind.config.ts` as a primitives-pass candidate.
- The 154 `lint:colors` findings above.
- Full WCAG contrast pass on `gold-deep`/`teal-deep`/`terra-deep`/`sage-deep` as text/icon colours.

## Key files if you're picking this back up

- `scripts/hex-token-map.ts` — the mapping data + full rationale for every non-obvious call. Read its header first.
- `scripts/check-functional-colors.mjs` — the new rgba/rgb/hsl check, run via `npm run lint:colors`.
- `tailwind.config.ts` + `src/app/globals.css` — dual-defined tokens (old Grant Tracker + new Shoots), kept in lockstep by hand so far.
- `.eslintrc.json` — the `no-restricted-syntax` hex rule + file exemptions.
