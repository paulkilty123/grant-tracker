/**
 * Create the Stripe product and price catalogue from src/config/plans.ts.
 *
 *   npx tsx scripts/stripe-sync-catalogue.ts           dry run, changes nothing
 *   npx tsx scripts/stripe-sync-catalogue.ts --apply   creates what is missing
 *
 * Paul skipped Stripe's dashboard setup on purpose: the repo is the single
 * source of truth for what we sell, and the dashboard stays empty until this
 * script fills it. That only holds if nobody ever adds a price in the UI to
 * unblock themselves, so this script is also the thing that NOTICES when
 * somebody has.
 *
 * NO ANTHROPIC CALLS. Stripe API only, and in the sandbox that is free.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT WILL NOT DO
 *
 * It will not change an existing price, because Stripe will not let it: a price
 * is immutable once created. When the config and Stripe disagree, the script
 * stops and says so rather than creating a second price alongside the first.
 * Two live prices for one plan is the failure worth preventing — what a
 * customer pays would then depend on which one the checkout happened to
 * resolve, and that is very hard to see and very expensive to discover.
 *
 * Changing a price for real is: create the new one, archive the old, decide
 * what happens to everyone on the old one. That is a decision, not a sync.
 */

import { readFileSync } from 'fs'
import path from 'path'
import Stripe from 'stripe'
import { PLANS, PLAN_ORDER, definedPrices, CURRENCY, formatAmount } from '../src/config/plans'
import { verdictFor, stripeInterval, type ExistingPrice } from '../src/lib/billing/price-sync'

// Same manual .env.local loader the other scripts use (no dotenv dep). The
// pattern allows digits, unlike the older copies of this loader, because
// nothing guarantees a key name never has one.
for (const line of readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const APPLY = process.argv.includes('--apply')

const key = process.env.STRIPE_SECRET_KEY
if (!key) {
  console.error('STRIPE_SECRET_KEY is not set. Nothing to do.')
  process.exit(1)
}
if (!key.startsWith('sk_test_') && !process.argv.includes('--i-mean-live')) {
  // The founding prices are permanent commitments. Creating them by accident
  // against the live account is not something to discover afterwards.
  console.error('That is not a test key. Re-run with --i-mean-live if you truly mean it.')
  process.exit(1)
}

const stripe = new Stripe(key)

/** Deterministic, so re-running finds the product rather than making another. */
const productId = (plan: string) => `shoots_${plan}`

async function ensureProduct(plan: (typeof PLAN_ORDER)[number]): Promise<string> {
  const id = productId(plan)
  const want = { name: PLANS[plan].name, description: PLANS[plan].summary }

  try {
    const existing = await stripe.products.retrieve(id)
    const drifted =
      existing.name !== want.name || (existing.description ?? '') !== want.description
    if (!drifted) {
      console.log(`  product ${id.padEnd(14)} present`)
      return id
    }
    // Products, unlike prices, ARE mutable, and the name and blurb are copy
    // rather than commercial terms. Safe to bring into line.
    console.log(`  product ${id.padEnd(14)} ${APPLY ? 'updating copy' : 'WOULD update copy'}`)
    if (APPLY) await stripe.products.update(id, want)
    return id
  } catch (e) {
    if ((e as Stripe.errors.StripeError)?.code !== 'resource_missing') throw e
    console.log(`  product ${id.padEnd(14)} ${APPLY ? 'creating' : 'WOULD create'}`)
    if (APPLY) await stripe.products.create({ id, ...want })
    return id
  }
}

async function findPrice(lookupKey: string): Promise<ExistingPrice | null> {
  // Include inactive, so an archived price is seen and judged rather than
  // silently missed and recreated under a key Stripe still holds.
  const res = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 2, active: undefined })
  if (res.data.length === 0) return null
  if (res.data.length > 1) {
    throw new Error(
      `Two prices share the lookup key ${lookupKey}. That should be impossible; resolve it in Stripe before running this again.`,
    )
  }
  const p = res.data[0]
  return {
    id: p.id, unit_amount: p.unit_amount, currency: p.currency,
    recurring: p.recurring ? { interval: p.recurring.interval } : null,
    active: p.active,
  }
}

async function main() {
  console.log(`\nStripe catalogue sync — ${APPLY ? 'APPLYING' : 'dry run, nothing will change'}`)
  console.log(`account key: ${key!.slice(0, 12)}…\n`)

  const productIds = new Map<string, string>()
  console.log('Products')
  for (const plan of PLAN_ORDER) productIds.set(plan, await ensureProduct(plan))

  console.log('\nPrices')
  const mismatches: string[] = []
  let created = 0, ok = 0

  for (const want of definedPrices()) {
    const found = await findPrice(want.lookupKey)
    const verdict = verdictFor(
      { lookupKey: want.lookupKey, amount: want.amount, currency: CURRENCY, interval: stripeInterval(want.period) },
      found,
    )
    const label = `${want.lookupKey.padEnd(32)} ${formatAmount(want.amount).padStart(6)}/${want.period === 'monthly' ? 'mo' : 'yr'}`

    if (verdict.action === 'ok') { console.log(`  ${label}  present`); ok++; continue }

    if (verdict.action === 'mismatch') {
      console.log(`  ${label}  MISMATCH`)
      for (const d of verdict.differences) console.log(`      ${d}`)
      mismatches.push(`${want.lookupKey}: ${verdict.differences.join('; ')}`)
      continue
    }

    console.log(`  ${label}  ${APPLY ? 'creating' : 'WOULD create'}`)
    if (APPLY) {
      await stripe.prices.create({
        product: productIds.get(want.plan)!,
        unit_amount: want.amount,
        currency: CURRENCY,
        recurring: { interval: stripeInterval(want.period) },
        lookup_key: want.lookupKey,
        nickname: `${PLANS[want.plan].name} ${want.kind === 'founding' ? 'founding ' : ''}${want.period}`,
      })
    }
    created++
  }

  console.log(`\n${ok} already right, ${created} ${APPLY ? 'created' : 'to create'}, ${mismatches.length} mismatched`)

  if (mismatches.length > 0) {
    console.error('\nStopped: Stripe disagrees with the config on the prices above.')
    console.error('A price cannot be edited. Changing one means creating a new price, archiving')
    console.error('the old, and deciding what happens to anyone subscribed to it. That is a')
    console.error('decision for a person, so nothing was created for those keys.')
    process.exit(1)
  }
  if (!APPLY && created > 0) console.log('\nRe-run with --apply to create them.')
}

main().catch(e => { console.error(e); process.exit(1) })
