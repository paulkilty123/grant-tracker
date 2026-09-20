/**
 * Prove the twelve-month end to the launch price, in the sandbox.
 *
 *   npx tsx scripts/stripe-launch-schedule-rehearsal.ts
 *
 * Creates a throwaway customer with a test card, subscribes it to the Apply
 * launch monthly price, runs the SAME ensureLaunchSchedule the webhook runs,
 * reads the schedule back from Stripe and checks the shape:
 *
 *   phase 1  the launch price, exactly twelve billing cycles
 *   phase 2  the standard price, open ended
 *
 * Then runs ensureLaunchSchedule again and checks it does nothing (the
 * webhook will call it on every subscription event). Then cancels the
 * subscription and deletes the customer, so the sandbox is as it was.
 *
 * Refuses a live key outright: this creates a subscription.
 * NO ANTHROPIC CALLS. Stripe test mode only.
 */

import { readFileSync } from 'fs'
import path from 'path'
import Stripe from 'stripe'
import { lookupKeyFor, LAUNCH_PRICE_MONTHS } from '../src/config/plans'
import { ensureLaunchSchedule } from '../src/lib/billing/launch-schedule-stripe'

for (const line of readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const key = process.env.STRIPE_SECRET_KEY
if (!key || !key.startsWith('sk_test_')) {
  console.error('Test key only. This creates a subscription.')
  process.exit(1)
}
const stripe = new Stripe(key)

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1) }
  console.log(`  ok   ${msg}`)
}

async function priceId(lookupKey: string): Promise<string> {
  const r = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })
  if (!r.data[0]) throw new Error(`no active price for ${lookupKey}; run the catalogue sync first`)
  return r.data[0].id
}

async function main() {
  const launchKey = lookupKeyFor('apply', 'launch', 'monthly')
  const standardKey = lookupKeyFor('apply', 'standard', 'monthly')
  const launch = await priceId(launchKey)
  const standard = await priceId(standardKey)
  console.log(`\nLaunch schedule rehearsal (sandbox)\n  launch price ${launch}, standard price ${standard}\n`)

  const customer = await stripe.customers.create({
    email: 'launch-rehearsal@example.com',
    name: 'Launch schedule rehearsal (delete me)',
    payment_method: 'pm_card_visa',
    invoice_settings: { default_payment_method: 'pm_card_visa' },
  })
  let subId: string | null = null
  try {
    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: launch }],
      metadata: { owner_id: 'rehearsal', org_id: 'rehearsal' },
    })
    subId = sub.id
    assert(sub.status === 'active', `subscription ${sub.id} is active on the launch price`)
    assert(!sub.schedule, 'precondition: Stripe attached no schedule of its own')

    // The thing under test, exactly as the webhook calls it.
    const fresh = await stripe.subscriptions.retrieve(sub.id)
    const scheduleId = await ensureLaunchSchedule(stripe, fresh)
    assert(scheduleId, 'ensureLaunchSchedule attached a schedule')

    const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId!)
    assert(schedule.phases.length === 2, `schedule has two phases (has ${schedule.phases.length})`)
    const [p1, p2] = schedule.phases
    const p1Price = typeof p1.items[0].price === 'string' ? p1.items[0].price : p1.items[0].price.id
    const p2Price = typeof p2.items[0].price === 'string' ? p2.items[0].price : p2.items[0].price.id
    assert(p1Price === launch, 'phase 1 is the launch price')
    assert(p2Price === standard, 'phase 2 is the standard price')
    const months = Math.round((p1.end_date - p1.start_date) / (30 * 86_400))
    assert(months === LAUNCH_PRICE_MONTHS, `phase 1 runs about ${LAUNCH_PRICE_MONTHS} months (measured ${months})`)
    assert(p2.end_date === undefined || p2.end_date === null || (p2.end_date - p2.start_date) > 20 * 365 * 86_400 || schedule.end_behavior === 'release',
      `phase 2 is open ended, end_behavior ${schedule.end_behavior}`)
    console.log(`  info phase 1 ${new Date(p1.start_date * 1000).toISOString().slice(0, 10)} to ${new Date(p1.end_date * 1000).toISOString().slice(0, 10)}`)

    // Idempotent: the webhook will call this again on every update event.
    const again = await ensureLaunchSchedule(stripe, await stripe.subscriptions.retrieve(sub.id))
    assert(again === scheduleId, 'a second call returns the same schedule and creates nothing')
    const count = await stripe.subscriptionSchedules.list({ customer: customer.id, limit: 10 })
    assert(count.data.length === 1, 'the customer holds exactly one schedule')

    console.log('\nPASS: the launch price ends after twelve months and moves to standard.\n')
  } finally {
    // Cancelling a subscription under a schedule needs the schedule released
    // or cancelled first.
    const schedules = await stripe.subscriptionSchedules.list({ customer: customer.id, limit: 10 })
    for (const s of schedules.data) {
      if (s.status === 'active' || s.status === 'not_started') await stripe.subscriptionSchedules.cancel(s.id).catch(() => null)
    }
    if (subId) await stripe.subscriptions.cancel(subId).catch(() => null)
    await stripe.customers.del(customer.id)
    console.log('  cleaned up: subscription cancelled, customer deleted')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
