import { describe, it, expect } from 'vitest'
import { mergeFieldUpdate, trustOf, type ProvenanceEntry } from './grant-merge'

/**
 * The `user_verified` tier (70) exists so a correction a fundraiser reported and
 * an admin accepted survives the next enrichment run. It sits between 360giving
 * (80) and the ai_* tiers (60), and deliberately is NOT `admin` (100), because
 * admin auto-pins and a pin freezes the value permanently.
 *
 * A silent ordering mistake here is expensive and invisible: the write is simply
 * rejected (or silently accepted) and nothing surfaces. These tests pin the
 * ordering in BOTH directions rather than asserting the constant.
 */

const prov = (source: string, over: Partial<ProvenanceEntry> = {}): ProvenanceEntry => ({
  source,
  set_at: '2026-08-10T00:00:00.000Z',
  pinned: false,
  ...over,
})

// A real case: Charlotte reported "Max income cap of £750,000 p.a - we exceed
// this" against Stronger Communities Fund, which had max_org_income = null.
const VERIFIED_CAP = 750_000
const userVerified = prov('user_verified:feedback-abc123')

describe('user_verified trust tier', () => {
  it('sits above the ai_* tiers and below 360giving', () => {
    expect(trustOf('user_verified:feedback-abc123')).toBe(70)
    expect(trustOf('user_verified:feedback-abc123')).toBeGreaterThan(trustOf('ai_enrich:v3'))
    expect(trustOf('user_verified:feedback-abc123')).toBeGreaterThan(trustOf('ai_classifier:v3'))
    expect(trustOf('user_verified:feedback-abc123')).toBeLessThan(trustOf('360giving:import'))
    expect(trustOf('user_verified:feedback-abc123')).toBeLessThan(trustOf('admin:paul@granttracker.co.uk'))
  })

  // ── Direction 1: enrichment must NOT clobber a human-verified value ───────
  it('rejects an ai_enrich write over a user_verified value', () => {
    const decision = mergeFieldUpdate(VERIFIED_CAP, userVerified, 2_000_000, prov('ai_enrich:v3'))
    expect(decision).toEqual({ write: false, reason: 'lower_trust' })
  })

  it('rejects ai_classifier, ai_audit, ai_extract, system and scraper equally', () => {
    for (const source of [
      'ai_classifier:v3', 'ai_audit:v1', 'ai_extract:income-gate',
      'system:reenrich_chain:v1', 'scraper:gov_uk', 'ai_detect:v1', 'seed:bulk',
    ]) {
      const decision = mergeFieldUpdate(VERIFIED_CAP, userVerified, 2_000_000, prov(source))
      expect(decision, `${source} must not overwrite user_verified`).toEqual({
        write: false, reason: 'lower_trust',
      })
    }
  })

  // ── Direction 2: a better source MUST still win ───────────────────────────
  it('allows a 360giving write over a user_verified value', () => {
    const decision = mergeFieldUpdate(VERIFIED_CAP, userVerified, 1_000_000, prov('360giving:import'))
    expect(decision.write).toBe(true)
    if (decision.write) expect(decision.value).toBe(1_000_000)
  })

  it('allows an admin write over a user_verified value, and pins it', () => {
    const decision = mergeFieldUpdate(VERIFIED_CAP, userVerified, 1_000_000, prov('admin:paul@granttracker.co.uk'))
    expect(decision.write).toBe(true)
    // admin overriding a non-admin value auto-pins, which is the documented
    // "lock this value" behaviour the review queue exposes as a checkbox.
    if (decision.write) expect(decision.prov.pinned).toBe(true)
  })

  // ── The tier must beat what it is replacing, or accepting is pointless ────
  it('overwrites the ai_* and null-ish values it is meant to correct', () => {
    for (const source of ['ai_enrich:v3', 'ai_classifier:v3', 'scraper:gov_uk', 'seed:bulk']) {
      const decision = mergeFieldUpdate(null, prov(source), VERIFIED_CAP, userVerified)
      expect(decision.write, `user_verified must overwrite ${source}`).toBe(true)
    }
  })

  it('does not overwrite a pinned value, even an admin-pinned one', () => {
    const adminPinned = prov('admin:paul@granttracker.co.uk', { pinned: true })
    const decision = mergeFieldUpdate(1_000_000, adminPinned, VERIFIED_CAP, userVerified)
    expect(decision).toEqual({ write: false, reason: 'pinned' })
  })

  it('does not pin what it writes, so the value can still improve later', () => {
    const decision = mergeFieldUpdate(null, prov('ai_enrich:v3'), VERIFIED_CAP, userVerified)
    expect(decision.write).toBe(true)
    if (decision.write) expect(decision.prov.pinned).toBe(false)
  })

  it('is a no-op when the accepted value already matches', () => {
    const decision = mergeFieldUpdate(VERIFIED_CAP, prov('ai_enrich:v3'), VERIFIED_CAP, userVerified)
    expect(decision).toEqual({ write: false, reason: 'idempotent' })
  })
})
