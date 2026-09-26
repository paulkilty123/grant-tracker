// The pricing page, for people already signed in (it sits behind the auth
// gate). Same three cards as the landing page's pricing section, same copy,
// same look, plus the monthly or annual choice the landing page does not need.
//
// Renders only what Stripe can actually sell: `sellablePlans()` is given the
// lookup keys Stripe currently holds, so a plan whose price is missing shows
// as not purchasable rather than as a button that fails when clicked.

import { getStripe } from '@/lib/billing/stripe-client'
import { PLANS, PLAN_ORDER, sellablePlans, contactOnlyPlans, amountFor, type PriceKind } from '@/config/plans'
import { launchPriceIsOpen } from '@/lib/billing/founding'
import PricingCards, { type CardPlan } from './PricingCards'

export const dynamic = 'force-dynamic'

const DEEP = '#1D3C3E', MUTE = '#7a857e', INK_SOFT = '#5f6b64'
const GROTESK = "var(--font-space-grotesk), 'Space Grotesk', sans-serif"

/** Copy from public/landing/launch.html, the pricing section. Keep the two in step. */
const CARD_COPY: Record<string, { strap: string; pill: string; features: string[] }> = {
  match: {
    strap: 'Find the funding', pill: '#9BCA9D',
    features: [
      'Grants, programmes, investment and in-kind',
      'Eligibility matched to you',
      'Insight on every opportunity',
      'Saved opportunities and deadlines',
      'Weekly update, new matches and deadlines',
      'Claude connector, search only',
    ],
  },
  apply: {
    strap: 'The workspace', pill: '#EBCE78',
    features: [
      'Everything in Match',
      'Pipeline from identified to secured',
      'Projects with funding search',
      'Application management',
      'Export your pipeline',
      'Claude connector with pipeline tools',
    ],
  },
  team: {
    strap: 'For teams and consultants', pill: '#ABCBEE',
    features: [
      'Everything in Apply',
      'Up to 5 people in one organisation',
      'Or 5 organisation profiles, each with its own pipeline',
    ],
  },
}

async function availableLookupKeys(): Promise<Set<string>> {
  try {
    const prices = await getStripe().prices.list({ active: true, limit: 100 })
    return new Set(prices.data.map(p => p.lookup_key).filter((k): k is string => !!k))
  } catch {
    // A pricing page that 500s because Stripe is briefly unreachable is worse
    // than one that says nothing is purchasable right now.
    return new Set()
  }
}

export default async function PricingPage() {
  const keys = await availableLookupKeys()
  const contactOnly = new Set(contactOnlyPlans())
  // While the launch price is open it is THE price on this page. Somebody
  // arriving in November sees the standard price and nothing about an offer
  // they missed.
  const launchOpen = launchPriceIsOpen()
  const kind: PriceKind = launchOpen ? 'launch' : 'standard'
  const sellable = new Set(sellablePlans(keys, kind))

  const plans: CardPlan[] = PLAN_ORDER.map(id => ({
    id,
    name: PLANS[id].name,
    strap: CARD_COPY[id].strap,
    pill: CARD_COPY[id].pill,
    features: CARD_COPY[id].features,
    monthly: amountFor(id, kind, 'monthly'),
    annual: amountFor(id, kind, 'annual'),
    listMonthly: amountFor(id, 'standard', 'monthly'),
    listAnnual: amountFor(id, 'standard', 'annual'),
    sellable: sellable.has(id) && !contactOnly.has(id),
    popular: id === 'apply',
  }))

  return (
    <main style={{ maxWidth: 1120, margin: '0 auto', padding: '56px 24px 80px' }}>
      <p style={{ fontFamily: GROTESK, fontSize: 13, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: DEEP, margin: '0 0 16px' }}>
        Pricing
      </p>
      <h1 style={{ fontFamily: GROTESK, fontWeight: 500, letterSpacing: '-0.01em', fontSize: 'clamp(32px, 4vw, 44px)', color: DEEP, margin: 0 }}>
        Choose your plan.
      </h1>
      <p style={{ margin: '14px 0 0', fontSize: 17, lineHeight: 1.6, color: INK_SOFT, maxWidth: '34em' }}>
        Every new organisation starts with 14 days on Apply. No card, and you choose a plan at the end. Nothing you have saved is lost.
      </p>

      <PricingCards plans={plans} kind={kind} launchOpen={launchOpen} />

      {sellable.size === 0 && (
        <p style={{ marginTop: 24, fontSize: 14, color: '#993C1D' }}>
          Plans are not purchasable at the moment. Nothing is wrong with your account.
        </p>
      )}

      <p style={{ fontSize: 14, color: MUTE, lineHeight: 1.7, margin: '26px 0 0', maxWidth: '70em' }}>
        {launchOpen && <><b>Launch price.</b> Take it before 31 October and it is yours for 12 months. After that, Match is £19 a month and Apply is £35. </>}
        <b>Cancel any time.</b> If you ask in your first month, we refund you in full, no questions asked.
      </p>
      <p style={{ fontSize: 14, color: MUTE, margin: '12px 0 0' }}>
        Every plan includes direct email support from the founder, not a ticket queue.
      </p>
    </main>
  )
}
