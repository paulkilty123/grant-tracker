// The pricing page.
//
// Renders only what Stripe can actually sell. `sellablePlans()` is given the
// lookup keys Stripe currently holds, so a plan whose price is missing is left
// off rather than rendered as a button that fails when clicked — the failure
// mode a hardcoded list produces the first time a price is renamed.
//
// It does NOT mention the trial. `TRIAL_IS_LIVE` is false and the CTA here goes
// to ordinary signup, which lands people on Match, which does not trial. Saying
// "free for 14 days" beside a button that cannot deliver one is the mistake that
// shipped onto the public opportunity page on 29 August and came straight back
// off. `ctaSupportLine()` is the only thing allowed to decide that sentence.

import Link from 'next/link'
import { getStripe } from '@/lib/billing/stripe-client'
import {
  PLANS, PLAN_ORDER, sellablePlans, contactOnlyPlans, fromPriceLabel,
  amountFor, formatAmount, lookupKeyFor, type PlanId,
} from '@/config/plans'
import { foundingOfferIsOpen } from '@/lib/billing/founding'
import { ctaSupportLine } from '@/lib/trial'
import BuyButton from './BuyButton'

export const dynamic = 'force-dynamic'

const INK = '#2C2C2A'
const MID = '#5F5E5A'
const LINE = '#E6E3DC'

async function availableLookupKeys(): Promise<Set<string>> {
  try {
    const prices = await getStripe().prices.list({ active: true, limit: 100 })
    return new Set(prices.data.map(p => p.lookup_key).filter((k): k is string => !!k))
  } catch {
    // A pricing page that 500s because Stripe is briefly unreachable is worse
    // than one that says nothing is purchasable right now: the second is true,
    // recoverable, and does not lose the rest of the page.
    return new Set()
  }
}

function Row({ label, on }: { label: string; on: boolean }) {
  return (
    <li style={{
      display: 'flex', gap: 8, alignItems: 'flex-start',
      fontSize: 14, color: on ? INK : '#A8A6A0', lineHeight: 1.5,
      textDecoration: on ? 'none' : 'line-through',
    }}>
      <span aria-hidden style={{ color: on ? '#639922' : '#C9C6BF' }}>{on ? '✓' : '·'}</span>
      {label}
    </li>
  )
}

function PlanCard({ id, sellable }: { id: PlanId; sellable: boolean }) {
  const plan = PLANS[id]
  const monthly = amountFor(id, 'standard', 'monthly')
  const annual = amountFor(id, 'standard', 'annual')
  const c = plan.capabilities

  return (
    <div style={{
      background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12,
      padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      <div>
        <h2 style={{
          fontFamily: 'var(--font-space-grotesk)', fontWeight: 600,
          fontSize: 20, color: INK, margin: 0,
        }}>{plan.name}</h2>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: MID, lineHeight: 1.5 }}>{plan.summary}</p>
      </div>

      <div>
        <div style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 32, color: INK }}>
          {sellable ? formatAmount(monthly) : fromPriceLabel(id)}
          {sellable && <span style={{ fontSize: 15, fontWeight: 500, color: MID }}> a month</span>}
        </div>
        {sellable && (
          <div style={{ fontSize: 13, color: MID, marginTop: 2 }}>
            or {formatAmount(annual)} a year, which is two months free
          </div>
        )}
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        <Row label="Matched search and eligibility checking" on={c.search} />
        <Row label="Bookmarks with deadline reminders" on={c.bookmarks} />
        <Row label="Alerts when new opportunities open" on={c.alerts} />
        <Row label="Pipeline to track what you are applying for" on={c.pipeline} />
        <Row label="Projects and the application workspace" on={c.applications} />
        {c.orgLimit > 1 && <Row label={`Up to ${c.orgLimit} organisation profiles`} on />}
      </ul>

      {sellable ? (
        <BuyButton plan={id} period="monthly" label={`Choose ${plan.name}`} />
      ) : (
        <a
          href="mailto:hello@shootsfunding.co.uk?subject=Team%20plan"
          style={{
            display: 'block', textAlign: 'center', textDecoration: 'none',
            fontFamily: 'var(--font-space-grotesk)', fontWeight: 600, fontSize: 15,
            color: INK, border: `1px solid ${INK}`, borderRadius: 8, padding: '11px 18px',
          }}
        >
          Get in touch
        </a>
      )}
    </div>
  )
}

export default async function PricingPage() {
  const keys = await availableLookupKeys()
  const sellable = new Set(sellablePlans(keys))
  const contactOnly = new Set(contactOnlyPlans())
  const foundingOpen = foundingOfferIsOpen()

  return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: '56px 24px 80px' }}>
      <h1 style={{
        fontFamily: 'var(--font-space-grotesk)', fontWeight: 700,
        fontSize: 36, color: INK, margin: 0,
      }}>
        Pricing
      </h1>
      <p style={{ margin: '10px 0 0', fontSize: 16, color: MID, maxWidth: 560, lineHeight: 1.6 }}>
        Eligibility and exclusions are shown in full on every plan, including the free one.
        Knowing you cannot apply is worth as much as knowing you can. {ctaSupportLine()}
      </p>

      <div style={{
        marginTop: 32, display: 'grid', gap: 20,
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      }}>
        {PLAN_ORDER.map(id => (
          <PlanCard key={id} id={id} sellable={sellable.has(id) && !contactOnly.has(id)} />
        ))}
      </div>

      {sellable.size === 0 && (
        <p style={{ marginTop: 24, fontSize: 14, color: '#993C1D' }}>
          Plans are not purchasable at the moment. Nothing is wrong with your account.
        </p>
      )}

      {foundingOpen && (
        <p style={{ marginTop: 28, fontSize: 14, color: MID, lineHeight: 1.6 }}>
          Founding rates are open until the end of October and are kept for as long as you stay.{' '}
          <Link href="mailto:hello@shootsfunding.co.uk?subject=Founding%20rate" style={{ color: '#3B6D11' }}>
            Ask about a founding rate
          </Link>
          .
        </p>
      )}
    </main>
  )
}
