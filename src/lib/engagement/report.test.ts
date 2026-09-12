import { describe, it, expect } from 'vitest'
import { summariseEngagement, renderEngagementHtml, EXCLUDED_ORG_IDS, type OrgRow, type EventRow } from './report'

// Fixture in the real shape: a fortnight of launch-week signups, each
// engineered to land on one flag. Predicted answers are in the assertions.
const NOW = new Date('2026-09-14T07:00:00Z')
const ago = (d: number, h = 7) => new Date(NOW.getTime() - d * 86_400_000 + (h - 7) * 3_600_000).toISOString()

const orgs: OrgRow[] = [
  { id: 'engaged', name: 'Busy Theatre', created_at: ago(10), granted_access_until: ago(-4), apply_access: true, owner_email: 'a@x.org' },
  { id: 'quiet', name: 'Gone Quiet CIO', created_at: ago(12), granted_access_until: ago(-2), apply_access: true },
  { id: 'never', name: 'One Visit Trust', created_at: ago(5), granted_access_until: ago(-9), apply_access: true },
  { id: 'warming', name: 'Warming Up CIC', created_at: ago(3), granted_access_until: ago(-11), apply_access: true },
  { id: 'ended', name: 'Old Trial', created_at: ago(20), granted_access_until: ago(6), apply_access: false },
  { id: 'cohort', name: 'Founding Org', created_at: ago(60), granted_access_until: 'infinity', apply_access: true },
  { id: '1eaa0592-4600-4a60-86c2-0e0ffabfb551', name: 'Bramble Arts Collective', created_at: ago(90), granted_access_until: 'infinity', apply_access: true },
]

const events: EventRow[] = [
  // engaged: 4 active days, saves and a pipeline move
  { org_id: 'engaged', event_type: 'results_shown', created_at: ago(10) },
  { org_id: 'engaged', event_type: 'opportunity_saved', created_at: ago(8) },
  { org_id: 'engaged', event_type: 'opportunity_saved', created_at: ago(8, 15) },
  { org_id: 'engaged', event_type: 'pipeline_added', created_at: ago(4) },
  { org_id: 'engaged', event_type: 'pipeline_stage_changed', created_at: ago(1) },
  // quiet: signed up, one save the next day, nothing for 9 days, trial ends in 2
  { org_id: 'quiet', event_type: 'results_shown', created_at: ago(12) },
  { org_id: 'quiet', event_type: 'opportunity_saved', created_at: ago(11) },
  { org_id: 'quiet', event_type: 'search_executed', created_at: ago(9) },
  // never: only signup-day events
  { org_id: 'never', event_type: 'results_shown', created_at: ago(5) },
  { org_id: 'never', event_type: 'pipeline_added', created_at: ago(5, 11) },
  // warming: two active days, recent
  { org_id: 'warming', event_type: 'results_shown', created_at: ago(3) },
  { org_id: 'warming', event_type: 'search_executed', created_at: ago(1) },
  // demo org has plenty, must not appear
  { org_id: '1eaa0592-4600-4a60-86c2-0e0ffabfb551', event_type: 'pipeline_added', created_at: ago(1) },
  // something older than the window, must not count
  { org_id: 'cohort', event_type: 'opportunity_saved', created_at: ago(40) },
]

describe('engagement report', () => {
  const rows = summariseEngagement(orgs, events, NOW)
  const by = Object.fromEntries(rows.map(r => [r.orgId, r]))

  it('precondition: fixture covers every flag and the demo org', () => {
    expect(orgs.some(o => EXCLUDED_ORG_IDS.has(o.id))).toBe(true)
    expect(new Set(rows.map(r => r.flag)).size).toBe(6)
  })

  it('leaves demo and test organisations out', () => {
    expect(by['1eaa0592-4600-4a60-86c2-0e0ffabfb551']).toBeUndefined()
    expect(rows).toHaveLength(6)
  })

  it('flags each organisation as engineered', () => {
    expect(by.engaged.flag).toBe('engaged')
    expect(by.quiet.flag).toBe('quiet')
    expect(by.never.flag).toBe('never_returned')
    expect(by.warming.flag).toBe('warming')
    expect(by.ended.flag).toBe('ended')
    expect(by.cohort.flag).toBe('dormant') // no events in window, old signup
  })

  it('counts the right buckets and days', () => {
    expect(by.engaged.activeDays).toBe(4)
    expect(by.engaged.saves).toBe(2)
    expect(by.engaged.pipeline).toBe(2)
    expect(by.quiet.daysSinceSeen).toBe(9)
    expect(by.quiet.daysLeft).toBe(2)
    expect(by.ended.daysLeft).toBeLessThan(0)
    expect(by.cohort.trialEnds).toBeNull()
    expect(by.cohort.saves).toBe(0) // the 40-day-old save is outside the window
  })

  it('orders quiet first, then never returned, engaged near the end', () => {
    const flags = rows.map(r => r.flag)
    expect(flags[0]).toBe('quiet')
    expect(flags.indexOf('engaged')).toBeGreaterThan(flags.indexOf('warming'))
    expect(flags.at(-1)).toBe('ended')
  })

  it('renders a subject with the counts and a table per group, old brand absent', () => {
    const { subject, html } = renderEngagementHtml(rows, NOW)
    expect(subject).toBe('Engagement this week: 1 engaged, 1 quiet, 1 never came back')
    expect(html).toContain('Gone Quiet CIO')
    expect(html).toContain('a@x.org')
    expect(html).not.toContain('Bramble')
    expect(html).not.toMatch(/Grant Tracker|granttracker/)
  })
})
