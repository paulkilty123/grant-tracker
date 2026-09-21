import { describe, it, expect } from 'vitest'
import {
  firstDeadlineFromCycle,
  mergeFieldUpdate,
  isCycleRoll,
  trustOf,
  transitionPipelineState,
  compactValue,
  type ProvenanceEntry,
} from './grant-merge'

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

/**
 * De-publishing a round-closed fund.
 *
 * On 2026-08-11, hiding 44 verified round-closed funds sent every one of them
 * back to `pipeline_state = 'captured'` — the same state a brand-new scrape
 * lands in. process-pipeline-queue selects on exactly that state, so closed
 * funds entered the enrichment queue and outnumbered genuinely new arrivals
 * 37 to 4, each one costing a model call to re-describe a row no user can see.
 *
 * The bug was invisible from either end: the admin Between rounds tab keys on
 * next_open_date, not state, so the rows looked correctly filed there, and the
 * queue reported healthy runs while enriching the wrong rows.
 */
describe('transitionPipelineState — de-publish', () => {
  const base = { current: 'published' as const, source: 'user_verified:round-closed-2026-08-11' }

  it('sends a round-closed row with a reopen date to between_rounds_scheduled', () => {
    expect(transitionPipelineState({
      ...base,
      fields: { is_active: false, deadline: null, next_open_date: 'Autumn 2026' },
    })).toBe('between_rounds_scheduled')
  })

  it('still sends a plain de-publish to captured', () => {
    // No reopen date recorded — we do not know it is between rounds, so the
    // conservative existing behaviour must be preserved.
    expect(transitionPipelineState({
      ...base,
      fields: { is_active: false },
    })).toBe('captured')
  })

  it('does not treat an empty reopen date as scheduled', () => {
    // A cleared form field arrives as '' rather than null; truthiness must not
    // promote that to a scheduled reopen.
    expect(transitionPipelineState({
      ...base,
      fields: { is_active: false, next_open_date: '' },
    })).toBe('captured')
  })

  it('lets a dead URL archive the row even with a reopen date present', () => {
    // Precedence: archive is checked first and must stay first. A dead link is
    // a stronger statement than a hoped-for reopen.
    expect(transitionPipelineState({
      ...base,
      fields: { is_active: false, url_status: 'dead', next_open_date: 'Autumn 2026' },
    })).toBe('archived')
  })

  it('republishes when the round reopens', () => {
    expect(transitionPipelineState({
      current: 'between_rounds_scheduled',
      source:  'admin:reopen',
      fields:  { is_active: true, next_open_date: 'Autumn 2026' },
    })).toBe('published')
  })

  it('leaves state alone when a write merely mentions next_open_date', () => {
    // Recording a reopen date on a row that is not being de-published is not a
    // state transition.
    expect(transitionPipelineState({
      current: 'published',
      source:  'admin:note',
      fields:  { next_open_date: 'Autumn 2026' },
    })).toBe('published')
  })
})

/**
 * `attempted` on a rejection crosses an HTTP boundary and is rendered to a
 * person, so it has two jobs that pull against each other: show the value
 * clearly, and never turn a diagnostic into a payload problem.
 *
 * The fields people actually judge are scalars (amount_max, deadline,
 * is_rolling) and short arrays (eligible_structures) — those must survive
 * verbatim, because "Proposed 5000" is the whole point. funder_brief is
 * multi-kilobyte, and a bulk path can reject hundreds of fields in one
 * response, so blobs must be replaced rather than truncated into noise.
 *
 * The UI keys the override button on `typeof attempted !== 'object'`, so the
 * boundary between "replayable" and "omitted" is load-bearing, not cosmetic:
 * get it wrong and the button either disappears from a scalar or appears on a
 * value that cannot be replayed.
 */
describe('compactValue — what a refusal is allowed to carry', () => {
  it('passes scalars through untouched, including the falsy ones', () => {
    expect(compactValue(5_000)).toBe(5_000)
    expect(compactValue('2026-05-24')).toBe('2026-05-24')
    expect(compactValue(true)).toBe(true)
    // 0 and false are real proposals (amount_min = 0, is_rolling = false) and
    // must not be coerced away by a truthiness check.
    expect(compactValue(0)).toBe(0)
    expect(compactValue(false)).toBe(false)
  })

  it('normalises both empty values to null, so the UI has one case to render', () => {
    expect(compactValue(null)).toBeNull()
    expect(compactValue(undefined)).toBeNull()
  })

  it('keeps a short array of primitives, which is what eligible_structures is', () => {
    expect(compactValue(['charity', 'cic', 'scio'])).toEqual(['charity', 'cic', 'scio'])
  })

  it('replaces a long array rather than truncating it', () => {
    const long = Array.from({ length: 21 }, (_, i) => `tag-${i}`)
    expect(compactValue(long)).toEqual({ _omitted: 'array', length: 21 })
  })

  it('replaces an array of objects, however short', () => {
    // deadline_cycle is [{day, month}, …] — six entries on Movement for Good.
    const cycle = [{ day: 23, month: 3 }, { day: 7, month: 9 }]
    expect(compactValue(cycle)).toEqual({ _omitted: 'array', length: 2 })
  })

  it('replaces an object with its key count, never its content', () => {
    const brief = { who_can_apply: 'x'.repeat(4000), exclusions: 'y'.repeat(4000) }
    const out = compactValue(brief) as Record<string, unknown>
    expect(out).toEqual({ _omitted: 'object', keys: 2 })
    expect(JSON.stringify(out).length).toBeLessThan(60)
  })

  it('caps a long string but leaves it a string, so it stays replayable', () => {
    const out = compactValue('z'.repeat(1000))
    expect(typeof out).toBe('string')
    expect(out as string).toHaveLength(301)   // 300 + the ellipsis
    expect(out as string).toMatch(/…$/)
  })

  it('marks exactly the values the override button may offer', () => {
    // Mirrors RefusalNotice's guard. The discriminator is "did compactValue keep
    // this verbatim", not "is it a scalar": a short array survives intact and
    // must stay replayable, because eligible_structures is an array and is the
    // field most worth overriding — a narrowed structure list is what hides a
    // fund from the organisations that can apply.
    const replayable = (v: unknown) => {
      const c = compactValue(v)
      return c === null || Array.isArray(c) || typeof c !== 'object'
    }
    expect(replayable(5_000)).toBe(true)
    expect(replayable(false)).toBe(true)
    expect(replayable(null)).toBe(true)
    expect(replayable(['charity', 'cic'])).toBe(true)          // survives verbatim
    expect(replayable('z'.repeat(1000))).toBe(true)            // capped, still a string
    expect(replayable({ who_can_apply: 'x' })).toBe(false)     // blob, omitted
    expect(replayable(Array.from({ length: 30 }, () => 'x'))).toBe(false)  // too long, omitted
    expect(replayable([{ day: 1, month: 4 }])).toBe(false)     // objects inside, omitted
  })
})

/**
 * The expire-grants cron rolling a deadline along the row's own cycle. The
 * Achlachan case, 2026-09-15: user_verified deadline 15 Sep, cycle on the 15th
 * of Mar/Jun/Sep/Dec, cron writing as system. Prediction before the run: the
 * roll to 15 Dec goes through, a roll to a date NOT on the cycle is still
 * lower_trust, a pinned date still holds, and a roll BACKWARDS is refused.
 */
describe('expire-grants cycle roll over a higher-trust deadline', () => {
  const cycle = [{ day: 15, month: 3 }, { day: 15, month: 6 }, { day: 15, month: 9 }, { day: 15, month: 12 }]
  const held = prov('user_verified:timing-2026-09-06', { set_at: '2026-09-06T19:44:33.764Z' })
  const cron = prov('system:expire_grants:v2', { set_at: '2026-09-16T02:00:00.000Z' })

  it('advances 15 Sep to 15 Dec over a user_verified deadline when 15 Dec is on the cycle', () => {
    const d = mergeFieldUpdate('2026-09-15', held, '2026-12-15', cron, 'deadline', { deadlineCycle: cycle })
    expect(d.write).toBe(true)
    if (d.write) {
      expect(d.value).toBe('2026-12-15')
      expect(d.prov.previous).toEqual({ source: 'user_verified:timing-2026-09-06', value: '2026-09-15' })
    }
  })

  it('advances over an unpinned admin deadline too', () => {
    const d = mergeFieldUpdate('2026-09-15', prov('admin:paul'), '2026-12-15', cron, 'deadline', { deadlineCycle: cycle })
    expect(d.write).toBe(true)
  })

  it('still refuses a date that is not on the cycle', () => {
    const d = mergeFieldUpdate('2026-09-15', held, '2026-11-01', cron, 'deadline', { deadlineCycle: cycle })
    expect(d).toEqual({ write: false, reason: 'lower_trust' })
  })

  it('still refuses when the deadline is pinned', () => {
    const d = mergeFieldUpdate('2026-09-15', prov('admin:paul', { pinned: true }), '2026-12-15', cron, 'deadline', { deadlineCycle: cycle })
    expect(d).toEqual({ write: false, reason: 'pinned' })
  })

  it('refuses a roll backwards, a roll with no cycle, and a roll by any other source', () => {
    expect(isCycleRoll('deadline', '2026-12-15', '2026-09-15', cron, cycle)).toBe(false)
    expect(isCycleRoll('deadline', '2026-09-15', '2026-12-15', cron, null)).toBe(false)
    expect(isCycleRoll('deadline', '2026-09-15', '2026-12-15', prov('scraper:x'), cycle)).toBe(false)
    expect(isCycleRoll('amount_max', '2026-09-15', '2026-12-15', cron, cycle)).toBe(false)
    // Without the ctx the old behaviour holds exactly.
    expect(mergeFieldUpdate('2026-09-15', held, '2026-12-15', cron, 'deadline')).toEqual({ write: false, reason: 'lower_trust' })
  })
})

describe('firstDeadlineFromCycle — a cycle without a first date is a closing date nobody sees', () => {
  const cycle = [{ day: 30, month: 3 }, { day: 30, month: 6 }, { day: 30, month: 9 }, { day: 31, month: 12 }]
  it('gives the next cut-off when the row has no deadline and is not rolling (Britford, 21 Sept)', () => {
    expect(firstDeadlineFromCycle({ cycle, deadline: null, isRolling: false, todayISO: '2026-09-21' })).toBe('2026-09-30')
  })
  it('rolls past a cut-off that is today or gone', () => {
    expect(firstDeadlineFromCycle({ cycle, deadline: null, isRolling: false, todayISO: '2026-09-30' })).toBe('2026-12-31')
  })
  it('leaves a row alone when it already shows a date', () => {
    expect(firstDeadlineFromCycle({ cycle, deadline: '2026-11-01', isRolling: false, todayISO: '2026-09-21' })).toBeNull()
  })
  it('leaves a rolling row alone', () => {
    expect(firstDeadlineFromCycle({ cycle, deadline: null, isRolling: true, todayISO: '2026-09-21' })).toBeNull()
  })
  it('gives nothing for an empty cycle or one with no closing dates', () => {
    expect(firstDeadlineFromCycle({ cycle: [], deadline: null, isRolling: false, todayISO: '2026-09-21' })).toBeNull()
    expect(firstDeadlineFromCycle({ cycle: [{ month: 4, label: 'Trustees meet in April' }], deadline: null, isRolling: false, todayISO: '2026-09-21' })).toBeNull()
  })
})
