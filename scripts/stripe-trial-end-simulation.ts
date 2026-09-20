/**
 * What actually happens to a no-card trialist on day 15?
 *
 * Paul saw "Auto-cancels 29 Nov 2026" on a subscription whose trial ends
 * 14 September — ten weeks later, which is the shape of Stripe's default dunning
 * schedule and not the cancel-at-trial-end behaviour we configured. The
 * subscription object DOES carry
 * `trial_settings.end_behavior.missing_payment_method: "cancel"`, so the
 * settings and the screen disagree.
 *
 * Reading either one again is not evidence. This drives a real subscription
 * through a Stripe test clock and reports the status it actually lands in, then
 * says whether our entitlement rule would treat that status as paying.
 *
 * The risk being tested: `past_due` IS entitling in our rule (dunning grace for
 * a card that failed). If a no-card trial lands in past_due rather than
 * canceled, every trialist gets ten free weeks AND the day-15 "your access has
 * ended" email would be false.
 *
 * NO ANTHROPIC CALLS. Stripe sandbox only, which is free.
 *
 *   npx tsx scripts/stripe-trial-end-simulation.ts
 */

import { readFileSync } from 'fs'
import path from 'path'
import Stripe from 'stripe'

for (const line of readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const key = process.env.STRIPE_SECRET_KEY
if (!key?.startsWith('sk_test_')) {
  console.error('Refusing to run against anything but a test key.')
  process.exit(1)
}
const stripe = new Stripe(key)

/** Mirrors ENTITLING_STATUSES in src/lib/billing/reconcile.ts and the SQL. */
const ENTITLING = new Set(['trialing', 'active', 'past_due'])

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function settle(clockId: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const c = await stripe.testHelpers.testClocks.retrieve(clockId)
    if (c.status === 'ready') return
    if (c.status === 'internal_failure') throw new Error('test clock failed')
    await sleep(2000)
  }
  throw new Error('test clock did not settle')
}

async function main() {
  const start = Math.floor(Date.now() / 1000)
  const clock = await stripe.testHelpers.testClocks.create({
    frozen_time: start,
    name: 'trial end, no card',
  })
  console.log(`test clock ${clock.id} frozen at ${new Date(start * 1000).toISOString()}`)

  const customer = await stripe.customers.create({
    email: 'trial-sim@mcp-fixtures.invalid',
    test_clock: clock.id,
  })

  const prices = await stripe.prices.list({ lookup_keys: ['shoots_apply_standard_monthly'], limit: 1 })
  const price = prices.data[0]
  if (!price) throw new Error('shoots_apply_standard_monthly not found')

  // The exact parameters /api/billing/checkout sends.
  const sub = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: price.id }],
    trial_period_days: 14,
    trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
    metadata: { owner_id: 'simulation', org_id: 'simulation' },
  })
  console.log(`subscription ${sub.id}: ${sub.status}, trial ends ${new Date(sub.trial_end! * 1000).toISOString()}`)
  console.log(`  trial_settings: ${JSON.stringify(sub.trial_settings)}`)

  for (const [label, at] of [
    ['1 hour AFTER trial end', sub.trial_end! + 3600],
    ['1 week after that',      sub.trial_end! + 3600 + 7 * 86400],
    ['10 weeks after trial end', sub.trial_end! + 70 * 86400],
  ] as const) {
    await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: at })
    await settle(clock.id)
    const now = await stripe.subscriptions.retrieve(sub.id)
    const entitled = ENTITLING.has(now.status)
    console.log(
      `\n${label} (${new Date(at * 1000).toISOString()})\n` +
      `  status: ${now.status}\n` +
      `  our rule would treat this as entitled: ${entitled ? 'YES  <-- free access' : 'no'}`,
    )
    if (now.status === 'canceled') {
      console.log('  cancelled, nothing further to observe')
      break
    }
  }

  await stripe.testHelpers.testClocks.del(clock.id)
  console.log('\ntest clock deleted; the customer and subscription go with it')
}

main().catch(e => { console.error(e); process.exit(1) })
