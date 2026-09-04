import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * No route may build the service-role client itself.
 *
 * supabase-js queries through global fetch, which Next.js caches, and
 * `dynamic = 'force-dynamic'` does not reach it. getAdminDb() wraps fetch
 * with cache: 'no-store'; a raw createClient does not. On 2026-09-04
 * /api/debug/match returned a row as it stood at its first read, across two
 * deployments, until it was switched to the helper; on 2026-07-26 the publish
 * gate re-published rows off a drained queue for the same reason. 34 routes
 * were carrying the raw pattern that day, eleven crons among them.
 *
 * This test walks src/app/api and fails on the exact two-argument
 * service-role construction. It was proved to fire by running it before the
 * sweep (34 hits) and after (0).
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const API  = resolve(HERE, '..', '..', 'app', 'api')
const RAW  = /createClient\(\s*process\.env\.NEXT_PUBLIC_SUPABASE_URL!,\s*process\.env\.SUPABASE_SERVICE_ROLE_KEY!,?\s*\)/

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name === 'route.ts') out.push(p)
  }
  return out
}

describe('service-role clients in API routes', () => {
  it('walks a non-trivial number of routes (precondition: the scan is real)', () => {
    expect(walk(API).length).toBeGreaterThan(40)
  })

  it('never build the raw two-argument service-role client', () => {
    const offenders = walk(API).filter(f => RAW.test(readFileSync(f, 'utf8')))
    expect(offenders.map(f => f.replace(API, 'src/app/api'))).toEqual([])
  })
})
