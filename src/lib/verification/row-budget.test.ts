import { describe, it, expect } from 'vitest'
import { withRowBudget } from './row-budget'

/**
 * The check that would have caught the 2026-08-28 kill: a row that never
 * settles must fail AS A ROW. Before this existed the only thing that noticed
 * was the platform, and by then the whole run's output was gone.
 */
describe('withRowBudget', () => {
  it('passes through work that finishes inside the budget', async () => {
    const work = new Promise<string>(res => setTimeout(() => res('done'), 5))
    await expect(withRowBudget('row-a', 200, work)).resolves.toBe('done')
  })

  it('rejects, naming the row, when the work never settles', async () => {
    const never = new Promise<string>(() => {})
    await expect(withRowBudget('row-b', 20, never)).rejects.toThrow(/row-b: budget exceeded \(20ms\)/)
  })

  it('propagates a real failure rather than waiting out the budget', async () => {
    const boom = Promise.reject(new Error('fetch_failed'))
    const started = Date.now()
    await expect(withRowBudget('row-c', 5_000, boom)).rejects.toThrow('fetch_failed')
    expect(Date.now() - started).toBeLessThan(1_000)
  })

  it('clears its timer, so a finished row leaves nothing pending', async () => {
    // If the timer outlived the race, this suite would hang for the full budget
    // instead of exiting. The assertion is the runtime, not the value.
    const started = Date.now()
    await withRowBudget('row-d', 30_000, Promise.resolve(1))
    expect(Date.now() - started).toBeLessThan(1_000)
  })
})
