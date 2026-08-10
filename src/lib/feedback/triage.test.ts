import { describe, it, expect } from 'vitest'
import { TRACKED_FIELDS } from '@/lib/grant-merge'
import {
  CORRECTABLE_FIELDS, isCorrectableField, acceptSource, pinsOnCorrectableFields,
  USER_VERIFIED_TRUST, TRIAGE_CLASSES, FEEDBACK_QUEUE_SOURCE, noteRequiredFor, CLASSES_REQUIRING_NOTE,
} from './triage'

describe('CORRECTABLE_FIELDS', () => {
  // If a correctable field were not tracked, mergeGrantUpdate would pass it
  // straight through untouched, and an accept would bypass the trust ladder and
  // the pin check entirely. The module asserts this at load; this pins it in CI.
  it('is a subset of TRACKED_FIELDS, so no correction can bypass the merger', () => {
    for (const f of CORRECTABLE_FIELDS) {
      expect(TRACKED_FIELDS as readonly string[]).toContain(f)
    }
  })

  it('does not let feedback rewrite the brief, title, url or amounts', () => {
    for (const f of ['funder_brief', 'title', 'apply_url', 'amount_min', 'amount_max', 'funder']) {
      expect(isCorrectableField(f)).toBe(false)
    }
  })

  it('does cover the fields the 7 August flags actually evidence', () => {
    for (const f of ['max_org_income', 'is_invite_only', 'eligible_structures', 'location_tag', 'deadline']) {
      expect(isCorrectableField(f)).toBe(true)
    }
  })
})

describe('acceptSource', () => {
  it('embeds the flag id so a value is traceable to who reported it', () => {
    expect(acceptSource('abc-123')).toBe('user_verified:feedback-abc-123')
  })

  it('resolves to the user_verified tier', () => {
    expect(acceptSource('abc-123').split(':')[0]).toBe('user_verified')
  })
})

describe('pinsOnCorrectableFields', () => {
  const at = '2026-06-14T00:00:00.000Z'

  it('returns nothing for a row with no provenance', () => {
    expect(pinsOnCorrectableFields(null)).toEqual([])
    expect(pinsOnCorrectableFields({})).toEqual([])
  })

  // The real case: five of Charlotte's thirteen grants carry location_tag pins
  // from the June manual feedback review.
  it('flags a pinned field, naming the source that froze it', () => {
    const pins = pinsOnCorrectableFields({
      location_tag: { source: 'admin:match_feedback_review_2026-06-14', set_at: at, pinned: true },
    })
    expect(pins).toHaveLength(1)
    expect(pins[0].field).toBe('location_tag')
    expect(pins[0].source).toBe('admin:match_feedback_review_2026-06-14')
    expect(pins[0].blocks).toBe(true)
  })

  it('ignores an unpinned lower-trust value, which a correction can overwrite', () => {
    expect(pinsOnCorrectableFields({
      max_org_income: { source: 'ai_extract:income:v1', set_at: at, pinned: false },
      location_tag:   { source: 'ai_enrich:v2', set_at: at, pinned: false },
    })).toEqual([])
  })

  // admin:legacy is trust 35 when backfilled, 100 when not. Getting this
  // backwards would either hide a real blocker or invent a false one.
  it('treats backfilled admin:legacy as overwritable but plain admin:legacy as blocking', () => {
    const backfilled = pinsOnCorrectableFields({
      is_invite_only: { source: 'admin:legacy', set_at: at, pinned: false, backfilled: true },
    })
    expect(backfilled).toEqual([])

    const notBackfilled = pinsOnCorrectableFields({
      is_invite_only: { source: 'admin:legacy', set_at: at, pinned: false },
    })
    expect(notBackfilled).toHaveLength(1)
    expect(notBackfilled[0].trust).toBeGreaterThan(USER_VERIFIED_TRUST)
  })

  it('flags an unpinned but higher-trust source, which would also be refused', () => {
    const pins = pinsOnCorrectableFields({
      max_org_income: { source: '360giving:import', set_at: at, pinned: false },
    })
    expect(pins).toHaveLength(1)
    expect(pins[0].trust).toBe(80)
  })

  it('ignores pins on fields feedback cannot correct anyway', () => {
    expect(pinsOnCorrectableFields({
      funder_brief: { source: 'admin:paul@granttracker.co.uk', set_at: at, pinned: true },
    })).toEqual([])
  })
})

describe('constants', () => {
  it('keeps USER_VERIFIED_TRUST in step with the ladder', () => {
    expect(USER_VERIFIED_TRUST).toBe(70)
  })

  it('records all three triage classes, including the one that never writes', () => {
    expect(TRIAGE_CLASSES).toContain('catalogue_gap')
    expect(TRIAGE_CLASSES).toContain('match_precision')
    expect(TRIAGE_CLASSES).toContain('taxonomy_gap')
  })

  it('uses a system: queue marker, so it cannot pin pipeline_state', () => {
    expect(FEEDBACK_QUEUE_SOURCE.startsWith('system:')).toBe(true)
  })
})

describe('reviewer note requirement', () => {
  // match_precision and taxonomy_gap write nothing to the grant. Without a note
  // the class label is the only artefact, and the reasoning behind it — e.g.
  // that Buttle UK correctly lists homeless, which is why a homelessness
  // charity matched — is lost. That reasoning IS the output of those classes.
  it('requires a note for the classes that write nothing', () => {
    expect(noteRequiredFor('match_precision')).toBe(true)
    expect(noteRequiredFor('taxonomy_gap')).toBe(true)
  })

  it('leaves it optional for catalogue_gap, where the correction is the record', () => {
    expect(noteRequiredFor('catalogue_gap')).toBe(false)
  })

  it('lists exactly the two write-nothing classes', () => {
    expect([...CLASSES_REQUIRING_NOTE].sort()).toEqual(['match_precision', 'taxonomy_gap'])
  })
})
