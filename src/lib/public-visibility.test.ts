// "Hidden" has to mean gone, not merely unfindable.
//
// Taking five unapplyable rows out of view on 2026-09-01 and then opening their
// URLs found all five still serving. is_active governs search, the listings and
// the sitemap; the detail route read neither it nor pipeline_state, so every
// admin surface agreed a row was hidden while the page stayed open.

import { describe, it, expect } from 'vitest'
import { isPubliclyVisible } from './public-visibility'

describe('what stays public', () => {
  it('serves a live row', () => {
    expect(isPubliclyVisible({ is_active: true, pipeline_state: 'published' })).toBe(true)
  })

  it('serves a PUBLISHED row that is between rounds — the page is built for it', () => {
    // formatNextOpen and the deadlinePassed branch exist to render a fund that
    // is shut and expected back, and 182 published rows are inactive right now.
    // 404ing them would break links fundraisers have saved.
    expect(isPubliclyVisible({ is_active: false, pipeline_state: 'published' })).toBe(true)
    expect(isPubliclyVisible({ is_active: false, pipeline_state: 'between_rounds_scheduled' })).toBe(true)
  })

  it('serves a live row whose admin state has not caught up', () => {
    // The migration-063 desync: is_active and pipeline_state disagree, and
    // is_active is what decides whether a user sees it.
    expect(isPubliclyVisible({ is_active: true, pipeline_state: 'tagged_awaiting_review' })).toBe(true)
  })
})

describe('what stops being public', () => {
  it('404s a rejected row — a duplicate or a non-fund', () => {
    expect(isPubliclyVisible({ is_active: false, pipeline_state: 'rejected' })).toBe(false)
  })

  it('404s an archived row', () => {
    expect(isPubliclyVisible({ is_active: false, pipeline_state: 'archived' })).toBe(false)
  })

  it('404s the five rows hidden today, which are tagged_awaiting_review', () => {
    expect(isPubliclyVisible({ is_active: false, pipeline_state: 'tagged_awaiting_review' })).toBe(false)
  })

  it('404s anything never published', () => {
    for (const state of ['captured', 'enriched', 'tagged']) {
      expect(isPubliclyVisible({ is_active: false, pipeline_state: state })).toBe(false)
    }
  })

  it('404s a row with no state at all rather than defaulting to open', () => {
    expect(isPubliclyVisible({})).toBe(false)
    expect(isPubliclyVisible({ is_active: null, pipeline_state: null })).toBe(false)
  })
})
