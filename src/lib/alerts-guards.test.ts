import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Imported fresh per test because the guards read process.env at call time and
// the module-level caps read it at IMPORT time — so the env has to be set
// before the module is evaluated, and the registry reset between cases.
async function load() {
  vi.resetModules()
  return import('./alerts')
}

const ORIGINAL = { ...process.env }
beforeEach(() => {
  delete process.env.ALERT_RECIPIENT_ALLOWLIST
  delete process.env.ALERT_MAX_GRANTS_PER_EMAIL
  delete process.env.ALERT_LOOKBACK_DAYS
})
afterEach(() => { process.env = { ...ORIGINAL } })

describe('recipient allowlist', () => {
  it('is EMPTY when the env var is unset — the safe state is the default', async () => {
    const { alertAllowlist, isAllowedRecipient } = await load()
    expect(alertAllowlist()).toEqual([])
    expect(isAllowedRecipient('paul@granttracker.co.uk')).toBe(false)
  })

  it('is empty for an env var that is blank or only separators', async () => {
    const { alertAllowlist } = await load()
    for (const v of ['', '   ', ',', ' , , ']) {
      process.env.ALERT_RECIPIENT_ALLOWLIST = v
      expect(alertAllowlist()).toEqual([])
    }
  })

  it('admits exactly the listed addresses and nobody else', async () => {
    process.env.ALERT_RECIPIENT_ALLOWLIST = 'paul@granttracker.co.uk'
    const { isAllowedRecipient } = await load()
    expect(isAllowedRecipient('paul@granttracker.co.uk')).toBe(true)
    // The whole point: a cohort member with alerts_enabled must not pass.
    expect(isAllowedRecipient('someone@charity.org.uk')).toBe(false)
  })

  it('parses a list, trimming space and ignoring case', async () => {
    process.env.ALERT_RECIPIENT_ALLOWLIST = ' Paul@GrantTracker.co.uk , second@example.com '
    const { alertAllowlist, isAllowedRecipient } = await load()
    expect(alertAllowlist()).toEqual(['paul@granttracker.co.uk', 'second@example.com'])
    expect(isAllowedRecipient('PAUL@granttracker.CO.UK')).toBe(true)
  })

  it('has no wildcard: a domain entry does not admit the domain', async () => {
    process.env.ALERT_RECIPIENT_ALLOWLIST = '@granttracker.co.uk'
    const { isAllowedRecipient } = await load()
    expect(isAllowedRecipient('paul@granttracker.co.uk')).toBe(false)
  })
})

describe('backlog caps', () => {
  it('defaults to 5 grants per email and a 30 day lookback', async () => {
    const { ALERT_MAX_GRANTS_PER_EMAIL, ALERT_LOOKBACK_DAYS } = await load()
    expect(ALERT_MAX_GRANTS_PER_EMAIL).toBe(5)
    expect(ALERT_LOOKBACK_DAYS).toBe(30)
  })

  it('honours an override', async () => {
    process.env.ALERT_MAX_GRANTS_PER_EMAIL = '3'
    process.env.ALERT_LOOKBACK_DAYS = '7'
    const { ALERT_MAX_GRANTS_PER_EMAIL, ALERT_LOOKBACK_DAYS } = await load()
    expect(ALERT_MAX_GRANTS_PER_EMAIL).toBe(3)
    expect(ALERT_LOOKBACK_DAYS).toBe(7)
  })

  it('falls back to the default for junk rather than 0 or NaN', async () => {
    // `Number('') || 5` is the guard. A 0 cap would send empty emails and a
    // 0 lookback would find nothing, both silently.
    process.env.ALERT_MAX_GRANTS_PER_EMAIL = 'lots'
    process.env.ALERT_LOOKBACK_DAYS = ''
    const { ALERT_MAX_GRANTS_PER_EMAIL, ALERT_LOOKBACK_DAYS } = await load()
    expect(ALERT_MAX_GRANTS_PER_EMAIL).toBe(5)
    expect(ALERT_LOOKBACK_DAYS).toBe(30)
  })
})
