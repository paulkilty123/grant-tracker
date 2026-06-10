'use client'

// Applications list — builder v0 home. Clean and quiet: your applications,
// their progress, and one clear way to start a new one.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FilePenLine, Plus, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getOrganisationByOwner } from '@/lib/organisations'
import { T, UI, BODY } from '@/components/builder/tokens'
import type { ApplicationRecord } from '@/lib/builder/types'

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  draft:       { bg: T.cream,      color: T.textSecondary, label: 'Draft' },
  in_progress: { bg: T.paleGreen2, color: T.sage,          label: 'In progress' },
  complete:    { bg: '#C0DD97',    color: T.greenDeep,     label: 'Complete' },
}

export default function ApplicationsPage() {
  const router = useRouter()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [apps, setApps] = useState<ApplicationRecord[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    async function load() {
      const access = await fetch('/api/builder/access').then(r => r.json()).catch(() => ({ allowed: false }))
      setAllowed(!!access?.allowed)
      if (!access?.allowed) { setLoaded(true); return }
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      const org = await getOrganisationByOwner(user.id)
      if (org) {
        const { data } = await supabase
          .from('applications')
          .select('*')
          .eq('org_id', org.id)
          .order('updated_at', { ascending: false })
        setApps((data ?? []) as ApplicationRecord[])
      }
      setLoaded(true)
    }
    load()
  }, [router])

  if (allowed === false) {
    return (
      <div style={{ maxWidth: 660 }}>
        <h1 style={{ fontFamily: UI, fontWeight: 600, fontSize: 24, color: T.textPrimary, letterSpacing: '-0.01em', marginBottom: 8 }}>
          Applications
        </h1>
        <div style={{ background: T.cream, borderRadius: 12, padding: '20px 24px' }}>
          <p style={{ fontFamily: BODY, fontSize: 14, color: T.textSecondary, margin: 0, lineHeight: 1.6 }}>
            The application builder is currently available to founding cohort members while we
            shape it together. It will open more widely soon.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 860 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 6 }}>
        <div>
          <h1 style={{ fontFamily: UI, fontWeight: 600, fontSize: 24, color: T.textPrimary, letterSpacing: '-0.01em', margin: 0 }}>
            Applications
          </h1>
          <p style={{ fontFamily: BODY, fontSize: 14, color: T.textSecondary, margin: '6px 0 0', lineHeight: 1.55, maxWidth: 540 }}>
            Paste a funder&apos;s questions and get a structured scaffold: what a strong answer covers,
            your own content mapped in, and the gaps flagged. You write the answers in your voice.
          </p>
        </div>
        <Link
          href="/dashboard/applications/new"
          style={{
            fontFamily: UI, fontWeight: 600, fontSize: 14, color: T.textPrimary,
            background: T.white, border: `1px solid ${T.textPrimary}`, padding: '9px 18px',
            borderRadius: 8, textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
            gap: 7, whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          <Plus size={15} /> New application
        </Link>
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
        {loaded && apps.length === 0 && (
          <div style={{
            background: 'linear-gradient(135deg, #FDFCF7 0%, #F8F5EC 100%)',
            border: `1px solid ${T.border}`, borderRadius: 12, padding: '36px 28px', textAlign: 'center',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, background: T.paleGreen, color: T.greenMid,
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px',
            }}>
              <FilePenLine size={20} />
            </div>
            <p style={{ fontFamily: UI, fontWeight: 600, fontSize: 16, color: T.textPrimary, margin: '0 0 6px' }}>
              Start your first application
            </p>
            <p style={{ fontFamily: BODY, fontSize: 13.5, color: T.textSecondary, margin: '0 auto 18px', lineHeight: 1.6, maxWidth: 420 }}>
              The hardest part of any application is the first 10%. Paste the funder&apos;s questions
              and the builder gives you the structure to write into.
            </p>
            <Link
              href="/dashboard/applications/new"
              style={{
                fontFamily: UI, fontWeight: 600, fontSize: 14, color: T.greenDeep,
                background: T.lime, padding: '10px 22px', borderRadius: 8, textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: 7,
              }}
            >
              <Plus size={15} /> New application
            </Link>
          </div>
        )}

        {apps.map(app => {
          const status = STATUS_STYLE[app.status] ?? STATUS_STYLE.draft
          const total = app.questions?.length ?? 0
          const answered = (app.questions ?? []).filter(q => q.user_answer?.trim()).length
          return (
            <Link
              key={app.id}
              href={`/dashboard/applications/${app.id}`}
              style={{
                background: T.white, border: `1px solid ${T.border}`, borderRadius: 12,
                padding: '16px 20px', textDecoration: 'none',
                display: 'flex', alignItems: 'center', gap: 16,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginBottom: 3 }}>
                  <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 15.5, color: T.textPrimary }}>
                    {app.grant_name || app.funder_name || 'Untitled application'}
                  </span>
                  <span style={{
                    fontFamily: UI, fontWeight: 600, fontSize: 11, letterSpacing: '0.03em',
                    background: status.bg, color: status.color, padding: '3px 10px', borderRadius: 999,
                  }}>
                    {status.label}
                  </span>
                </div>
                <span style={{ fontFamily: BODY, fontSize: 13, color: T.textSecondary }}>
                  {app.funder_name && app.grant_name ? `${app.funder_name} · ` : ''}
                  {total} {total === 1 ? 'question' : 'questions'}
                  {answered > 0 ? ` · ${answered} answered` : ''}
                </span>
              </div>
              {total > 0 && (
                <div style={{ width: 90, flexShrink: 0 }}>
                  <div style={{ height: 5, background: T.cream, borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${Math.round((answered / total) * 100)}%`,
                      background: T.lime, borderRadius: 999, transition: 'width 200ms ease',
                    }} />
                  </div>
                </div>
              )}
              <ChevronRight size={16} color={T.textTertiary} style={{ flexShrink: 0 }} />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
