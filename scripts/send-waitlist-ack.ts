/**
 * The waitlist acknowledgement: preview it, and catch up the people already on
 * the list.
 *
 *   npx tsx scripts/send-waitlist-ack.ts                  who is owed one, sends nothing
 *   npx tsx scripts/send-waitlist-ack.ts --html out.html  write the render to a file
 *   npx tsx scripts/send-waitlist-ack.ts --to a@b.c --send   one preview copy, to a chosen address
 *   npx tsx scripts/send-waitlist-ack.ts --backfill --send   the real catch-up
 *
 * NO ANTHROPIC CALLS. Supabase and Resend only.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS. `api/waitlist` sends the acknowledgement from now on, but it
 * can only send to people who submit the form AFTER it deploys. Fifteen people
 * submitted before that and heard nothing. They are the reason for --backfill.
 *
 * DRY RUN IS THE DEFAULT and --send is the only way past it, for the reason
 * that governs every send path in this repo: email has no undo. The dry run
 * prints the exact recipient list, so the check before a real send is reading
 * that list rather than trusting this comment.
 *
 * IDEMPOTENCE IS IN THE DATABASE, NOT IN THIS FILE. --backfill selects rows
 * where `ack_sent_at is null`, and stamps each one the moment its send is
 * confirmed. Run it twice and the second run finds nobody. That is deliberately
 * not a flag or a local variable: a script that has to be run correctly to be
 * safe is a script that will one day be run incorrectly.
 *
 * --to is for a preview and does NOT touch the database. It signs a removal
 * link over a throwaway uuid, so the link renders and resolves and removes
 * nobody. A preview that consumed a real subscriber's token would be a preview
 * that could unsubscribe them.
 */

import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

// Same manual .env.local loader the other scripts use (no dotenv dep).
for (const line of readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

/* Imported AFTER the env load: mcp-brand reads process.env at module scope, so
   importing it at the top of the file would freeze the fallbacks in place. */
/* eslint-disable @typescript-eslint/no-var-requires */
const { EMAIL_FROM_HEADER, EMAIL_APP_URL, EMAIL_REPLY_TO } = require('../src/lib/mcp-brand')
const { waitlistRemovalUrl } = require('../src/lib/waitlist-unsubscribe')
const {
  renderWaitlistAck, renderWaitlistAckText, WAITLIST_ACK_SUBJECT,
} = require('../src/lib/email/waitlist-ack')

const argv = process.argv.slice(2)
const has = (f: string) => argv.includes(f)
const valueOf = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined }

const SEND     = has('--send')
const BACKFILL = has('--backfill')
const ONE_TO   = valueOf('--to')
const HTML_OUT = valueOf('--html')

function render(rowId: string) {
  const removalUrl = waitlistRemovalUrl(EMAIL_APP_URL, rowId)
  return {
    subject: WAITLIST_ACK_SUBJECT,
    html: renderWaitlistAck({ origin: EMAIL_APP_URL, removalUrl }),
    text: renderWaitlistAckText({ origin: EMAIL_APP_URL, removalUrl }),
    removalUrl,
  }
}

async function main() {
  console.log(`Origin in links: ${EMAIL_APP_URL}`)
  console.log(`From:            ${EMAIL_FROM_HEADER}`)

  if (HTML_OUT) {
    writeFileSync(HTML_OUT, render(randomUUID()).html)
    console.log(`Wrote ${HTML_OUT}. Open it in a browser to eyeball the render.`)
  }

  /* ── One preview copy ──────────────────────────────────────────────────── */
  if (ONE_TO) {
    const m = render(randomUUID())
    console.log(`\nPreview to ${ONE_TO}`)
    console.log(`Removal link (throwaway id, removes nobody): ${m.removalUrl}`)
    if (!SEND) { console.log('\nDry run. Add --send to actually send it.'); return }
    await deliver(ONE_TO, m)
    console.log('Sent.')
    return
  }

  /* ── The catch-up ──────────────────────────────────────────────────────── */
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data: rows, error } = await db
    .from('waitlist_signups')
    .select('id, email, created_at')
    .is('ack_sent_at', null)
    .is('unsubscribed_at', null)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Could not read the waitlist: ${error.message}`)

  const pending = rows ?? []
  console.log(`\n${pending.length} address${pending.length === 1 ? '' : 'es'} owed an acknowledgement:`)
  for (const r of pending) console.log(`  ${r.created_at.slice(0, 10)}  ${r.email}`)

  if (!BACKFILL) { console.log('\nListed only. Add --backfill --send to email them.'); return }
  if (!SEND)     { console.log('\nDry run. Add --send to email them.'); return }
  if (pending.length === 0) { console.log('\nNobody to send to.'); return }

  let sent = 0, failed = 0
  for (const r of pending) {
    const m = render(r.id)
    try {
      await deliver(r.email, m)
    } catch (e) {
      failed++
      console.error(`  FAILED ${r.email}: ${e instanceof Error ? e.message : e}`)
      continue
    }
    // Stamp only after a confirmed send. A miss costs one late email on the
    // next run; stamping first costs somebody who never hears from us at all.
    const { error: stampError } = await db
      .from('waitlist_signups')
      .update({ ack_sent_at: new Date().toISOString() })
      .eq('id', r.id)
    if (stampError) {
      console.error(`  SENT but not stamped, ${r.email} (${r.id}) — a re-run will DUPLICATE: ${stampError.message}`)
    }
    sent++
    console.log(`  sent ${r.email}`)
    // Resend's default ceiling is two requests a second. Sleeping between
    // sends is cheaper than discovering the rate limit halfway through a list.
    await new Promise(res => setTimeout(res, 600))
  }
  console.log(`\n${sent} sent, ${failed} failed.`)
}

async function deliver(to: string, m: { subject: string; html: string; text: string; removalUrl: string }) {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY is not set. Run `vercel env pull` or add it to .env.local.')
  const { error } = await new Resend(key).emails.send({
    from: EMAIL_FROM_HEADER,
    replyTo: EMAIL_REPLY_TO,
    to,
    subject: m.subject,
    html: m.html,
    text: m.text,
    headers: {
      'List-Unsubscribe': `<${m.removalUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  })
  if (error) throw new Error(error.message)
}

main().catch(e => { console.error(e); process.exit(1) })
