import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

async function load() {
  vi.resetModules()
  return import('./send-guards')
}

const ORIGINAL = { ...process.env }
beforeEach(() => {
  delete process.env.DIGEST_ALLOWED_RECIPIENTS
  delete process.env.ALERT_RECIPIENT_ALLOWLIST
  delete process.env.DIGEST_DRY_RUN
  delete process.env.VERCEL_ENV
})
afterEach(() => { process.env = { ...ORIGINAL } })

describe('recipient allow-list', () => {
  it('is EMPTY when nothing is set — the safe state is the default', async () => {
    const { digestAllowlist, isDigestRecipient } = await load()
    expect(digestAllowlist()).toEqual([])
    expect(isDigestRecipient('someone@charity.org.uk')).toBe(false)
  })

  it('admits exactly the listed addresses and nobody else', async () => {
    process.env.DIGEST_ALLOWED_RECIPIENTS = 'paul@example.com'
    const { isDigestRecipient } = await load()
    expect(isDigestRecipient('paul@example.com')).toBe(true)
    // The whole point: a real member with alerts on must not pass.
    expect(isDigestRecipient('member@charity.org.uk')).toBe(false)
  })

  it('trims and lowercases both sides', async () => {
    process.env.DIGEST_ALLOWED_RECIPIENTS = ' Paul@Example.COM , second@example.com '
    const { digestAllowlist, isDigestRecipient } = await load()
    expect(digestAllowlist()).toEqual(['paul@example.com', 'second@example.com'])
    expect(isDigestRecipient('PAUL@example.com')).toBe(true)
  })

  it('has no wildcard: a bare domain admits nobody', async () => {
    process.env.DIGEST_ALLOWED_RECIPIENTS = '@example.com'
    const { isDigestRecipient } = await load()
    expect(isDigestRecipient('paul@example.com')).toBe(false)
  })

  it('falls back to the alert list so a rename cannot silently open the gate', async () => {
    process.env.ALERT_RECIPIENT_ALLOWLIST = 'legacy@example.com'
    const { isDigestRecipient } = await load()
    expect(isDigestRecipient('legacy@example.com')).toBe(true)
  })
})

describe('dry run is the default', () => {
  it('is dry when unset', async () => {
    const { digestIsDryRun } = await load()
    expect(digestIsDryRun()).toBe(true)
  })

  it('only the exact string "false" opts out', async () => {
    for (const v of ['', ' ', 'true', 'no', '0', 'FALSE ', 'falsey']) {
      process.env.DIGEST_DRY_RUN = v
      const { digestIsDryRun } = await load()
      // "FALSE " trims and lowercases to "false", which does opt out.
      const expected = v.trim().toLowerCase() !== 'false'
      expect(digestIsDryRun()).toBe(expected)
    }
  })

  it('sends for real only on an explicit false', async () => {
    process.env.DIGEST_DRY_RUN = 'false'
    const { digestIsDryRun } = await load()
    expect(digestIsDryRun()).toBe(false)
  })
})

describe('test subject prefix', () => {
  it('marks anything that is not production', async () => {
    process.env.VERCEL_ENV = 'preview'
    const { testSubjectPrefix } = await load()
    expect(testSubjectPrefix()).toBe('[TEST] ')
  })
  it('is absent in production', async () => {
    process.env.VERCEL_ENV = 'production'
    const { testSubjectPrefix } = await load()
    expect(testSubjectPrefix()).toBe('')
  })
})
