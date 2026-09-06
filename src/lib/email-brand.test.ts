import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

// The routes that send mail. Listed rather than discovered, so adding a new
// sender is a deliberate act that shows up in review.
//
// THIS LIST IS NOT EVERY EMAIL A USER RECEIVES, and the gap is the first one
// they get. `supabase.auth.signUp()` hands the address to SUPABASE AUTH, which
// sends the confirmation and password-reset emails from templates configured
// in the Supabase dashboard. Nothing in this repo renders them, so nothing
// here can check them: not the brand assertions below, not the from-name test,
// not code review. They predate all of these and adding them was nobody's
// deliberate act.
//
// Given what the comment below records about a hardcoded old domain surviving
// for weeks in a route that WAS covered, treat the uncovered ones as the more
// likely place for a retired brand to still be sitting. Check them by hand at
// Authentication -> Email Templates whenever this list changes.
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
  // Added 2026-09-05. Fifteen people had submitted the landing waitlist form
  // and heard nothing, because this route wrote a row and returned.
  'src/app/api/waitlist/route.ts',
]

// Senders that are NOT route handlers. The walk below only looks at route.ts,
// so a sender living in src/lib or scripts/ would satisfy every check here by
// being invisible to it — which is the same shape of hole as the Supabase one
// above, dug by us rather than inherited.
const NON_ROUTE_SENDERS = [
  'scripts/send-waitlist-ack.ts',
]

const root = path.resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8')

/**
 * The Supabase Auth templates, as committed. Nothing in the repo renders these;
 * they are pasted into the dashboard by hand, and this folder is the copy the
 * paste is made from. Scanning it is the closest a dashboard-hosted template
 * can get to test coverage: it cannot prove the dashboard matches the file, but
 * it does stop the file itself carrying the old brand, which is how June's
 * version sat here for months saying Grant Tracker.
 *
 * Discovered rather than listed, unlike EMAIL_ROUTES: a new template here is
 * always a sender, so there is nothing for a list to be deliberate about.
 *
 * HTML only, and with the leading comment block stripped, because that is what
 * gets pasted. The comment is where each file records what it replaced, and
 * the README is where the folder does, so both name the old brand on purpose.
 * Scanning them would make "no old brand" a test that only passes when the
 * history is deleted, which is the opposite of the point.
 */
const TEMPLATE_DIR = 'docs/email-templates'
const TEMPLATE_FILES = readdirSync(path.join(root, TEMPLATE_DIR))
  .filter(f => /\.html$/.test(f))
  .map(f => `${TEMPLATE_DIR}/${f}`)

/** The part of a template that is pasted: everything after the comment block. */
export const pastedBody = (src: string) => src.replace(/<!--[\s\S]*?-->/g, '')

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

describe('the committed Supabase Auth templates carry the current brand', () => {
  it('has at least the confirm and reset templates to check', () => {
    // A scan over an empty folder passes for nothing. Assert the precondition.
    expect(TEMPLATE_FILES).toEqual(expect.arrayContaining([
      `${TEMPLATE_DIR}/supabase-confirm-signup.html`,
      `${TEMPLATE_DIR}/supabase-reset-password.html`,
    ]))
  })

  it.each(TEMPLATE_FILES)('%s has no hardcoded old domain', rel => {
    expect(pastedBody(read(rel))).not.toMatch(/granttracker\.co\.uk/)
  })

  it.each(TEMPLATE_FILES)('%s has no hardcoded old product name', rel => {
    expect(pastedBody(read(rel))).not.toMatch(/Grant Tracker/)
  })

  it.each(TEMPLATE_FILES)('%s does not use the retired lime', rel => {
    expect(pastedBody(read(rel))).not.toMatch(/#8ECB3C/i)
  })

  it.each(TEMPLATE_FILES)('%s uses the lockup, not a live wordmark', rel => {
    // The PNG contains the word. Live text beside it shows it twice.
    const src = pastedBody(read(rel))
    expect(src).toMatch(/\/email\/shoots-logo@2x\.png/)
    expect(src).not.toMatch(/>\s*shoots\s*<\/td>/i)
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

  it('every sender outside src/app/api is on the list above', () => {
    // Same guard, other half of the tree. Without it, moving a Resend call one
    // directory sideways silently exempts it from every check in this file.
    const found: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue
        const full = path.join(dir, entry)
        if (statSync(full).isDirectory()) walk(full)
        // Test files are excluded, this one included: it carries the pattern
        // it searches for, so it would otherwise always find itself.
        else if (/\.ts$/.test(entry) && !/\.test\.ts$/.test(entry)
                 && /from 'resend'/.test(readFileSync(full, 'utf8'))) {
          found.push(path.relative(root, full))
        }
      }
    }
    walk(path.join(root, 'src/lib'))
    walk(path.join(root, 'scripts'))
    expect(found.sort()).toEqual([...NON_ROUTE_SENDERS].sort())
  })
})
