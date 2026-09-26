'use client'
// The three plan cards, with the monthly or annual choice. Styled to match
// the landing page's pricing section (public/landing/launch.html): the
// colour pill for the plan name, the struck list price beside the launch
// price, the feature list, and the deep pill buttons. Copy is lifted from
// the same section so the two never disagree.

import { useState } from 'react'
import BuyButton from './BuyButton'
import type { PlanId, PriceKind, BillingPeriod } from '@/config/plans'

export interface CardPlan {
  id: PlanId
  name: string
  strap: string
  pill: string
  features: string[]
  /** Pence, or null for a plan with no price. */
  monthly: number | null
  annual: number | null
  listMonthly: number | null
  listAnnual: number | null
  sellable: boolean
  popular: boolean
}

const DEEP = '#1D3C3E', CREAM = '#F6F1E7', INK = '#4b574f', MUTE = '#7a857e', HAIR = 'rgba(29,60,62,.10)'
const GROTESK = "var(--font-space-grotesk), 'Space Grotesk', sans-serif"
const fmt = (p: number) => (p % 100 === 0 ? `£${p / 100}` : `£${(p / 100).toFixed(2)}`)

function Tick() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true" style={{ flex: 'none', marginTop: 3 }}>
      <path d="M4 10.5l4 4 8-9" stroke={DEEP} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function PricingCards({ plans, kind, launchOpen }: { plans: CardPlan[]; kind: PriceKind; launchOpen: boolean }) {
  const [period, setPeriod] = useState<BillingPeriod>('monthly')
  const seg = (p: BillingPeriod, label: string) => (
    <button
      onClick={() => setPeriod(p)}
      aria-pressed={period === p}
      style={{
        fontFamily: GROTESK, fontWeight: 600, fontSize: 14, padding: '9px 18px', borderRadius: 999, cursor: 'pointer',
        border: 'none', background: period === p ? DEEP : 'transparent', color: period === p ? CREAM : DEEP,
      }}
    >
      {label}
    </button>
  )

  return (
    <>
      <div style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 999, border: `1.5px solid ${DEEP}`, margin: '28px 0 8px' }}>
        {seg('monthly', 'Monthly')}
        {seg('annual', 'Annual, two months free')}
      </div>

      <div style={{ display: 'grid', gap: 22, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', marginTop: 28, alignItems: 'start' }}>
        {plans.map(plan => {
          const amount = period === 'monthly' ? plan.monthly : plan.annual
          const list = period === 'monthly' ? plan.listMonthly : plan.listAnnual
          const other = period === 'monthly' ? plan.annual : plan.monthly
          const priced = plan.sellable && amount !== null
          const unit = period === 'monthly' ? ' a month' : ' a year'
          return (
            <div key={plan.id} style={{
              background: '#fff', borderRadius: 20, padding: 36, position: 'relative',
              border: plan.popular ? `2px solid ${DEEP}` : '0.5px solid rgba(29,60,62,0.14)',
              boxShadow: plan.popular ? '0 14px 40px rgba(29,60,62,0.10)' : 'none',
            }}>
              {plan.popular && (
                <span style={{ position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)', background: '#2E2E2E', color: CREAM, fontFamily: GROTESK, fontSize: 14, fontWeight: 600, padding: '8px 18px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                  14 days free
                </span>
              )}
              <div style={{ margin: '0 0 14px' }}>
                <h3 style={{ display: 'inline-block', fontFamily: GROTESK, fontSize: 26, fontWeight: 600, letterSpacing: -0.3, color: DEEP, margin: 0, padding: '8px 22px', borderRadius: 999, background: plan.pill }}>
                  {plan.name}
                </h3>
              </div>
              <p style={{ fontSize: 14, color: MUTE, margin: '0 0 24px' }}>{plan.strap}</p>

              {priced ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
                    {kind === 'launch' && list !== null && list !== amount && (
                      <span aria-hidden style={{ position: 'relative', fontFamily: GROTESK, fontWeight: 500, fontSize: 34, color: MUTE, letterSpacing: -0.7, lineHeight: 1 }}>
                        {fmt(list)}
                        <span style={{ position: 'absolute', left: '-9%', right: '-9%', top: '50%', height: 2, borderRadius: 2, background: MUTE, transform: 'translateY(-50%) rotate(-12deg)' }} />
                      </span>
                    )}
                    <p style={{ fontFamily: GROTESK, fontWeight: 600, fontSize: 52, color: DEEP, margin: '10px 0 4px', lineHeight: 1 }}>
                      {fmt(amount!)}<small style={{ fontSize: 19, fontFamily: 'inherit', fontWeight: 400, color: MUTE }}>{unit}</small>
                    </p>
                  </div>
                  <p style={{ fontSize: 13.5, color: MUTE, margin: '12px 0 0', lineHeight: 1.55 }}>
                    {kind === 'launch' && launchOpen
                      ? <>Launch price until 31 October, held for 12 months. {other !== null && <>Or {fmt(other)} {period === 'monthly' ? 'a year' : 'a month'}.</>}</>
                      : other !== null ? <>Or {fmt(other)} {period === 'monthly' ? 'a year' : 'a month'}.</> : null}
                  </p>
                </>
              ) : (
                <>
                  <p style={{ fontFamily: GROTESK, fontWeight: 600, fontSize: 31, color: DEEP, margin: '8px 0 0', letterSpacing: -0.7, lineHeight: 1 }}>Get in touch</p>
                  <p style={{ fontSize: 13.5, color: MUTE, margin: '10px 0 0', lineHeight: 1.55 }}>Quoted for your organisation</p>
                </>
              )}

              <div style={{ fontSize: 15, color: INK, display: 'flex', flexDirection: 'column', gap: 12, borderTop: `1px solid ${HAIR}`, marginTop: 22, paddingTop: 20 }}>
                {plan.features.map(f => (
                  <span key={f} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', lineHeight: 1.5 }}><Tick />{f}</span>
                ))}
              </div>

              <div style={{ marginTop: 26 }}>
                {priced ? (
                  <BuyButton plan={plan.id} period={period} kind={kind} label={`Choose ${plan.name}`} variant={plan.popular ? 'primary' : 'ghost'} />
                ) : (
                  <a href="mailto:hello@shootsfunding.co.uk?subject=Team%20plan" style={{
                    display: 'block', textAlign: 'center', textDecoration: 'none', fontFamily: GROTESK, fontWeight: 600, fontSize: 16,
                    padding: '15px 32px', borderRadius: 999, border: `1.5px solid ${DEEP}`, color: DEEP, background: 'transparent',
                  }}>
                    Get a quote
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
