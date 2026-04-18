'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Sparkles, ArrowRight, Globe } from 'lucide-react'
import { ONBOARDING_PREFILL_KEY, type OnboardingPrefill } from '@/lib/onboarding'

export default function OnboardingStartPage() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [autoFilling, setAutoFilling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAutoFill() {
    if (!url.trim()) return
    setAutoFilling(true)
    setError(null)
    try {
      const res = await fetch('/api/org-autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Auto-fill failed')

      const prefilledFields: string[] = []
      const prefill: OnboardingPrefill = {}
      if (data.name)            { prefill.name = data.name; prefilledFields.push('name') }
      if (data.charityNumber)   { prefill.charityNumber = data.charityNumber; prefilledFields.push('charityNumber') }
      if (data.orgType)         { prefill.orgType = data.orgType; prefilledFields.push('orgType') }
      if (data.primaryLocation) { prefill.primaryLocation = data.primaryLocation; prefilledFields.push('primaryLocation') }
      if (data.mission)         { prefill.mission = data.mission; prefilledFields.push('mission') }
      if (Array.isArray(data.themes))        { prefill.themes = data.themes }
      if (Array.isArray(data.areasOfWork))   { prefill.areasOfWork = data.areasOfWork }
      if (Array.isArray(data.beneficiaries)) { prefill.beneficiaries = data.beneficiaries }
      if (Array.isArray(data.impactSectors) && data.impactSectors.length > 0) {
        prefill.impactSectors = data.impactSectors
        prefilledFields.push('impactSectors')
      }
      if (Array.isArray(data.beneficiaryGroups) && data.beneficiaryGroups.length > 0) {
        prefill.beneficiaryGroups = data.beneficiaryGroups
        prefilledFields.push('beneficiaryGroups')
      }
      prefill.prefilledFields = prefilledFields

      if (typeof window !== 'undefined') {
        sessionStorage.setItem(ONBOARDING_PREFILL_KEY, JSON.stringify(prefill))
      }
      router.push('/onboarding/wizard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auto-fill failed — please try again')
      setAutoFilling(false)
    }
  }

  function handleManual() {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(ONBOARDING_PREFILL_KEY)
    }
    router.push('/onboarding/wizard')
  }

  return (
    <div className="flex-1 flex items-start justify-center px-6 py-12 md:py-16">
      <div className="w-full max-w-xl">
        {/* Step indicator — tiny */}
        <p
          className="text-xs font-semibold uppercase tracking-widest mb-2"
          style={{ color: '#8A8986', fontFamily: 'var(--font-space-grotesk)' }}
        >
          Set up your profile
        </p>
        <h1
          className="leading-tight mb-3"
          style={{
            fontFamily: 'var(--font-space-grotesk)',
            fontWeight: 700,
            fontSize: 'clamp(26px, 3.5vw, 34px)',
            color: '#2C2C2A',
            letterSpacing: '-0.02em',
          }}
        >
          How would you like to start?
        </h1>
        <p className="text-sm leading-relaxed mb-8" style={{ color: '#5F5E5A' }}>
          The fastest way is to paste your website and we&rsquo;ll pull the basics for you. Otherwise,
          fill in three short steps manually.
        </p>

        {/* PATH 1 — Auto-fill (amber-tinted, primary recommendation) */}
        <div
          className="p-5 mb-3"
          style={{
            background: '#FFF8E1',
            border: '1px solid #EED9A0',
            borderRadius: 14,
          }}
        >
          <div className="flex items-start gap-3 mb-3">
            <div
              className="w-8 h-8 flex items-center justify-center flex-shrink-0"
              style={{ background: '#E8A030', borderRadius: 8 }}
            >
              <Sparkles size={16} color="#FFFFFF" strokeWidth={2.25} />
            </div>
            <div className="flex-1 min-w-0">
              <h2
                className="text-base font-bold leading-snug"
                style={{ fontFamily: 'var(--font-space-grotesk)', color: '#2C2C2A' }}
              >
                Auto-fill from your website
              </h2>
              <p className="text-xs mt-0.5" style={{ color: '#5F5E5A' }}>
                We read your site and pre-fill your profile. You confirm in three short steps.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Globe
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: '#8A8986' }}
              />
              <input
                type="url"
                value={url}
                onChange={e => { setUrl(e.target.value); setError(null) }}
                onKeyDown={e => e.key === 'Enter' && handleAutoFill()}
                placeholder="https://yourorganisation.org"
                className="w-full pl-9 pr-3 py-2.5 text-sm outline-none transition-colors"
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #EED9A0',
                  borderRadius: 10,
                  color: '#2C2C2A',
                  fontFamily: 'var(--font-space-grotesk)',
                }}
              />
            </div>
            <button
              onClick={handleAutoFill}
              disabled={autoFilling || !url.trim()}
              className="px-4 py-2.5 text-sm font-bold whitespace-nowrap transition-opacity hover:opacity-80 disabled:opacity-50 inline-flex items-center gap-1.5"
              style={{
                fontFamily: 'var(--font-space-grotesk)',
                background: '#E8A030',
                color: '#FFFFFF',
                borderRadius: 10,
              }}
            >
              {autoFilling ? 'Reading…' : 'Auto-fill'}
              {!autoFilling && <ArrowRight size={13} strokeWidth={2.5} />}
            </button>
          </div>
          {error && (
            <p className="text-xs mt-2" style={{ color: '#B03A1A' }}>{error}</p>
          )}
        </div>

        {/* PATH 2 — Manual (green, secondary) — priority stacked, NO "OR" divider */}
        <button
          onClick={handleManual}
          className="w-full p-5 text-left transition-colors group"
          style={{
            background: '#FFFFFF',
            border: '1px solid #E0E5D8',
            borderRadius: 14,
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-8 h-8 flex items-center justify-center flex-shrink-0"
              style={{ background: '#8ECB3C', borderRadius: 8 }}
            >
              <ArrowRight size={16} color="#173404" strokeWidth={2.5} />
            </div>
            <div className="flex-1 min-w-0">
              <h2
                className="text-base font-bold leading-snug"
                style={{ fontFamily: 'var(--font-space-grotesk)', color: '#2C2C2A' }}
              >
                Fill it in manually
              </h2>
              <p className="text-xs mt-0.5" style={{ color: '#5F5E5A' }}>
                Three short steps, about two minutes. No website required.
              </p>
            </div>
          </div>
        </button>

        {/* Thin divider before skip */}
        <div className="flex items-center gap-4 mt-8 mb-4">
          <div className="flex-1 h-px" style={{ background: '#E8E0D1' }} />
        </div>

        {/* PATH 3 — Skip (visually separated, explanatory text) */}
        <div className="text-center">
          <Link
            href="/dashboard/search"
            className="inline-flex items-center gap-1.5 text-sm hover:underline"
            style={{ color: '#5F5E5A', fontFamily: 'var(--font-space-grotesk)' }}
          >
            Skip setup for now
          </Link>
          <p className="text-xs mt-1.5 max-w-sm mx-auto leading-relaxed" style={{ color: '#8A8986' }}>
            You&rsquo;ll browse every grant in our catalogue without matching. Come back any time &mdash;
            without a profile, we can&rsquo;t score opportunities against your organisation or send relevant alerts.
          </p>
        </div>
      </div>
    </div>
  )
}
