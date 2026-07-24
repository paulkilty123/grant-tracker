/**
 * Hex sweep mapping — old raw hex literal -> new Shoots token.
 *
 * FOR REVIEW ONLY. This file is data, not a script: nothing imports or runs
 * it, and no substitution has been performed. It exists so the mapping can
 * be checked by eye before the actual sweep (steps 5+ in shoots-app-tokens.md's
 * suggested order) is scripted in a later session.
 *
 * Source population: every distinct 6-digit hex literal found in `src/**\/*.{ts,tsx}`,
 * excluding the three token-definition files (tailwind.config.ts, globals.css,
 * builder/tokens.ts) since those hold the NEW tokens, not old values to sweep.
 * 165 distinct values, 2,449 occurrences, 80 files, as of this commit.
 *
 * Four tiers, in descending order of trust:
 *
 * 1. DOC_MAPPING — the 25 values shoots-app-tokens.md's own mapping table
 *    covers explicitly. Governing, not a suggestion — copied verbatim,
 *    including its two HIGH-risk "repaint" rows (#173404 -> deep, and
 *    #8ECB3C which has no direct token at all and is retired via the new
 *    button-hierarchy variants instead — see that doc's Button hierarchy
 *    section) and the CONFIRMED Programme decision (#F0997B -> type-programme,
 *    teal, despite the salmon->teal hue jump).
 *
 * 2. FLAGGED — two funding-type category dot colours (Investment, In-Kind)
 *    that are NOT in the doc's table but are the same class of decision as
 *    Programme: CLAUDE.md documents them as category dots, and the new
 *    Funding-types section pairs their categories with accents that are a
 *    long way from their current hue. Deliberately left with token: null —
 *    guessing here would be inventing a design decision, not sweeping one.
 *
 * 3. NEAREST_TOKEN_MAPPING — the remaining 131 values, assigned by actual
 *    redmean colour-distance to the candidate token palette (not eyeballed).
 *    This is the "map conservatively" tier: the assignment preserves current
 *    appearance as closely as an existing token allows. `distance` is the
 *    redmean score (0 = identical; roughly <30 is a barely-visible nudge,
 *    30-80 a noticeable but plausible-as-the-same-role shift, 80-110 a real
 *    but defensible squint). Skim the high-distance end of this list before
 *    running the sweep — "nearest available" is not the same as "correct."
 *
 * 4. ORPHANS — 7 values with no reasonable nearest token (distance > 110
 *    against every candidate). Not assigned anywhere. Two clusters: a purple
 *    pair (#6D28D9, #6B21A8 — no purple exists anywhere in the new palette)
 *    and an amber/orange cluster (#FAC775, #FFB74D, #C96A00 — downstream of
 *    the still-unresolved 4th "gold" collision from the token-landing commit),
 *    plus one salmon-pink (#F4A0A0) and one saturated blue (#1D4ED8) that
 *    don't match anything in the new system. Per instruction: do not invent
 *    tokens to accommodate them — these need an explicit decision (new token,
 *    or fold into an existing one on human judgement) before they can sweep.
 */

export type MappingSource = 'doc' | 'flag' | 'nearest'

export interface DocMappingRow {
  hex: string
  count: number
  token: string
  risk: string
  source: 'doc'
}

export interface FlaggedRow {
  hex: string
  count: number
  token: null
  note: string
  source: 'flag'
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

// ==== 1. DOC-SPECIFIED (from shoots-app-tokens.md mapping table) — 25 values ====
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
  { hex: '#008080', count: 48, token: 'teal', risk: 'low, admin only (value updates to #4EAAB4)', source: 'doc' },
  { hex: '#854F0B', count: 46, token: 'state-warning', risk: 'none', source: 'doc' },
  { hex: '#FFFFFF', count: 33, token: 'surface-card', risk: 'none', source: 'doc' },
  { hex: '#0C447C', count: 33, token: 'state-info', risk: 'none', source: 'doc' },
  { hex: '#FAEEDA', count: 32, token: 'gold-pale / state-warning-pale', risk: 'none', source: 'doc' },
  { hex: '#D85A30', count: 32, token: 'terra', risk: 'none (value updates to #D67558)', source: 'doc' },
  { hex: '#EAF3DE', count: 28, token: 'state-success-pale', risk: 'none', source: 'doc' },
  { hex: '#C0DD97', count: 27, token: 'sage-pale', risk: 'none', source: 'doc' },
  { hex: '#E6F1FB', count: 25, token: 'sky-pale / state-info-pale', risk: 'none', source: 'doc' },
  { hex: '#F1F0EA', count: 21, token: 'surface-pill', risk: 'none', source: 'doc' },
  { hex: '#97C459', count: 16, token: 'sage', risk: 'none (value updates to #9BCA9D)', source: 'doc' },
  { hex: '#F0997B', count: 13, token: 'type-programme', risk: 'HIGH — hue change (salmon->teal), CONFIRMED decision', source: 'doc' },
]

// ==== 2. FLAGGED — needs a human decision, not auto-assigned — 2 values ====
export const FLAGGED: FlaggedRow[] = [
  {
    hex: '#85B7EB', count: 11, token: null, source: 'flag',
    note: "Investment category dot (CLAUDE.md). Doc's Funding-types section pairs type-investment with terra (#D67558) — a blue-to-orange hue change, same class of decision as Programme. NOT auto-assigned.",
  },
  {
    hex: '#EF9F27', count: 8, token: null, source: 'flag',
    note: "In-Kind category dot (CLAUDE.md). Doc's Funding-types section pairs type-inkind with sage (#9BCA9D) — an amber-to-green hue change, same class of decision as Programme. NOT auto-assigned.",
  },
]

// ==== 3. NEAREST-TOKEN (algorithmic, redmean colour distance) — 131 values ====
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
  { hex: '#BA7517', count: 11, token: 'terra', distance: 107.4, source: 'nearest' },
  { hex: '#F0EDE2', count: 10, token: 'surface-pill', distance: 13.1, source: 'nearest' },
  { hex: '#E4E2DA', count: 10, token: 'border-warm', distance: 15.2, source: 'nearest' },
  { hex: '#3F6814', count: 8, token: 'state-success', distance: 12.7, source: 'nearest' },
  { hex: '#F0EFEB', count: 7, token: 'surface-pill', distance: 3.0, source: 'nearest' },
  { hex: '#DCE8C8', count: 6, token: 'border-warm', distance: 29.0, source: 'nearest' },
  { hex: '#9B9B9B', count: 6, token: 'text-subtle', distance: 34.0, source: 'nearest' },
  { hex: '#5A9080', count: 6, token: 'text-subtle', distance: 80.0, source: 'nearest' },
  { hex: '#006666', count: 6, token: 'state-info', distance: 79.7, source: 'nearest' },
  { hex: '#B91C1C', count: 5, token: 'state-error', distance: 82.6, source: 'nearest' },
  { hex: '#A06060', count: 5, token: 'terra', distance: 99.4, source: 'nearest' },
  { hex: '#F7F4EF', count: 4, token: 'surface-sunken', distance: 13.0, source: 'nearest' },
  { hex: '#F0F7F2', count: 4, token: 'surface-pill', distance: 18.2, source: 'nearest' },
  { hex: '#EEEDFE', count: 4, token: 'type-programme-pale', distance: 16.4, source: 'nearest' },
  { hex: '#E0DFD9', count: 4, token: 'border-warm', distance: 18.0, source: 'nearest' },
  { hex: '#6B6A67', count: 4, token: 'text-muted', distance: 19.3, source: 'nearest' },
  { hex: '#3C3489', count: 4, token: 'state-info', distance: 80.2, source: 'nearest' },
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
  { hex: '#6DBF6D', count: 3, token: 'text-subtle', distance: 106.7, source: 'nearest' },
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

// ==== 4. ORPHANS — no reasonable nearest token, NOT assigned — 7 values ====
export const ORPHANS: OrphanRow[] = [
  { hex: '#FAC775', count: 3, nearestGuess: 'sage-pale', distance: 118.5 },
  { hex: '#F4A0A0', count: 3, nearestGuess: 'text-on-dark-mut', distance: 137.1 },
  { hex: '#6D28D9', count: 2, nearestGuess: 'state-info', distance: 219.2 },
  { hex: '#6B21A8', count: 2, nearestGuess: 'state-info', distance: 174.4 },
  { hex: '#FFB74D', count: 1, nearestGuess: 'terra', distance: 150.3 },
  { hex: '#C96A00', count: 1, nearestGuess: 'state-warning', distance: 124.4 },
  { hex: '#1D4ED8', count: 1, nearestGuess: 'state-info', distance: 160.3 },
]

// Totals: doc=25 flagged=2 nearest=131 orphans=7 -> 165 distinct values,
// matching the current src/**/*.{ts,tsx} population (definition files excluded).
