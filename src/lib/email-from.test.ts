import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '../..')

describe('every sender carries a display name', () => {
  it('no route sends from a bare EMAIL_FROM', () => {
    // A bare address makes clients show the local part, so the digest was
    // arriving from "alerts" — a word that appears nowhere in the product.
    const found: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry)
        if (statSync(full).isDirectory()) walk(full)
        else if (entry === 'route.ts') {
          const src = readFileSync(full, 'utf8')
          if (/from:\s*EMAIL_FROM\s*,/.test(src)) found.push(path.relative(root, full))
        }
      }
    }
    walk(path.join(root, 'src/app/api'))
    expect(found).toEqual([])
  })
})

describe('the From header', () => {
  const ORIGINAL = { ...process.env }
  beforeEach(() => { delete process.env.ALERT_FROM_EMAIL })
  afterEach(() => { process.env = { ...ORIGINAL } })

  it('wraps a bare address in the brand name', async () => {
    vi.resetModules()
    const { EMAIL_FROM_HEADER, EMAIL_FROM } = await import('./mcp-brand')
    // "Shoots Funding", not the bare wordmark: a sender name has no logo
    // beside it and sits in a list of forty others.
    expect(EMAIL_FROM_HEADER).toMatch(/^Shoots Funding <.+@.+>$/)
    expect(EMAIL_FROM_HEADER).toContain(EMAIL_FROM)
  })

  it('leaves an address that already has one alone', async () => {
    process.env.ALERT_FROM_EMAIL = 'Shoots Funding <hello@shootsfunding.co.uk>'
    vi.resetModules()
    const { EMAIL_FROM_HEADER } = await import('./mcp-brand')
    expect(EMAIL_FROM_HEADER).toBe('Shoots Funding <hello@shootsfunding.co.uk>')
  })
})
