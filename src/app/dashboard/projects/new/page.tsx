'use client'

// New project — project-first phase 2. One box: describe the project in your
// own words or paste from an old document, plus an optional budget. One fast
// extraction call structures it; the user reviews on the project page.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getOrganisationByOwner } from '@/lib/organisations'
import { T, UI, BODY, inputStyle, primaryBtn } from '@/components/builder/tokens'

export default function NewProjectPage() {
  const router = useRouter()
  const [orgId, setOrgId] = useState<string | null>(null)
  const [rawText, setRawText] = useState('')
  const [budget, setBudget] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'New project · Shoots'
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      const org = await getOrganisationByOwner(user.id)
      if (org) setOrgId(org.id)
    }
    init()
  }, [router])

  async function handleExtract() {
    setError(null)
    if (!orgId) { setError('Complete your organisation profile first'); return }
    if (rawText.trim().length < 30) {
      setError('Describe the project in a sentence or two first')
      return
    }
    const budgetNum = budget.trim() ? Number(budget.replace(/[£,\s]/g, '')) : null
    if (budget.trim() && (!Number.isFinite(budgetNum) || (budgetNum as number) <= 0)) {
      setError('The budget should be a number, like 15000')
      return
    }
    setWorking(true)
    try {
      const res = await fetch('/api/projects/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId, raw_text: rawText, budget_hint: budgetNum }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data?.error ?? 'Could not read the description'); setWorking(false); return }
      router.push(`/dashboard/projects/${data.id}`)
    } catch {
      setError('Could not reach the server, please try again')
      setWorking(false)
    }
  }

  return (
    <div style={{ maxWidth: 720, marginInline: 'auto' }}>
      <Link href="/dashboard/projects" style={{
        fontFamily: UI, fontWeight: 500, fontSize: 13, color: T.textSecondary,
        textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16,
      }}>
        <ArrowLeft size={14} /> Projects
      </Link>

      {/* Stepper — mirrors the new-application flow so the two creation
          experiences read as one product. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 24, height: 24, borderRadius: 999, background: T.greenDeep, color: '#F1F7E4',
            fontFamily: UI, fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>1</span>
          <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 13, color: T.textPrimary }}>Describe</span>
        </div>
        <div style={{ flex: '0 0 32px', height: 1, background: T.borderStrong }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 24, height: 24, borderRadius: 999, background: T.cream, color: T.textTertiary,
            fontFamily: UI, fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>2</span>
          <span style={{ fontFamily: UI, fontWeight: 500, fontSize: 13, color: T.textTertiary }}>Review &amp; match</span>
        </div>
      </div>

      <h1 style={{ fontFamily: UI, fontWeight: 600, fontSize: 24, color: T.textPrimary, letterSpacing: '-0.01em', margin: '0 0 8px' }}>
        Describe your project
      </h1>
      <p style={{ fontFamily: BODY, fontSize: 14, color: T.textSecondary, margin: '0 0 22px', lineHeight: 1.6, maxWidth: 560 }}>
        In your own words: what it will do, who it is for, and the difference it makes. Rough
        notes are fine, and you can paste straight from an old application or project plan. We
        will sort it into sections you can edit.
      </p>

      <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: '20px 24px' }}>
        <label htmlFor="project-description" style={{
          fontFamily: UI, fontWeight: 600, fontSize: 13, color: T.textPrimary, display: 'block', marginBottom: 8,
        }}>
          The project
        </label>
        <textarea
          id="project-description"
          value={rawText}
          onChange={e => setRawText(e.target.value)}
          rows={10}
          placeholder={'e.g. We want to run weekly football coaching for 40 young people aged 11 to 16 on the Larkfield estate, where there is nothing for them after school. Two qualified coaches, a year of sessions, and kit. Around £12,000.'}
          style={{
            ...inputStyle(),
            background: T.editorBg,
            resize: 'vertical',
            minHeight: 180,
            lineHeight: 1.6,
          }}
        />

        <label htmlFor="project-budget" style={{
          fontFamily: UI, fontWeight: 600, fontSize: 13, color: T.textPrimary, display: 'block', margin: '18px 0 8px',
        }}>
          Rough budget <span style={{ fontFamily: BODY, fontWeight: 400, fontSize: 12.5, color: T.textTertiary }}>(optional, sharpens grant-size matching)</span>
        </label>
        <div style={{ position: 'relative', maxWidth: 220 }}>
          <span style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            fontFamily: UI, fontWeight: 600, fontSize: 14, color: T.textTertiary,
          }}>£</span>
          <input
            id="project-budget"
            value={budget}
            onChange={e => setBudget(e.target.value)}
            inputMode="numeric"
            placeholder="15,000"
            style={{ ...inputStyle(), paddingLeft: 26 }}
          />
        </div>

        {error && (
          <p role="alert" style={{ fontFamily: BODY, fontSize: 13, color: T.coral, margin: '14px 0 0' }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
          <button onClick={handleExtract} disabled={working} style={primaryBtn(working)}>
            {working ? 'Reading your description…' : 'Next'}
          </button>
          {working && (
            <span style={{ fontFamily: BODY, fontSize: 12.5, color: T.textTertiary }}>
              Sorting it into sections, usually under ten seconds.
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
