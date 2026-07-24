/**
 * Hex sweep mapping — old raw hex literal -> new Shoots token.
 *
 * FOR REVIEW ONLY. This file is data, not a script: nothing imports or runs
 * it, and no substitution has been performed.
 *
 * Source population: every distinct 6-digit hex literal found in `src/**\/*.{ts,tsx}`,
 * excluding the four token-definition files (tailwind.config.ts, globals.css,
 * builder/tokens.ts, and this file itself). 165 distinct values as of the
 * gold-collision commit, covered by tiers 1-4, 5, 6, 7 below. Tier 5b adds
 * the 9 real 3-digit hex values (142 occurrences) that scan structurally
 * could not see — folded in once found rather than left as a silent gap.
 * See KNOWN_GAPS at the bottom for what's still outstanding.
 *
 * ============================================================
 * WHY THIS FILE CHANGED SHAPE
 * ============================================================
 * The original version was purely value-keyed: one row per hex, one target
 * token. That broke down for #85B7EB and #EF9F27 — both are a funding-type
 * "dot" colour in some files and something completely unrelated (an admin
 * data-provenance bar, a match-score-band border, a citation-confidence
 * chip) in others. A value-keyed sweep would have repainted those unrelated
 * occurrences into funding-type colours by coincidence.
 *
 * The requested re-audit (checking all 165 values against a full inventory
 * of every categorical colour-scheme in the codebase, not just the ones
 * already under discussion) found the SAME problem in two more places:
 * #F0997B and #97C459 — see POLYSEMOUS_VALUES. All four turn out to be the
 * complete Grant/Programme/Investment/In-Kind funding-type dot family. That
 * is not a coincidence: these four hexes are the only ones in the palette
 * playing an ARBITRARY CATEGORY-BRAND role (which funding type is this)
 * rather than a STATE role (is this good/bad/warning/info) — and admin
 * tooling had repeatedly borrowed them for ad hoc "traffic-light" tiers
 * because they happen to look the part. Nothing else in the 165 behaves
 * this way: the state-coloured values (green/amber/coral/blue and their
 * pales) are reused dozens of times across match-quality tiers, pipeline
 * stages, profile-completion bands, submission statuses, etc., but always
 * meaning the SAME thing (good/warning/bad/info) — safe to map once.
 *
 * Seven tiers now, in descending order of trust:
 *
 * 1. DOC_MAPPING (23) — shoots-app-tokens.md's own table, minus the two
 *    entries that turned out to be polysemous (#97C459, #F0997B — moved to
 *    tier 2, their TRUE-occurrence target is unchanged from what the doc/
 *    confirmed decision said).
 *
 * 2. POLYSEMOUS_VALUES (4) — occurrence-keyed. Every file:line the value
 *    appears in, each with its own target or `EXCLUDE-needs-triage`. Fully
 *    resolved as of the ordinal-scale pass: every occurrence now has a real
 *    target except briefing/ui.tsx's MIX_COLOR.capital (genuinely different
 *    taxonomy) and dashboard/page.tsx's pipeline "declined" marker
 *    (deliberately deferred to the primitives pass, per instruction).
 *
 * 3. DECIDED_MAPPING (9) — the 6 resolved orphans/flagged-dots from the usage
 *    report (minus #85B7EB/#EF9F27, which moved to tier 2 as polysemous) plus
 *    #BA7517 (moved out of tier 5 once gold-deep existed as its exact match)
 *    plus #EEEDFE/#3C3489 (the sector-pill bg/text pair, moved out of tier 5
 *    and decided together onto status-invite/status-invite-pale so the pair
 *    stays visually coherent). Each row carries the reasoning, including the
 *    places semantic role or pair-coherence overrode raw colour distance
 *    (#FFB74D, #C96A00, #3C3489).
 *
 * 4. ONE_OFFS (2) — deliberately NOT tokens. #F4A0A0/#6dbf6d, now a named
 *    `FEEDBACK_CHART` constant in admin/feedback/page.tsx rather than a
 *    swept value.
 *
 * 5. NEAREST_TOKEN_MAPPING (126) — algorithmic redmean colour-distance
 *    assignment, minus #BA7517/#EEEDFE/#3C3489 (moved to tier 3) and
 *    #5A9080 (moved to tier 7, EXCLUDED_VALUES).
 *
 * 5b. THREE_DIGIT_MAPPING (9) — the 3-digit hex shorthand population
 *    (#fff/#888/#666/#eee/#c00/#999/#444/#ddd/#aaa; #163 excluded as the
 *    `&#163;` HTML-entity false positive). Outside the original 6-digit
 *    scan's reach, found and resolved in the same pass as the 5A9080/
 *    sector-tag decisions. No polysemy — each value plays one consistent
 *    role everywhere — but 3 rows override the numerically-nearest token
 *    for role (#c00, #444, #aaa), same as tier 3.
 *
 * 6. ORPHANS (0) — empty. All 7 from the usage report are now decided
 *    (tiers 2 and 3). Kept as an export for structural completeness.
 *
 * 7. EXCLUDED_VALUES (1) — #5A9080 only. Ordinal in role but every candidate
 *    ordinal rung either collides with an adjacent tier's colour in the same
 *    component or is the wrong role entirely — see the export for the full
 *    reasoning. Left excluded rather than guessed.
 *
 * KNOWN_GAPS at the bottom is this pass's own discovery, not yet acted on —
 * surfaced per instruction rather than silently absorbed into a "close
 * enough" nearest-token guess.
 */

export type MappingSource = 'doc' | 'nearest'

export interface DocMappingRow {
  hex: string
  count: number
  token: string
  risk: string
  source: 'doc'
}

export interface PolysemousOccurrence {
  file: string
  line: number
  target: string // a real token name, or the literal string 'EXCLUDE-needs-triage'
  note: string
}

export interface PolysemousValue {
  hex: string
  count: number
  trueRoleTarget: string // what it becomes IF the occurrence is the real category role
  occurrences: PolysemousOccurrence[]
}

export interface DecidedRow {
  hex: string
  count: number
  token: string
  reasoning: string
}

export interface OneOffRow {
  hex: string
  count: number
  reason: string
  extractedTo: string
}

export interface NearestMappingRow {
  hex: string
  count: number
  token: string
  distance: number
  source: 'nearest'
}

export interface OrphanRow {
  hex: string
  count: number
  nearestGuess: string
  distance: number
}

// ==== 1. DOC-SPECIFIED (shoots-app-tokens.md mapping table) — 23 values ====
// (25 in the doc's own table, minus #97C459 and #F0997B — see POLYSEMOUS_VALUES)
export const DOC_MAPPING: DocMappingRow[] = [
  { hex: '#5F5E5A', count: 268, token: 'text-muted', risk: 'none', source: 'doc' },
  { hex: '#2C2C2A', count: 266, token: 'text-body', risk: 'none', source: 'doc' },
  { hex: '#173404', count: 172, token: 'deep', risk: 'HIGH — the repaint', source: 'doc' },
  { hex: '#8ECB3C', count: 163, token: 'RETIRED — no direct token, see Button hierarchy', risk: 'HIGH — the repaint', source: 'doc' },
  { hex: '#8A8986', count: 162, token: 'text-subtle', risk: 'none (value also updates to #8A978F)', source: 'doc' },
  { hex: '#3B6D11', count: 149, token: 'state-success', risk: 'none', source: 'doc' },
  { hex: '#993C1D', count: 94, token: 'state-error', risk: 'none', source: 'doc' },
  { hex: '#639922', count: 87, token: 'sage-deep', risk: 'none', source: 'doc' },
  { hex: '#F1F7E4', count: 81, token: 'state-success-pale', risk: 'low, consolidates', source: 'doc' },
  { hex: '#F5F1E8', count: 65, token: 'surface-sunken', risk: 'none (value updates to #F6F1E7)', source: 'doc' },
  { hex: '#FAFAF7', count: 59, token: 'surface-page', risk: 'none (value updates to #FBF9F4)', source: 'doc' },
  { hex: '#FAECE7', count: 57, token: 'terra-pale / state-error-pale', risk: 'none', source: 'doc' },
  { hex: '#E8E0D1', count: 51, token: 'border-warm', risk: 'none', source: 'doc' },
  { hex: '#008080', count: 48, token: 'teal', risk: 'low, admin only (value updates to #4EAAB4). Heads up: teal is ALSO now type-programme — two concepts converge on one colour post-sweep. Not a mapping error (both were independently decided), just a cosmetic overlap worth a glance in the primitives pass.', source: 'doc' },
  { hex: '#854F0B', count: 46, token: 'state-warning', risk: 'none', source: 'doc' },
  { hex: '#FFFFFF', count: 33, token: 'surface-card', risk: 'none', source: 'doc' },
  { hex: '#0C447C', count: 33, token: 'state-info', risk: 'none', source: 'doc' },
  { hex: '#FAEEDA', count: 32, token: 'gold-pale / state-warning-pale', risk: 'none', source: 'doc' },
  { hex: '#D85A30', count: 32, token: 'terra', risk: 'none (value updates to #D67558)', source: 'doc' },
  { hex: '#EAF3DE', count: 28, token: 'state-success-pale', risk: 'none', source: 'doc' },
  { hex: '#C0DD97', count: 27, token: 'sage-pale', risk: 'none', source: 'doc' },
  { hex: '#E6F1FB', count: 25, token: 'sky-pale / state-info-pale', risk: 'none', source: 'doc' },
  { hex: '#F1F0EA', count: 21, token: 'surface-pill', risk: 'none', source: 'doc' },
]

// ==== 2. POLYSEMOUS_VALUES — occurrence-keyed, 4 values ====
// The complete funding-type dot family (Grant/Programme/Investment/In-Kind).
// Every occurrence below was verified directly (grep + read), not inferred.
export const POLYSEMOUS_VALUES: PolysemousValue[] = [
  {
    hex: '#97C459',
    count: 16,
    trueRoleTarget: 'sage', // per doc: this is green-text-nav, a brand accent — NOT type-grant
    occurrences: [
      { file: 'src/app/grants/[id]/page.tsx', line: 43, target: 'sage', note: 'FT_BRAND.grant.dot — true funding-type Grant dot' },
      { file: 'src/app/grants/[id]/page.tsx', line: 350, target: 'sage', note: 'Grant chip border, same FT_BRAND rendering' },
      { file: 'src/app/dashboard/deadlines/page.tsx', line: 21, target: 'sage', note: 'TYPE_DOT.grant — true funding-type Grant dot' },
      { file: 'src/app/dashboard/deadlines/page.tsx', line: 89, target: 'sage', note: 'TYPE_CHIPS grant entry — true funding-type Grant dot' },
      { file: 'src/app/dashboard/projects/[id]/page.tsx', line: 55, target: 'sage', note: 'FUNDING_TYPE_STYLE.grant.dot — true funding-type Grant dot' },
      { file: 'src/components/briefing/ui.tsx', line: 31, target: 'EXCLUDE-needs-triage', note: "MIX_COLOR.capital — a DIFFERENT taxonomy (funding CHARACTER: unrestricted/project/capital, not funding TYPE: grant/programme/investment/in_kind). 'capital' is not 'Grant'; don't assume the correlation. Not decorative brand-green either, so it doesn't fold into the resolution below — categorical mismatch, needs its own call." },
      { file: 'src/app/opengraph-image.tsx', line: 77, target: 'sage', note: 'OG image wordmark/domain text colour — decorative brand-green, same resolution as the footer occurrences below' },
      { file: 'src/app/opengraph-image.tsx', line: 80, target: 'sage', note: 'OG image tagline text colour — decorative brand-green' },
      { file: 'src/components/landing/LandingPage.tsx', line: 1146, target: 'sage', note: 'Footer text colour — decorative brand-green, no graded/categorical role; resolves to the brand accent like the rest of the marketing surface' },
      { file: 'src/components/landing/LandingPage.tsx', line: 1159, target: 'sage', note: 'Footer nav links colour — decorative brand-green' },
      { file: 'src/components/landing/LandingPage.tsx', line: 1167, target: 'sage', note: 'Footer bottom row colour — decorative brand-green' },
      { file: 'src/components/landing/LandingPage.tsx', line: 1170, target: 'sage', note: 'Footer "Privacy" link colour — decorative brand-green' },
      { file: 'src/components/landing/LandingPage.tsx', line: 1171, target: 'sage', note: 'Footer "Terms" link colour — decorative brand-green' },
      { file: 'src/app/apply/page.tsx', line: 278, target: 'sage', note: 'Footer nav links colour — decorative brand-green, same pattern as LandingPage' },
      { file: 'src/app/apply/page.tsx', line: 286, target: 'sage', note: 'Footer bottom row colour — decorative brand-green' },
      { file: 'src/app/onboarding/wizard/page.tsx', line: 27, target: 'sage', note: "Local token object's `greenSoft` — confirmed via read: progress-dot fill for a completed onboarding step (T.greenSoft for done, T.greenMid for current, grey for future). Binary done/not-done marker, not a multi-tier graded indicator — decorative brand-green like the marketing occurrences, not ordinal." },
    ],
  },
  {
    hex: '#F0997B',
    count: 13,
    trueRoleTarget: 'type-programme', // CONFIRMED decision: Programme = teal #4EAAB4
    occurrences: [
      { file: 'src/app/grants/[id]/page.tsx', line: 44, target: 'type-programme', note: "FT_BRAND.programme.dot — true funding-type Programme dot" },
      { file: 'src/app/grants/[id]/page.tsx', line: 45, target: 'type-programme', note: 'FT_BRAND.support_programme.dot — same Programme category' },
      { file: 'src/app/grants/[id]/page.tsx', line: 46, target: 'type-programme', note: 'FT_BRAND.accelerator.dot — same Programme category' },
      { file: 'src/app/dashboard/deadlines/page.tsx', line: 22, target: 'type-programme', note: 'TYPE_DOT.programme — true funding-type Programme dot' },
      { file: 'src/app/dashboard/deadlines/page.tsx', line: 90, target: 'type-programme', note: 'TYPE_CHIPS programme entry — true funding-type Programme dot' },
      { file: 'src/app/dashboard/projects/[id]/page.tsx', line: 56, target: 'type-programme', note: 'FUNDING_TYPE_STYLE.programme.dot — true funding-type Programme dot' },
      { file: 'src/app/dashboard/page.tsx', line: 1123, target: 'EXCLUDE-needs-triage', note: "Verified via context (comment above says 'declined (with coral marker)'): this is a PIPELINE-STAGE 'declined' marker, not Programme. Coincidental hex reuse. Stays excluded rather than resolving to the ordinal scale — this is the 6-way pipeline-stage duplication the user has explicitly said to leave alone for the primitives pass, not a graded/ordinal indicator." },
      { file: 'src/app/dashboard/admin/urls/page.tsx', line: 4541, target: 'ordinal-2-fair', note: "Tag-audit disagreement score tier: >=12 coral (worst), >=6 THIS (declining), else neutral cream. Ordinal in role (3-tier severity scale) but the polarity runs the opposite way from the quality-page tiers below — here the middle tier is 'getting worse', not 'good but not best' — so it resolves to ordinal-2-fair, not ordinal-3-good." },
      { file: 'src/app/dashboard/admin/application-review/ReviewSpikeForm.tsx', line: 557, target: 'state-error', note: 'Verified via context: generic `draftError` banner border, not a Programme badge despite matching the bg/text/border triple by coincidence. Binary error state, not a graded tier — resolves to state-error, not the ordinal scale.' },
      { file: 'src/app/dashboard/admin/application-review/ReviewSpikeForm.tsx', line: 562, target: 'state-error', note: 'Same generic `error` banner border, second occurrence — same reasoning as line 557.' },
      { file: 'src/app/dashboard/admin/quality/page.tsx', line: 212, target: 'ordinal-3-good', note: "Field-coverage bar: >=90% lime (best), >=70% THIS (good, not best), else coral (worst). Clean 3-tier graded scale, middle tier -> ordinal-3-good." },
      { file: 'src/app/dashboard/admin/quality/page.tsx', line: 276, target: 'ordinal-3-good', note: "Data-provenance colour switch, '360giving' source (trust 80 per the field_provenance trust ladder in CLAUDE.md) — the second-highest tier after admin (100). Graded by trust level, per the instruction that provenance indicators resolve to the ordinal scale; 360giving's relative position (2nd of the ranked sources) maps to ordinal-3-good, the 2nd-highest rung." },
      { file: 'src/app/dashboard/admin/quality/page.tsx', line: 350, target: 'ordinal-3-good', note: 'Sector/beneficiary tag-density tier: >=10 lime (best), >=3 THIS (good, not best), else coral (worst). Identical shape to the field-coverage bar above -> same ordinal-3-good resolution.' },
    ],
  },
  {
    hex: '#85B7EB',
    count: 11,
    trueRoleTarget: 'type-investment', // decision this session: same class of call as Programme
    occurrences: [
      { file: 'src/app/grants/[id]/page.tsx', line: 47, target: 'type-investment', note: 'FT_BRAND.social_investment.dot — true funding-type Investment dot' },
      { file: 'src/app/grants/[id]/page.tsx', line: 48, target: 'type-investment', note: 'FT_BRAND.loan.dot — same Investment category' },
      { file: 'src/app/grants/[id]/page.tsx', line: 49, target: 'type-investment', note: 'FT_BRAND.equity.dot — same Investment category' },
      { file: 'src/app/grants/[id]/page.tsx', line: 50, target: 'type-investment', note: 'FT_BRAND.blended_finance.dot — same Investment category' },
      { file: 'src/app/dashboard/page.tsx', line: 850, target: 'type-investment', note: 'TYPE_BAR.investment — chart-bar fill + card accent, same Investment category, different visual role' },
      { file: 'src/app/dashboard/page.tsx', line: 852, target: 'type-investment', note: 'TYPE_BAR.blended_finance — same Investment category' },
      { file: 'src/app/dashboard/projects/[id]/page.tsx', line: 57, target: 'type-investment', note: 'FUNDING_TYPE_STYLE.investment.dot — true funding-type Investment dot' },
      { file: 'src/app/dashboard/deadlines/page.tsx', line: 23, target: 'type-investment', note: 'TYPE_DOT.investment — true funding-type Investment dot' },
      { file: 'src/app/dashboard/deadlines/page.tsx', line: 91, target: 'type-investment', note: 'TYPE_CHIPS investment entry — true funding-type Investment dot' },
      { file: 'src/components/briefing/ui.tsx', line: 32, target: 'type-investment', note: "MIX_COLOR.investment — same Investment concept in the funding-CHARACTER mix system, consistent with funding-type Investment" },
      { file: 'src/app/dashboard/admin/quality/page.tsx', line: 274, target: 'ordinal-2-fair', note: "Data-provenance colour switch, 'ai_classifier' source (an ai_* source, trust 60 per the trust ladder) — ranks below 360giving (80, -> ordinal-3-good above) but above scraper (40, left as plain grey in this switch, not one of our 4 polysemous values). Resolves to ordinal-2-fair, the next rung down." },
    ],
  },
  {
    hex: '#EF9F27',
    count: 8,
    trueRoleTarget: 'type-inkind', // decision this session: same class of call as Programme
    occurrences: [
      { file: 'src/app/grants/[id]/page.tsx', line: 51, target: 'type-inkind', note: 'FT_BRAND.in_kind.dot — true funding-type In-Kind dot' },
      { file: 'src/app/grants/[id]/page.tsx', line: 52, target: 'type-inkind', note: "FT_BRAND['in-kind'].dot — same In-Kind category, hyphen-variant key" },
      { file: 'src/app/dashboard/page.tsx', line: 848, target: 'type-inkind', note: 'TYPE_BAR.in_kind — chart-bar fill + card accent, same In-Kind category, different visual role' },
      { file: 'src/app/dashboard/deadlines/page.tsx', line: 24, target: 'type-inkind', note: 'TYPE_DOT.in_kind — true funding-type In-Kind dot' },
      { file: 'src/app/dashboard/deadlines/page.tsx', line: 92, target: 'type-inkind', note: 'TYPE_CHIPS in_kind entry — true funding-type In-Kind dot' },
      { file: 'src/app/dashboard/projects/[id]/page.tsx', line: 58, target: 'type-inkind', note: 'FUNDING_TYPE_STYLE.in_kind.dot — true funding-type In-Kind dot' },
      { file: 'src/app/dashboard/projects/[id]/page.tsx', line: 116, target: 'state-warning', note: "Reuses FUNDING_TYPE_STYLE.in_kind.dot as a generic 'Worth checking' warning-list bullet — nothing to do with a grant's actual funding type. Binary warning marker, not a graded tier -> state-warning, not the ordinal scale." },
      { file: 'src/app/dashboard/admin/cohort-match-audit/page.tsx', line: 35, target: 'ordinal-3-good', note: "SCORE_BAND: Good(>=80)/Moderate(65-79, THIS)/Weak(45-64)/Poor(<45) — a clean 4-tier scale matching the ordinal scale's 4 rungs 1:1 in count and relative position. 'Moderate' is 2nd-from-top -> ordinal-3-good, the 2nd-highest rung." },
      { file: 'src/components/admin/GrantEditor.tsx', line: 230, target: 'ordinal-3-good', note: "CONFIDENCE_STYLES 'med' border (as #EF9F2766, with alpha) — middle of a 3-tier high/med/low citation-confidence scale, same 'good, not best' shape as the quality-page tiers -> ordinal-3-good for consistency." },
    ],
  },
]
// Note: MIX_COLOR (briefing/ui.tsx) doesn't have a 'grant' entry (only
// unrestricted/project/capital/investment/in_kind), so #97C459 has no
// MIX_COLOR occurrence to classify — capital's own value is what's listed
// above under EXCLUDE-needs-triage.
//
// Implementation note for whoever runs the eventual sweep: repainting a
// dot alone is not enough. Every TRUE occurrence above is one field in a
// larger {bg, text, dot} (or {colour, pillBg, pillFg}) triple for its
// funding type. Programme/Investment/In-Kind's dot is moving to teal/terra/
// sage but their CURRENT bg/text neighbours (coral-pale/coral-deep for
// Programme, blue-pale/blue-deep for Investment, amber-pale/amber-deep for
// In-Kind) are not being repainted by this file at all — they already map
// safely via DOC_MAPPING/NEAREST_TOKEN_MAPPING to their own destinations,
// which is fine value-by-value but will leave each funding-type badge
// visually incoherent (new-coloured dot, old-coloured bg/text) until the
// primitives pass updates each {bg, text, dot} triple together, per type,
// in one edit.

// ==== 3. DECIDED_MAPPING — from the usage report, 6 values ====
export const DECIDED_MAPPING: DecidedRow[] = [
  {
    hex: '#FAC775', count: 3, token: 'gold',
    reasoning: 'Icon-chip background (Exclusions callout) + pipeline progress-bar low-band fill. Distance to gold: 29.6 — near-identical. Both real roles match gold\'s own definition (decorative accent, icon chips).',
  },
  {
    hex: '#FFB74D', count: 1, token: 'gold-deep',
    reasoning: "CORRECTED from the initial recommendation (gold). This is TEXT colour on the GrantDetailModal 'Amount' figure — gold (#EBCE78) is a pale background/accent token and would fail contrast as text. gold-deep (#BA7517) is the text-on-pale role. Distance to gold-deep: 90.9 (vs 84.1 to gold) — slightly further by raw colour, but correct by role.",
  },
  {
    hex: '#C96A00', count: 1, token: 'state-warning',
    reasoning: "Overridden from the closer colour match (gold-deep, distance 47.8) to the correct semantic token (state-warning, distance 124.4 — much further). This is the `warn` style on the admin feedback page, gated on a real threshold (>=3 events, >=70% negative) — genuine semantic warning duty, not decoration. Same decorative-vs-semantic split as the gold-deep/state-warning distinction itself: don't let a closer colour match override a value that's actually doing semantic work.",
  },
  {
    hex: '#6D28D9', count: 2, token: 'type-programme',
    reasoning: "GrantDetailModal.tsx's own FUNDING_TYPE_BADGES map colours 'support_programme'/'programme' purple, while every other file in the app colours the same Programme category salmon (#F0997B, itself now -> type-programme/teal). This is an existing within-component inconsistency, not a deliberate distinct colour — retire the purple, unify with the rest of the app. FLAG for the primitives pass: GrantDetailModal.tsx's badge map needs its Programme entry's bg/text pair updated to match FT_BRAND's scheme too, not just the colour swapped in isolation.",
  },
  {
    hex: '#1D4ED8', count: 1, token: 'state-info',
    reasoning: "Text colour on GrantDetailModal's 'Opens {date}' reopening-notice badge — informational in role despite being a much more saturated 'royal blue' than any current info token (distance 98.5). Single low-traffic occurrence (conditional on next_open_date being set) makes the value shift low-risk either way.",
  },
  {
    hex: '#6B21A8', count: 2, token: 'status-invite',
    reasoning: "NEW token, now built (this session) — added to tailwind.config.ts + globals.css as status-invite (#6B21A8) / status-invite-pale (#F3EDFA). A real, recurring, cross-file status (dashboard/page.tsx + dashboard/search/page.tsx's 'Invite only' badge, both using the identical bg/text pair) with no purple anywhere else in the new palette to fall back on. Token exists; the 2 call sites are not yet repointed to it (that's the sweep).",
  },
  {
    hex: '#BA7517', count: 11, token: 'gold-deep',
    reasoning: "Moved out of NEAREST_TOKEN_MAPPING, not newly decided by the usage report — flagging the correction here rather than losing it. Originally auto-assigned to terra at distance 107.4 (a poor match) because gold-deep didn't exist as a candidate yet when that tier was first computed. Now that the gold collision is resolved, #BA7517 IS gold-deep's exact value (distance 0.0) — this was always amber-saturated, the same value gold-deep aliases to.",
  },
  {
    hex: '#EEEDFE', count: 4, token: 'status-invite-pale',
    reasoning: "SECTOR_PILL background for 3 impact-sector tags (education/housing/employment) in search/page.tsx's GrantCard — single-use decorative, nothing to do with funding type or invite status. Nearest candidate is status-invite-pale at 10.3 (an excellent raw-colour fit) once that token existed as a candidate; second-nearest (state-info-pale / type-programme-pale, both 16.4) would tie a sector tag to an unrelated concept just as coincidentally. Paired with #3C3489 below (same SECTOR_PILL's text colour) — moved together onto the status-invite/status-invite-pale pair rather than each independently nearest-matched, to avoid the exact half-a-pair mismatch caught earlier with #F4A0A0/#6dbf6d (a purple bg with, say, a blue text colour would look like a rendering bug, not a deliberate two-tone tag).",
  },
  {
    hex: '#3C3489', count: 4, token: 'status-invite',
    reasoning: "SECTOR_PILL text colour, paired with #EEEDFE above. Independently, state-info is the closer raw match (80.2 vs 95.6 to status-invite) — but resolving the pair to different hue families (status-invite-pale bg + state-info text = purple-tinted bg with blue text) would be visually incoherent. Kept with its bg partner on status-invite/status-invite-pale: both are coincidental nearest-token reuse (sector tagging has no real relationship to invite-only status), flagged here so a future reader isn't confused by the token name — a real sector-tag palette is a candidate for the primitives pass, not built here.",
  },
]

// ==== 4. ONE_OFFS — deliberately NOT tokens, 2 values ====
export const ONE_OFFS: OneOffRow[] = [
  {
    hex: '#f4a0a0', count: 3,
    reason: "Pastel negative/down-vote colour, paired with #6dbf6d, in 3 chart widgets on ONE admin page (activity bar chart, legend swatch, reason-chip proportion bar). No analog anywhere in the new token system — every new semantic token is much darker/more saturated than this pastel register.",
    extractedTo: "src/app/dashboard/admin/feedback/page.tsx — FEEDBACK_CHART.negative (this session)",
  },
  {
    hex: '#6dbf6d', count: 3,
    reason: "Pastel positive/up-vote colour, paired with #f4a0a0 (see above). Was ALSO in NEAREST_TOKEN_MAPPING originally, mapped to text-subtle at a poor 106.7 distance — mapping one half of the pair without the other would have left the chart mismatched, which is why both are excluded together.",
    extractedTo: "src/app/dashboard/admin/feedback/page.tsx — FEEDBACK_CHART.positive (this session)",
  },
]

// ==== 5. NEAREST-TOKEN (algorithmic, redmean colour distance) — 126 values ====
// (131 originally, minus #6dbf6d — moved to ONE_OFFS, paired with #F4A0A0 —
// minus #BA7517/#EEEDFE/#3C3489 — moved to DECIDED_MAPPING — and minus
// #5A9080 — moved to EXCLUDED_VALUES, see the ordinal-scale pass notes there)
export const NEAREST_TOKEN_MAPPING: NearestMappingRow[] = [
  { hex: '#1A3C2E', count: 18, token: 'surface-inverse', distance: 27.5, source: 'nearest' },
  { hex: '#6B6B6B', count: 17, token: 'text-muted', distance: 21.7, source: 'nearest' },
  { hex: '#E8DDD0', count: 15, token: 'border-warm', distance: 6.2, source: 'nearest' },
  { hex: '#1C1C2E', count: 14, token: 'text-body', distance: 44.6, source: 'nearest' },
  { hex: '#E9E6DD', count: 13, token: 'border-warm', distance: 21.2, source: 'nearest' },
  { hex: '#4A7C59', count: 13, token: 'text-muted', distance: 50.1, source: 'nearest' },
  { hex: '#FAF7F2', count: 12, token: 'surface-page', distance: 5.2, source: 'nearest' },
  { hex: '#F4F9ED', count: 11, token: 'surface-page', distance: 15.6, source: 'nearest' },
  { hex: '#C9963A', count: 11, token: 'terra', distance: 82.4, source: 'nearest' },
  { hex: '#F0EDE2', count: 10, token: 'surface-pill', distance: 13.1, source: 'nearest' },
  { hex: '#E4E2DA', count: 10, token: 'border-warm', distance: 15.2, source: 'nearest' },
  { hex: '#3F6814', count: 8, token: 'state-success', distance: 12.7, source: 'nearest' },
  { hex: '#F0EFEB', count: 7, token: 'surface-pill', distance: 3.0, source: 'nearest' },
  { hex: '#DCE8C8', count: 6, token: 'border-warm', distance: 29.0, source: 'nearest' },
  { hex: '#9B9B9B', count: 6, token: 'text-subtle', distance: 34.0, source: 'nearest' },
  { hex: '#006666', count: 6, token: 'state-info', distance: 79.7, source: 'nearest' },
  { hex: '#B91C1C', count: 5, token: 'state-error', distance: 82.6, source: 'nearest' },
  { hex: '#A06060', count: 5, token: 'terra', distance: 99.4, source: 'nearest' },
  { hex: '#F7F4EF', count: 4, token: 'surface-sunken', distance: 13.0, source: 'nearest' },
  { hex: '#F0F7F2', count: 4, token: 'surface-pill', distance: 18.2, source: 'nearest' },
  { hex: '#E0DFD9', count: 4, token: 'border-warm', distance: 18.0, source: 'nearest' },
  { hex: '#6B6A67', count: 4, token: 'text-muted', distance: 19.3, source: 'nearest' },
  { hex: '#FF7043', count: 3, token: 'terra', distance: 76.9, source: 'nearest' },
  { hex: '#E5E2D7', count: 3, token: 'border-warm', distance: 10.8, source: 'nearest' },
  { hex: '#E0E0DC', count: 3, token: 'border-warm', distance: 21.0, source: 'nearest' },
  { hex: '#D9D6CB', count: 3, token: 'border-warm', distance: 33.5, source: 'nearest' },
  { hex: '#C97B1A', count: 3, token: 'terra', distance: 95.0, source: 'nearest' },
  { hex: '#B94040', count: 3, token: 'state-error', distance: 75.2, source: 'nearest' },
  { hex: '#9A978E', count: 3, token: 'text-subtle', distance: 25.7, source: 'nearest' },
  { hex: '#7CC242', count: 3, token: 'sage-deep', distance: 104.3, source: 'nearest' },
  { hex: '#7A4E10', count: 3, token: 'state-warning', distance: 19.2, source: 'nearest' },
  { hex: '#7A3030', count: 3, token: 'state-error', distance: 62.5, source: 'nearest' },
  { hex: '#27500A', count: 3, token: 'state-success', distance: 66.2, source: 'nearest' },
  { hex: '#FEFCF8', count: 2, token: 'surface-page', distance: 9.7, source: 'nearest' },
  { hex: '#FEF2F2', count: 2, token: 'surface-page', distance: 15.2, source: 'nearest' },
  { hex: '#FDFCF8', count: 2, token: 'surface-page', distance: 9.0, source: 'nearest' },
  { hex: '#FDFCF7', count: 2, token: 'surface-page', distance: 8.1, source: 'nearest' },
  { hex: '#FDE9BA', count: 2, token: 'type-grant-pale', distance: 46.8, source: 'nearest' },
  { hex: '#FAF9F7', count: 2, token: 'surface-page', distance: 4.6, source: 'nearest' },
  { hex: '#F8F5EC', count: 2, token: 'surface-sunken', distance: 11.3, source: 'nearest' },
  { hex: '#F3F4F6', count: 2, token: 'surface-page', distance: 17.3, source: 'nearest' },
  { hex: '#F3EDFA', count: 2, token: 'type-programme-pale', distance: 23.7, source: 'nearest' },
  { hex: '#F0F5F3', count: 2, token: 'surface-pill', distance: 16.4, source: 'nearest' },
  { hex: '#F0ECE6', count: 2, token: 'surface-pill', distance: 10.0, source: 'nearest' },
  { hex: '#EEF8D8', count: 2, token: 'type-inkind-pale', distance: 14.9, source: 'nearest' },
  { hex: '#E8F2D8', count: 2, token: 'type-inkind-pale', distance: 9.5, source: 'nearest' },
  { hex: '#E8A23D', count: 2, token: 'terra', distance: 102.9, source: 'nearest' },
  { hex: '#DFEDCC', count: 2, token: 'border-warm', distance: 31.0, source: 'nearest' },
  { hex: '#D9D4C7', count: 2, token: 'border-warm', distance: 37.9, source: 'nearest' },
  { hex: '#A06000', count: 2, token: 'state-warning', distance: 57.7, source: 'nearest' },
  { hex: '#991B1B', count: 2, token: 'state-error', distance: 66.1, source: 'nearest' },
  { hex: '#7A2020', count: 2, token: 'state-error', distance: 74.8, source: 'nearest' },
  { hex: '#5C3507', count: 2, token: 'state-warning', distance: 82.7, source: 'nearest' },
  { hex: '#412402', count: 2, token: 'text-body', distance: 81.1, source: 'nearest' },
  { hex: '#3F6018', count: 2, token: 'state-success', distance: 29.1, source: 'nearest' },
  { hex: '#3A6B0E', count: 2, token: 'state-success', distance: 6.6, source: 'nearest' },
  { hex: '#378ADD', count: 2, token: 'focus-ring', distance: 99.5, source: 'nearest' },
  { hex: '#2D6B5E', count: 2, token: 'text-muted', distance: 76.0, source: 'nearest' },
  { hex: '#2D2D2D', count: 2, token: 'text-body', distance: 3.0, source: 'nearest' },
  { hex: '#2A7A2A', count: 2, token: 'state-success', distance: 55.3, source: 'nearest' },
  { hex: '#1F5C52', count: 2, token: 'surface-inverse', distance: 72.5, source: 'nearest' },
  { hex: '#1A2E2B', count: 2, token: 'text-body', distance: 29.7, source: 'nearest' },
  { hex: '#1A1A18', count: 2, token: 'text-body', distance: 62.0, source: 'nearest' },
  { hex: '#0F2502', count: 2, token: 'text-body', distance: 89.1, source: 'nearest' },
  { hex: '#073060', count: 2, token: 'state-info', distance: 63.0, source: 'nearest' },
  { hex: '#FFFBEB', count: 1, token: 'surface-page', distance: 15.0, source: 'nearest' },
  { hex: '#FFF8ED', count: 1, token: 'surface-page', distance: 12.3, source: 'nearest' },
  { hex: '#FEF3E2', count: 1, token: 'surface-sunken', distance: 16.0, source: 'nearest' },
  { hex: '#FECACA', count: 1, token: 'border-warm', distance: 58.9, source: 'nearest' },
  { hex: '#FDFBF5', count: 1, token: 'surface-page', distance: 5.5, source: 'nearest' },
  { hex: '#FDF8F2', count: 1, token: 'surface-page', distance: 4.9, source: 'nearest' },
  { hex: '#FDF6F4', count: 1, token: 'surface-page', distance: 6.9, source: 'nearest' },
  { hex: '#FDF6EC', count: 1, token: 'surface-page', distance: 13.3, source: 'nearest' },
  { hex: '#FCE8E8', count: 1, token: 'type-investment-pale', distance: 8.8, source: 'nearest' },
  { hex: '#FBFDF7', count: 1, token: 'surface-page', distance: 9.1, source: 'nearest' },
  { hex: '#FBF7EE', count: 1, token: 'surface-page', distance: 9.4, source: 'nearest' },
  { hex: '#FAFAFA', count: 1, token: 'surface-page', distance: 8.9, source: 'nearest' },
  { hex: '#FAF8F5', count: 1, token: 'surface-page', distance: 3.0, source: 'nearest' },
  { hex: '#FAF1EE', count: 1, token: 'surface-sunken', distance: 12.1, source: 'nearest' },
  { hex: '#F7F9F4', count: 1, token: 'surface-page', distance: 6.9, source: 'nearest' },
  { hex: '#F5F3EF', count: 1, token: 'surface-pill', distance: 11.6, source: 'nearest' },
  { hex: '#F5C9BC', count: 1, token: 'border-warm', distance: 59.3, source: 'nearest' },
  { hex: '#F4F8FD', count: 1, token: 'surface-page', distance: 17.7, source: 'nearest' },
  { hex: '#F4F6F4', count: 1, token: 'surface-page', distance: 13.5, source: 'nearest' },
  { hex: '#F3F1EA', count: 1, token: 'surface-pill', distance: 4.0, source: 'nearest' },
  { hex: '#F3EFEA', count: 1, token: 'surface-pill', distance: 4.0, source: 'nearest' },
  { hex: '#F1F8E4', count: 1, token: 'surface-sunken', distance: 17.0, source: 'nearest' },
  { hex: '#F1ECE1', count: 1, token: 'surface-pill', distance: 15.2, source: 'nearest' },
  { hex: '#F0FDFA', count: 1, token: 'surface-page', distance: 22.3, source: 'nearest' },
  { hex: '#F0FDF9', count: 1, token: 'surface-page', distance: 21.7, source: 'nearest' },
  { hex: '#F0FAE5', count: 1, token: 'type-inkind-pale', distance: 20.1, source: 'nearest' },
  { hex: '#F0F9FF', count: 1, token: 'type-programme-pale', distance: 24.1, source: 'nearest' },
  { hex: '#F0EBE4', count: 1, token: 'surface-pill', distance: 13.3, source: 'nearest' },
  { hex: '#F0D4A8', count: 1, token: 'border-warm', distance: 65.2, source: 'nearest' },
  { hex: '#EFF6F4', count: 1, token: 'surface-pill', distance: 19.0, source: 'nearest' },
  { hex: '#EFE9DD', count: 1, token: 'type-inkind-pale', distance: 21.8, source: 'nearest' },
  { hex: '#EAE5D7', count: 1, token: 'border-warm', distance: 13.7, source: 'nearest' },
  { hex: '#E8E0D8', count: 1, token: 'border-warm', distance: 10.1, source: 'nearest' },
  { hex: '#E8DFC8', count: 1, token: 'border-warm', distance: 13.2, source: 'nearest' },
  { hex: '#E8725C', count: 1, token: 'terra', distance: 31.6, source: 'nearest' },
  { hex: '#E8604C', count: 1, token: 'terra', distance: 54.8, source: 'nearest' },
  { hex: '#E6F4E6', count: 1, token: 'type-inkind-pale', distance: 13.6, source: 'nearest' },
  { hex: '#E4F0D4', count: 1, token: 'type-inkind-pale', distance: 18.7, source: 'nearest' },
  { hex: '#D8D4CC', count: 1, token: 'border-warm', distance: 36.9, source: 'nearest' },
  { hex: '#D3E8F7', count: 1, token: 'type-programme-pale', distance: 37.3, source: 'nearest' },
  { hex: '#D3D1C7', count: 1, token: 'border-warm', distance: 48.8, source: 'nearest' },
  { hex: '#D0CCC4', count: 1, token: 'text-on-dark-mut', distance: 41.3, source: 'nearest' },
  { hex: '#CCFBF1', count: 1, token: 'type-programme-pale', distance: 50.4, source: 'nearest' },
  { hex: '#C8E0D0', count: 1, token: 'border-warm', distance: 54.0, source: 'nearest' },
  { hex: '#C5E08A', count: 1, token: 'sage-pale', distance: 22.0, source: 'nearest' },
  { hex: '#C5C3BC', count: 1, token: 'text-on-dark-mut', distance: 24.7, source: 'nearest' },
  { hex: '#B8D4EE', count: 1, token: 'sky', distance: 27.9, source: 'nearest' },
  { hex: '#A8D5B5', count: 1, token: 'text-on-dark-mut', distance: 43.2, source: 'nearest' },
  { hex: '#9D174D', count: 1, token: 'state-error', distance: 105.0, source: 'nearest' },
  { hex: '#9A9895', count: 1, token: 'text-subtle', distance: 27.4, source: 'nearest' },
  { hex: '#9A4040', count: 1, token: 'state-error', distance: 54.8, source: 'nearest' },
  { hex: '#808580', count: 1, token: 'text-subtle', distance: 45.9, source: 'nearest' },
  { hex: '#7A6E64', count: 1, token: 'text-muted', distance: 42.5, source: 'nearest' },
  { hex: '#7A2E14', count: 1, token: 'state-error', distance: 58.5, source: 'nearest' },
  { hex: '#6B2010', count: 1, token: 'state-error', distance: 94.1, source: 'nearest' },
  { hex: '#3A3A3A', count: 1, token: 'text-body', distance: 36.0, source: 'nearest' },
  { hex: '#3A3000', count: 1, token: 'text-body', distance: 79.0, source: 'nearest' },
  { hex: '#2E5410', count: 1, token: 'state-success', distance: 53.6, source: 'nearest' },
  { hex: '#1E3D06', count: 1, token: 'text-body', distance: 77.5, source: 'nearest' },
  { hex: '#093F72', count: 1, token: 'state-info', distance: 20.3, source: 'nearest' },
  { hex: '#0369A1', count: 1, token: 'state-info', distance: 98.5, source: 'nearest' },
]

// ==== 5b. THREE_DIGIT_MAPPING — 3-digit hex shorthand, 9 values, 142 occurrences ====
// Out of scope for the original 6-digit-only scan (KNOWN_GAPS flagged this).
// 10 distinct 3-digit values were found; #163 (1 occurrence, api/admin/
// fetch-grant-info/route.ts:28) is the `&#163;` HTML-entity false positive
// (the pound-sign escape, not a colour) and is excluded, leaving 9 real
// values / 142 occurrences. Every occurrence was read directly — none show
// polysemy (each value plays one consistent role everywhere it appears) —
// so this is a value-keyed tier like NEAREST_TOKEN_MAPPING, with reasoning
// attached for the 3 rows where role overrode the numerically-closest token.
export const THREE_DIGIT_MAPPING: DecidedRow[] = [
  {
    hex: '#fff', count: 116, token: 'surface-card',
    reasoning: 'Plain white, exact match (distance 0.0) — same value #FFFFFF already maps to in DOC_MAPPING, just the 3-digit shorthand.',
  },
  {
    hex: '#666', count: 5, token: 'text-muted',
    reasoning: 'Secondary/caption text throughout admin/feedback and search pages (labels, sub-headers, dimension bar labels) — distance 15.1, clean fit, consistent role everywhere.',
  },
  {
    hex: '#c00', count: 3, token: 'state-error',
    reasoning: "Distance 152.8 — poor raw match (#cc0000 is far more saturated than state-error's #993C1D), but role is unambiguous: an 'Access denied' error message, the down-vote side of an up/down colour switch, and a down-count table cell, all on admin/feedback/page.tsx. The switch's up-side (#2a7a2a) already maps to state-success in NEAREST_TOKEN_MAPPING — pairing #c00 with state-error keeps that up/down switch semantically coherent (good/bad), not just individually nearest. Same role-over-distance precedent as #C96A00/#FFB74D above.",
  },
  {
    hex: '#888', count: 7, token: 'text-subtle',
    reasoning: 'Tertiary/muted caption text in transactional emails (contact/feedback route handlers) and admin/feedback captions — distance 32.1.',
  },
  {
    hex: '#999', count: 3, token: 'text-subtle',
    reasoning: "Empty-state placeholder text on admin/feedback/page.tsx ('No chips recorded yet' etc.) — distance 28.9, same token as #888 above. Two legacy greys converging on one canonical subtle-text tone is the intended outcome of a token sweep, not a polysemy problem: both are genuinely playing the same tertiary-text role, just with slightly different pre-token-system hex values.",
  },
  {
    hex: '#444', count: 3, token: 'text-body',
    reasoning: "Body prose text (GrantDetailModal's description + eligibility list, admin/intelligence's answer paragraph) — distance 65.98, marginally further than `deep` (60.72). Overridden for role: `deep` is the heading/inverse-surface token (its own definition is text-heading/surface-inverse); using it for paragraph body copy would be the wrong role despite the closer number. text-body is correct and the distance gap is negligible.",
  },
  {
    hex: '#eee', count: 3, token: 'surface-pill',
    reasoning: "hr divider border-top in transactional emails (contact/feedback route handlers) — distance 8.7, an excellent raw match. Nearest role-correct token (border-warm) is a much worse 51.3 — but these are raw HTML email strings, not app UI referencing a token by name, so the literal colour match matters more here than the token's semantic label. Single-use decorative, per the decision rule.",
  },
  {
    hex: '#ddd', count: 1, token: 'border-warm',
    reasoning: 'hr divider border-top in the builder export route (docx-adjacent HTML) — distance 26.3, and here the role-correct border token IS also the near-numeric match, unlike #eee above.',
  },
  {
    hex: '#aaa', count: 1, token: 'text-subtle',
    reasoning: "Timestamp text colour on admin/feedback/page.tsx's free-text list — distance 76.5, further than `sage` (71.3) or `text-on-dark-mut` (72.2). Overridden for role twice over: `sage` is a green brand accent — substituting it would visibly green-tint a plain grey timestamp, not just a semantic mislabel like the #eee case (neutral-for-neutral); `text-on-dark-mut` is specifically for text on the dark/inverse surface, and this timestamp sits on a light admin-page background. text-subtle is the correct light-surface tertiary-text token.",
  },
]

// ==== 6. ORPHANS — none remain ====
// All 7 from the usage report are decided: #FAC775/#FFB74D/#C96A00/#6D28D9/
// #1D4ED8/#6B21A8 -> DECIDED_MAPPING; #F4A0A0 -> ONE_OFFS. Kept as an export
// for structural completeness / in case a future pass finds new ones.
export const ORPHANS: OrphanRow[] = []

// ============================================================
// EXCLUDED_VALUES — value-keyed exclusions (not polysemous — one consistent
// role — but that role has no safe token to land on). #EEEDFE/#3C3489, the
// other two members of the pre-decision NEW_FINDINGS_NOT_YET_DECIDED set,
// are now resolved (see DECIDED_MAPPING) and no longer listed here.
// ============================================================
export const EXCLUDED_VALUES = [
  {
    hex: '#5A9080', count: 6,
    issue: "Every real occurrence (score>=70 ring/title in search's GrantCard tierHue, profile's CompletionMeter 60-79% border, feedback's STATUS_CONFIG 'actioned' colour) is a 'good, second-tier' GRADED accent — ordinal in role, which is normally exactly what the new ordinal scale is for. But forcing it onto the closest-fitting rung, ordinal-3-good (#639922), creates a real collision, not a hypothetical one: in BOTH search/page.tsx's tierHue AND profile/page.tsx's CompletionMeter, the tier immediately ABOVE #5A9080 already uses #639922 itself (score>=80 / pct>=80, both -> sage-deep, the same hex ordinal-3-good aliases to). Repainting #5A9080 to ordinal-3-good would make two currently-distinct, adjacent tiers render as the identical colour in the same component — a visible regression, not a migration. No other ordinal rung is a remotely close colour match (ordinal-4-strong/2-fair/1-weak are all 130+ distance), and no non-ordinal token fits the role (text-subtle/text-muted are the nearest by raw colour but are text tokens, wrong role entirely). Genuinely unclear: needs either a new 5th ordinal rung slotted between strong and good, or a decision to leave this as its own small accent outside the ordinal scale. Left excluded rather than guessed.",
  },
]

// ============================================================
// KNOWN_GAPS — what this file's methodology cannot see, found while
// investigating the above. Listed rather than silently left out.
// ============================================================
export const KNOWN_GAPS = [
  "RESOLVED — 3-digit hex shorthand (was entirely outside this file's original scope, built by scanning for #[0-9a-fA-F]{6} only): all 9 real values now in THREE_DIGIT_MAPPING (tier 5b), 142 occurrences, #163 excluded as the &#163; HTML-entity false positive.",
  "Pipeline-stage colours (identified/applying/submitted/won/declined) are hardcoded independently in AT LEAST 6 places found across both research passes this session: STAGE_STYLE (deadlines/page.tsx), STAGE_STYLE (briefing/PlanView.tsx, separately defined, identical values), STAGE_BG_HEX (pipeline/page.tsx, values diverge from the other two for applying/submitted/won), tones (PipelineModal.tsx, its own bg values, matching STAGE_BG_HEX not STAGE_STYLE), stageData (dashboard/page.tsx, matching STAGE_STYLE), and STAGE_COLOURS (admin/users/[id]/page.tsx, a previously-undiscovered 4th independent copy). None of the individual hex values here are dangerously polysemous — they consistently map to their correct DOC_MAPPING/NEAREST_TOKEN_MAPPING destinations wherever they appear — but the 6-way duplication with 2 genuinely divergent value sets (STAGE_STYLE's bg for applying/submitted/won vs STAGE_BG_HEX/tones/STAGE_COLOURS's bg for the same 3 stages) is worth a consolidation pass alongside or after the sweep.",
]
