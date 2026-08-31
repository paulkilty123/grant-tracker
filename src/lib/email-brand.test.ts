import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

// The six routes that send mail. Listed rather than discovered, so adding a
// seventh sender is a deliberate act that shows up in review.
//
// Was six until 2026-08-30. src/app/api/send-alerts was a duplicate of the
// cron route with a different auth header and no recordRun, unreachable from
// any scheduler, and it had already been marked for deletion in the July
// ingestion scope. Two routes that both look like the alert sender is how the
// wrong one gets called; the cron route below is the only one.
const EMAIL_ROUTES = [
  'src/app/api/contact/route.ts',
  'src/app/api/feedback/route.ts',
  'src/app/api/cron/send-alerts/route.ts',
  'src/app/api/cron/send-digest/route.ts',
  'src/app/api/cron/deadline-reminders/route.ts',
  'src/app/api/cron/pipeline-summary/route.ts',
]

const root = path.resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8')

describe('outbound email carries the current brand', () => {
  // Every one of these six had its own hardcoded granttracker.co.uk fallback.
  // The rebrand was therefore six edits, and one of them was missed for weeks:
  // NEXT_PUBLIC_APP_URL is unset in production, so every link inside the alert
  // and reminder emails resolved to the old domain.
  it.each(EMAIL_ROUTES)('%s has no hardcoded old domain', rel => {
    expect(read(rel)).not.toMatch(/granttracker\.co\.uk/)
  })

  it.each(EMAIL_ROUTES)('%s has no hardcoded old product name', rel => {
    expect(read(rel)).not.toMatch(/Grant Tracker/)
  })

  it.each(EMAIL_ROUTES)('%s does not use the retired lime', rel => {
    // #8ECB3C is retired with the button-hierarchy redesign. In email it is
    // especially easy to miss, because nothing lints the HTML in these strings.
    expect(read(rel)).not.toMatch(/#8ECB3C/i)
  })

  it.each(EMAIL_ROUTES)('%s resolves its addresses through the brand module', rel => {
    // Catches a new route declaring its own const rather than importing.
    const src = read(rel)
    expect(src).toMatch(/from '@\/lib\/mcp-brand'/)
    expect(src).not.toMatch(/const FROM_EMAIL\s*=\s*process\.env/)
    expect(src).not.toMatch(/const APP_URL\s*=\s*process\.env/)
  })
})

describe('no sender was missed', () => {
  it('every route calling Resend is on the list above', () => {
    // The guard is only worth anything if the list is complete, so derive the
    // real set and compare. A new sender fails here until it is added.
    const found: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry)
        if (statSync(full).isDirectory()) walk(full)
        else if (entry === 'route.ts' && /from 'resend'/.test(readFileSync(full, 'utf8'))) {
          found.push(path.relative(root, full))
        }
      }
    }
    walk(path.join(root, 'src/app/api'))
    expect(found.sort()).toEqual([...EMAIL_ROUTES].sort())
  })
})
