import { describe, it, expect, afterEach } from 'vitest'
import { landingCutoverTarget, isLandingCutoverOn, LANDING_DOCUMENT } from './landing-cutover'

const setFlag = (v: string | undefined) => {
  if (v === undefined) delete process.env.LANDING_CUTOVER
  else process.env.LANDING_CUTOVER = v
}

afterEach(() => setFlag(undefined))

describe('isLandingCutoverOn', () => {
  it('is off when the variable is absent', () => {
    setFlag(undefined)
    expect(isLandingCutoverOn()).toBe(false)
  })

  // The whole point of the gate is that merging it changes nothing. Anything
  // other than an explicit "true" has to read as off, so a half-set or
  // mistyped value fails closed rather than flipping the site early.
  it.each(['', ' ', 'false', 'FALSE', '0', 'yes', '1', 'on'])(
    'is off for %o',
    (v) => {
      setFlag(v)
      expect(isLandingCutoverOn()).toBe(false)
    },
  )

  it.each(['true', 'TRUE', 'True', ' true '])('is on for %o', (v) => {
    setFlag(v)
    expect(isLandingCutoverOn()).toBe(true)
  })
})

describe('landingCutoverTarget', () => {
  it('rewrites the root for a logged-out visitor once flipped', () => {
    setFlag('true')
    expect(landingCutoverTarget('/', false)).toBe(LANDING_DOCUMENT)
  })

  it('leaves the root alone while the flag is unset', () => {
    setFlag(undefined)
    expect(landingCutoverTarget('/', false)).toBeNull()
  })

  // A signed-in user hitting / is bounced to /dashboard by the root page.
  // Rewriting first would strand them on a marketing page with no way in.
  it('never rewrites for a signed-in user', () => {
    setFlag('true')
    expect(landingCutoverTarget('/', true)).toBeNull()
  })

  it.each(['/dashboard', '/mcp', '/auth/login', '/grants/abc', '/apply', '/landing/index.html'])(
    'leaves %s alone',
    (path) => {
      setFlag('true')
      expect(landingCutoverTarget(path, false)).toBeNull()
    },
  )
})
