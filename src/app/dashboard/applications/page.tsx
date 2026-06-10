'use client'

// Applications list — builder v0 home. Clean and quiet: your applications,
// their progress, and one clear way to start a new one.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FilePenLine, Plus, ChevronRight, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getOrganisationByOwner } from '@/lib/organisations'
import { T, UI, BODY } from '@/components/builder/tokens'
import type { ApplicationRecord } from '@/lib/builder/types'

const HOW_IT_WORKS_STEPS = [
  { title: 'Add the questions', body: 'Paste them from the funder’s form, or import a past application.' },
  { title: 'Get a guide', body: 'Each question gets a plan: what to cover, and which of your material fits.' },
  { title: 'Write your answers', body: 'In your own words. We flag gaps, word limits and missing evidence.' },
  { title: 'Check and submit', body: 'Score each answer, fix what’s flagged, then download and submit on the funder’s portal.' },
]

function HowItWorks({ withCta }: { withCta?: boolean }) {
  return (
    <div style={{ background: T.softGreen, border: `1px solid ${T.border}`, borderRadius: 12, padding: '20px 22px' }}>
      <p style={{ fontFamily: UI, fontWeight: 600, fontSize: 13, color: T.textSecondary, margin: '0 0 14px' }}>
        How it works
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        {HOW_IT_WORKS_STEPS.map((s, i) => (
          <div key={i} style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 10, padding: '13px 15px' }}>
            <span style={{
              fontFamily: UI, fontWeight: 700, fontSize: 11, color: T.sage, background: T.paleGreen,
              width: 22, height: 22, borderRadius: 999, display: 'inline-flex', alignItems: 'center',
              justifyContent: 'center', marginBottom: 8,
            }}>
              {i + 1}
            </span>
            <p style={{ fontFamily: UI, fontWeight: 600, fontSize: 13.5, color: T.textPrimary, margin: '0 0 4px' }}>{s.title}</p>
            <p style={{ fontFamily: BODY, fontSize: 12, color: T.textSecondary, margin: 0, lineHeight: 1.5 }}>{s.body}</p>
            {withCta && i === 0 && (
              <Link href="/dashboard/applications/new" style={{
                fontFamily: UI, fontWeight: 600, fontSize: 12.5, color: T.greenDeep, background: T.lime,
                padding: '7px 14px', borderRadius: 8, textDecoration: 'none', display: 'inline-flex',
                alignItems: 'center', gap: 5, marginTop: 10,
              }}>
                <Plus size={13} /> New application
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [howOpen, setHowOpen] = useState(false)

  async function deleteApplication(id: string) {
    setApps(prev => prev.filter(a => a.id !== id))
    setConfirmDeleteId(null)
    const supabase = createClient()
    await supabase.from('applications').delete().eq('id', id)
  }

  useEffect(() => {
    document.title = 'Applications · Grant Tracker'
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
    <div style={{ maxWidth: 860, marginInline: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 6 }}>
        <div>
          <h1 style={{ fontFamily: UI, fontWeight: 600, fontSize: 24, color: T.textPrimary, letterSpacing: '-0.01em', margin: 0 }}>
            Applications
          </h1>
          <p style={{ fontFamily: BODY, fontSize: 14, color: T.textSecondary, margin: '6px 0 0', lineHeight: 1.55, maxWidth: 540 }}>
            Turn a funder&apos;s question list into a guided draft, written in your words.
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
        {!loaded && [0, 1, 2].map(i => (
          <div key={i} style={{
            background: T.white, border: `1px solid ${T.border}`, borderRadius: 12,
            padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ height: 14, width: `${52 - i * 8}%`, background: T.cream, borderRadius: 6, marginBottom: 8 }} />
              <div style={{ height: 11, width: '30%', background: T.cream, borderRadius: 6, opacity: 0.7 }} />
            </div>
            <div style={{ height: 5, width: 90, background: T.cream, borderRadius: 999 }} />
          </div>
        ))}
        {loaded && apps.length === 0 && <HowItWorks withCta />}

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
                  {answered > 0
                    ? `${answered} of ${total} ${total === 1 ? 'question' : 'questions'} written`
                    : `${total} ${total === 1 ? 'question' : 'questions'}`}
                </span>
              </div>
              {total > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                  <div style={{ width: 90 }}>
                    <div style={{ height: 5, background: T.cream, borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${Math.round((answered / total) * 100)}%`,
                        background: T.lime, borderRadius: 999, transition: 'width 200ms ease',
                      }} />
                    </div>
                  </div>
                  <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 11, color: T.textTertiary, width: 32 }}>
                    {Math.round((answered / total) * 100)}%
                  </span>
                </div>
              )}
              {confirmDeleteId === app.id ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}
                  onClick={e => { e.preventDefault(); e.stopPropagation() }}>
                  <button
                    onClick={e => { e.preventDefault(); e.stopPropagation(); deleteApplication(app.id) }}
                    style={{
                      fontFamily: UI, fontWeight: 600, fontSize: 12, color: '#fff',
                      background: T.coral, border: 'none', padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                  <button
                    onClick={e => { e.preventDefault(); e.stopPropagation(); setConfirmDeleteId(null) }}
                    style={{
                      fontFamily: UI, fontWeight: 500, fontSize: 12, color: T.textSecondary,
                      background: 'transparent', border: 'none', padding: '5px 6px', cursor: 'pointer',
                    }}
                  >
                    Keep
                  </button>
                </span>
              ) : (
                <button
                  onClick={e => { e.preventDefault(); e.stopPropagation(); setConfirmDeleteId(app.id) }}
                  aria-label={`Delete ${app.grant_name || 'application'}`}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: T.textTertiary, padding: 6, borderRadius: 6, flexShrink: 0,
                  }}
                >
                  <Trash2 size={15} />
                </button>
              )}
              <ChevronRight size={16} color={T.textTertiary} style={{ flexShrink: 0 }} />
            </Link>
          )
        })}

        {/* How it works: full strip for 1-2 applications, collapsed link for 3+ */}
        {loaded && apps.length > 0 && apps.length <= 2 && <HowItWorks />}
        {loaded && apps.length >= 3 && (
          howOpen
            ? <HowItWorks />
            : (
              <button onClick={() => setHowOpen(true)} style={{
                fontFamily: UI, fontWeight: 600, fontSize: 12.5, color: T.sage,
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '6px 0', textAlign: 'left', alignSelf: 'flex-start',
              }}>
                How it works
              </button>
            )
        )}
      </div>
    </div>
  )
}
