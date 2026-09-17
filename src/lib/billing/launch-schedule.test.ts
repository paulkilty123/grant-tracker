import { describe, it, expect } from 'vitest'
import { launchPhasePlanFor, schedulePhases } from './launch-schedule'

describe('launchPhasePlanFor', () => {
  it('plans twelve monthly cycles on the launch price, then standard', () => {
    expect(launchPhasePlanFor('shoots_apply_launch_monthly')).toEqual({
      launchIterations: 12, standardLookupKey: 'shoots_apply_standard_monthly', period: 'monthly',
    })
  })

  it('plans one annual cycle, then standard annual', () => {
    expect(launchPhasePlanFor('shoots_match_launch_annual')).toEqual({
      launchIterations: 1, standardLookupKey: 'shoots_match_standard_annual', period: 'annual',
    })
  })

  it('needs no schedule for standard, founding, unknown or missing prices', () => {
    expect(launchPhasePlanFor('shoots_apply_standard_monthly')).toBeNull()
    expect(launchPhasePlanFor('shoots_apply_founding_monthly')).toBeNull()
    expect(launchPhasePlanFor('price_abc')).toBeNull()
    expect(launchPhasePlanFor(null)).toBeNull()
  })
})

describe('schedulePhases', () => {
  const plan = launchPhasePlanFor('shoots_apply_launch_monthly')!

  it('keeps the first phase as Stripe made it, bounded, and adds the standard phase', () => {
    const phases = schedulePhases(
      { start_date: 1_760_000_000, items: [{ price: 'price_launch', quantity: 1 }], trial_end: 1_761_209_600 },
      plan, 'price_standard',
    )
    expect(phases).toEqual([
      { start_date: 1_760_000_000, items: [{ price: 'price_launch', quantity: 1 }], iterations: 12, trial_end: 1_761_209_600 },
      { items: [{ price: 'price_standard', quantity: 1 }] },
    ])
  })

  it('omits trial_end when there was no trial', () => {
    const [first] = schedulePhases({ start_date: 1, items: [{ price: 'p' }] }, plan, 'q')
    expect(first).not.toHaveProperty('trial_end')
    expect(first.items).toEqual([{ price: 'p', quantity: 1 }])
  })
})
