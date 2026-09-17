/**
 * The launch-day email to the waitlist: preview it, then send it once to
 * everyone who has not had it.
 *
 *   npx tsx scripts/send-launch-email.ts                     who has not had it, sends nothing
 *   npx tsx scripts/send-launch-email.ts --html out.html     write the render to a file
 *   npx tsx scripts/send-launch-email.ts --to a@b.c --send   one preview copy, to a chosen address
 *   npx tsx scripts/send-launch-email.ts --all --send        the real send, Thursday 9am, on Paul's word
 *
 * NO ANTHROPIC CALLS. Supabase and Resend only.
 *
 * The acknowledgement promised one email the morning we open, with a link
 * straight to signup. This is that email, sent from Paul's own address with
 * reply-to him. DRY RUN IS THE DEFAULT and --send is the only way past it.
 * Idempotence is in the database: --all selects rows where launch_sent_at is
 * null and stamps each one as its send is confirmed, so a re-run finds nobody.
 * --to is a preview and touches no row; its removal link is signed over a
 * throwaway id and removes nobody.
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
  renderLaunchEmail, renderLaunchEmailText, LAUNCH_EMAIL_SUBJECT,
} = require('../src/lib/email/launch-announcement')

const LAUNCH_FROM = 'Paul Kilty, Shoots Funding <paul@shootsfunding.co.uk>'
const LAUNCH_REPLY_TO = 'paul@shootsfunding.co.uk'

const argv = process.argv.slice(2)
const has = (f: string) => argv.includes(f)
const valueOf = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined }

const SEND     = has('--send')
const ALL = has('--all')
const ONE_TO   = valueOf('--to')
const HTML_OUT = valueOf('--html')

function render(rowId: string) {
  const removalUrl = waitlistRemovalUrl(EMAIL_APP_URL, rowId)
  return {
    subject: LAUNCH_EMAIL_SUBJECT,
    html: renderLaunchEmail({ origin: EMAIL_APP_URL, removalUrl }),
    text: renderLaunchEmailText({ origin: EMAIL_APP_URL, removalUrl }),
    removalUrl,
  }
}

async function main() {
  console.log(`Origin in links: ${EMAIL_APP_URL}`)
  console.log(`From:            ${LAUNCH_FROM}`)

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
    .is('launch_sent_at', null)
    .is('unsubscribed_at', null)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Could not read the waitlist: ${error.message}`)

  const pending = rows ?? []
  console.log(`\n${pending.length} address${pending.length === 1 ? '' : 'es'} not yet sent the launch email:`)
  for (const r of pending) console.log(`  ${r.created_at.slice(0, 10)}  ${r.email}`)

  if (!ALL) { console.log('\nListed only. Add --all --send to email them.'); return }
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
      .update({ launch_sent_at: new Date().toISOString() })
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
    // A note from the founder, not a system send: his name on the from line
    // and his address on reply-to, so "I read every reply" is literally true.
    from: LAUNCH_FROM,
    replyTo: LAUNCH_REPLY_TO,
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
