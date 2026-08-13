import { describe, it, expect } from 'vitest'
import { resolvePublishCap } from './publish-cap'

/**
 * This is a brake, so the tests are written around the ways a brake fails
 * dangerously rather than around the happy path.
 *
 * The original expression guarded on `> 0`, which meant a cap of zero fell
 * through every branch to Infinity. Setting the limit to nothing would have
 * published everything, and the run summary would have looked normal doing it.
 * The first test below is that case.
 */
describe('resolvePublishCap', () => {
  it('treats zero as STOP, not as uncapped', () => {
    // The bug this function exists to make impossible.
    expect(resolvePublishCap({ envLimit: '0' })).toBe(0)
    expect(resolvePublishCap({ limitParam: '0' })).toBe(0)
    // And the consumer's test is `published.length < applyLimit`, so 0 must
    // stop the very first row: 0 < 0 is false.
    expect(0 < resolvePublishCap({ envLimit: '0' })).toBe(false)
  })

  it('treats absent as uncapped, which is the steady state', () => {
    expect(resolvePublishCap({})).toBe(Infinity)
    expect(resolvePublishCap({ limitParam: null, envLimit: undefined })).toBe(Infinity)
  })

  it('treats an empty or blank env var as absent, not as zero', () => {
    // Number('') is 0. Vercel shows an empty variable the same as an unset one,
    // so reading blank as a stop would let an accidentally-cleared field freeze
    // publishing with nothing on screen to explain it.
    expect(resolvePublishCap({ envLimit: '' })).toBe(Infinity)
    expect(resolvePublishCap({ envLimit: '   ' })).toBe(Infinity)
  })

  it('lets the query string beat the environment, including down to zero', () => {
    expect(resolvePublishCap({ limitParam: '3', envLimit: '10' })).toBe(3)
    // A manual caller must be able to say "dry-run sized": stop, this once,
    // without touching the deployed variable.
    expect(resolvePublishCap({ limitParam: '0', envLimit: '10' })).toBe(0)
  })

  it('falls back to the environment when the query string is absent or unusable', () => {
    expect(resolvePublishCap({ limitParam: null, envLimit: '10' })).toBe(10)
    expect(resolvePublishCap({ limitParam: 'abc', envLimit: '10' })).toBe(10)
    expect(resolvePublishCap({ limitParam: '', envLimit: '10' })).toBe(10)
  })

  it('ignores a negative cap rather than guessing what it meant', () => {
    // -1 could be read as "stop" or as "unlimited" depending on convention, and
    // picking one silently is how a brake becomes an accelerator. Ignored, so it
    // falls to the next source.
    expect(resolvePublishCap({ envLimit: '-1' })).toBe(Infinity)
    expect(resolvePublishCap({ limitParam: '-5', envLimit: '10' })).toBe(10)
  })

  it('ignores values that are not finite numbers', () => {
    for (const bad of ['abc', 'NaN', 'Infinity', '1e999', 'null', 'true']) {
      expect(resolvePublishCap({ envLimit: bad }), `${bad} must not become a cap`).toBe(Infinity)
    }
  })

  it('accepts a plain positive cap, trimmed', () => {
    expect(resolvePublishCap({ envLimit: '10' })).toBe(10)
    expect(resolvePublishCap({ envLimit: ' 10 ' })).toBe(10)
  })
})
