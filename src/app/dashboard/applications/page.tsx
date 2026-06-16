'use client'

// Applications list — builder v0 home. Clean and quiet: your applications,
// their progress, and one clear way to start a new one.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FilePenLine, Plus, ChevronRight, ChevronDown, Trash2, Lightbulb, HelpCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getOrganisationByOwner } from '@/lib/organisations'
import { T, UI, BODY } from '@/components/builder/tokens'
import type { ApplicationRecord } from '@/lib/builder/types'

// The Apply-tier ethos as a few plain principles. Leads with the funder's-eye
// reframe (the highest-value move for first-time applicants), closes on voice.
const STRONG_APPLICATION_PRINCIPLES = [
  { t: 'See it the funder’s way', b: 'A funder is asking "does this fit us, and can we trust them?" before they admire your writing. Answer the question they are actually asking.' },
  { t: 'Lead with the need, backed by evidence', b: 'Show the problem and how you know it is real, not just that you care about it.' },
  { t: 'Show outcomes you can measure', b: 'What will change, and how you will know. Funders fund results, not activity.' },
  { t: 'Be specific and honest', b: 'Concrete numbers and plain claims beat polish. A gap you name reads better than one they find.' },
  { t: 'Your voice, not ours', b: 'The application should sound like you. Grant Tracker drafts from your own material and sharpens it; the final words and the story stay yours.' },
]

const HOW_IT_WORKS_STEPS = [
  { title: 'Add the questions', body: 'Paste them from the funder’s form, or import a past application.' },
  { title: 'Get a guide', body: 'Each question gets a plan: what to cover, and which of your material fits.' },
  { title: 'Write your answers', body: 'In your own words. We flag gaps, word limits and missing evidence.' },
  { title: 'Check and submit', body: 'Score each answer, fix what’s flagged, then download and submit on the funder’s portal.' },
]

function HowItWorks({ withCta }: { withCta?: boolean }) {
  return (
    <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: '22px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <HelpCircle size={18} color={T.sage} />
        <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 16, color: T.textPrimary }}>How it works</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        {HOW_IT_WORKS_STEPS.map((s, i) => (
          <div key={i} style={{ flex: '1 1 150px', minWidth: 150 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              <span style={{
                fontFamily: UI, fontWeight: 700, fontSize: 13, color: '#F1F7E4', background: T.greenDeep,
                width: 30, height: 30, borderRadius: 999, display: 'inline-flex', alignItems: 'center',
                justifyContent: 'center', flexShrink: 0,
              }}>
                {i + 1}
              </span>
              {i < HOW_IT_WORKS_STEPS.length - 1 && (
                <span style={{ flex: 1, height: 2, background: 'rgba(23,52,4,0.12)', marginLeft: 10, borderRadius: 2 }} />
              )}
            </div>
            <p style={{ fontFamily: UI, fontWeight: 600, fontSize: 14.5, color: T.textPrimary, margin: '0 0 4px' }}>{s.title}</p>
            <p style={{ fontFamily: BODY, fontSize: 12.5, color: T.textSecondary, margin: 0, lineHeight: 1.5 }}>{s.body}</p>
          </div>
        ))}
      </div>
      {withCta && (
        <Link href="/dashboard/applications/new" style={{
          fontFamily: UI, fontWeight: 600, fontSize: 13, color: T.greenDeep, background: T.lime,
          padding: '9px 16px', borderRadius: 8, textDecoration: 'none', display: 'inline-flex',
          alignItems: 'center', gap: 6, marginTop: 18,
        }}>
          <Plus size={14} /> New application
        </Link>
      )}
    </div>
  )
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  draft:       { bg: T.cream,      color: T.textSecondary, label: 'Draft' },
  in_progress: { bg: T.paleGreen2, color: T.sage,          label: 'In progress' },
  complete:    { bg: '#C0DD97',    color: T.greenDeep,     label: 'Complete' },
}

interface PipeItem {
  id: string
  grant_name: string
  funder_name: string | null
  deadline: string | null
  stage: string
}

// Funder/grant monogram for the row template (icon → title → meta → progress).
function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export default function ApplicationsPage() {
  const router = useRouter()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [apps, setApps] = useState<ApplicationRecord[]>([])
  const [loaded, setLoaded] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [howOpen, setHowOpen] = useState(false)
  const [principlesOpen, setPrinciplesOpen] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [deadlineSoon, setDeadlineSoon] = useState(0)
  const [readyToStart, setReadyToStart] = useState<PipeItem[]>([])
  const [projectNames, setProjectNames] = useState<Record<string, string>>({})

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
        const rows = (data ?? []) as ApplicationRecord[]
        setApps(rows)

        // Project names for the "Part of: …" differentiator on rows.
        const { data: projs } = await supabase.from('projects').select('id, name').eq('org_id', org.id)
        const pmap: Record<string, string> = {}
        for (const pr of (projs ?? []) as { id: string; name: string }[]) pmap[pr.id] = pr.name
        setProjectNames(pmap)

        // "Deadline soon" tile: deadlines live on the linked opportunity, not
        // the application, so join through opportunity_id (UUIDs only).
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        const oppIds = Array.from(new Set(
          rows.map(r => (r as { opportunity_id?: string | null }).opportunity_id)
            .filter((id): id is string => !!id && UUID_RE.test(id)),
        ))
        if (oppIds.length > 0) {
          const today = new Date().toISOString().split('T')[0]
          const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
          const { data: gr } = await supabase
            .from('grants_with_funder')
            .select('deadline')
            .in('id', oppIds)
            .gte('deadline', today)
            .lte('deadline', in30)
          setDeadlineSoon((gr ?? []).length)
        }

        // "Ready to start": pipeline items at identified/applying that don't
        // yet have an application (dedup via applications.pipeline_item_id).
        const linkedPipeIds = new Set(
          rows.map(r => (r as { pipeline_item_id?: string | null }).pipeline_item_id).filter(Boolean),
        )
        const { data: pipe } = await supabase
          .from('pipeline_items')
          .select('id, grant_name, funder_name, deadline, stage')
          .eq('org_id', org.id)
          .in('stage', ['identified', 'applying'])
          .order('updated_at', { ascending: false })
        setReadyToStart(((pipe ?? []) as PipeItem[]).filter(p => !linkedPipeIds.has(p.id)))
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
          <p style={{ fontFamily: BODY, fontSize: 14, color: T.textSecondary, margin: '6px 0 0', lineHeight: 1.55, maxWidth: 580 }}>
            Grant Tracker drafts each answer from your own material and recommends how to make it
            stronger, so you can write a strong application in your own words, faster.
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

      {/* Ethos: what makes a strong application (collapsible, light) */}
      <div style={{ marginTop: 14 }}>
        <button
          onClick={() => setPrinciplesOpen(o => !o)}
          aria-expanded={principlesOpen}
          style={{
            fontFamily: UI, fontWeight: 600, fontSize: 13, color: T.sage, background: 'transparent',
            border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <Lightbulb size={14} /> What makes a strong application
          <ChevronDown size={14} style={{ transform: principlesOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease' }} />
        </button>
        {principlesOpen && (
          <div style={{
            background: T.softGreen, border: `1px solid ${T.border}`, borderRadius: 12,
            padding: '18px 20px', marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            {STRONG_APPLICATION_PRINCIPLES.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 11 }}>
                <span style={{
                  fontFamily: UI, fontWeight: 700, fontSize: 11, color: T.sage, background: T.paleGreen,
                  width: 22, height: 22, borderRadius: 999, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', flexShrink: 0, marginTop: 1,
                }}>
                  {i + 1}
                </span>
                <div>
                  <p style={{ fontFamily: UI, fontWeight: 600, fontSize: 13.5, color: T.textPrimary, margin: '0 0 2px' }}>{p.t}</p>
                  <p style={{ fontFamily: BODY, fontSize: 13, color: T.textSecondary, margin: 0, lineHeight: 1.55 }}>{p.b}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status strip — lead with state (real application states only) */}
      {loaded && apps.length > 0 && (() => {
        const inProgress = apps.filter(a => a.status === 'in_progress' || a.status === 'draft').length
        const complete = apps.filter(a => a.status === 'complete').length
        const tiles = [
          { n: inProgress, label: 'In progress', accent: T.sage },
          { n: complete, label: 'Complete', accent: T.greenDeep },
          { n: deadlineSoon, label: 'Deadline soon', accent: deadlineSoon > 0 ? T.coral : T.textTertiary },
        ]
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 18 }}>
            {tiles.map(t => (
              <div key={t.label} style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 16px' }}>
                <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 22, color: t.accent, display: 'block', lineHeight: 1.1 }}>{t.n}</span>
                <span style={{ fontFamily: BODY, fontSize: 12.5, color: T.textSecondary }}>{t.label}</span>
              </div>
            ))}
          </div>
        )
      })()}

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
        {loaded && apps.length === 0 && readyToStart.length === 0 && <HowItWorks withCta />}

        {apps.map(app => {
          const status = STATUS_STYLE[app.status] ?? STATUS_STYLE.draft
          const total = app.questions?.length ?? 0
          const answered = (app.questions ?? []).filter(q => q.user_answer?.trim()).length
          return (
            <Link
              key={app.id}
              href={`/dashboard/applications/${app.id}`}
              onMouseEnter={() => setHoveredId(app.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                background: T.white, border: `1px solid ${T.border}`, borderRadius: 12,
                padding: '14px 18px', textDecoration: 'none',
                display: 'flex', alignItems: 'center', gap: 14,
              }}
            >
              <span style={{
                width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                background: T.paleGreen, color: T.sage, fontFamily: UI, fontWeight: 600, fontSize: 14.5,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {monogram(app.funder_name || app.grant_name || '?')}
              </span>
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
                  {app.funder_name && app.grant_name
                    ? app.funder_name
                    : `${total} ${total === 1 ? 'question' : 'questions'}`}
                  {(() => { const pid = (app as { project_id?: string | null }).project_id; return pid && projectNames[pid] ? ` · Part of ${projectNames[pid]}` : '' })()}
                  {(app as { created_at?: string }).created_at
                    ? ` · ${new Date((app as { created_at: string }).created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                    : ''}
                </span>
              </div>
              {total > 0 && (
                <div style={{ width: 132, flexShrink: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontFamily: BODY, fontSize: 11.5, color: T.textSecondary }}>
                      {answered} of {total} written
                    </span>
                    <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 11.5, color: T.sage }}>
                      {Math.round((answered / total) * 100)}%
                    </span>
                  </div>
                  <div style={{ height: 6, background: T.cream, borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${Math.round((answered / total) * 100)}%`,
                      background: T.lime, borderRadius: 999, transition: 'width 200ms ease',
                    }} />
                  </div>
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
                    opacity: hoveredId === app.id ? 1 : 0, transition: 'opacity 150ms ease',
                  }}
                >
                  <Trash2 size={15} />
                </button>
              )}
              <ChevronRight size={16} color={T.textTertiary} style={{ flexShrink: 0 }} />
            </Link>
          )
        })}

        {/* Dashed start-new affordance under the list */}
        {loaded && apps.length > 0 && (
          <Link href="/dashboard/applications/new" style={{
            border: `1px dashed ${T.borderStrong}`, borderRadius: 12, padding: '14px 18px',
            textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, color: T.textTertiary, fontFamily: UI, fontWeight: 600, fontSize: 13.5,
          }}>
            <Plus size={15} /> Start a new application
          </Link>
        )}

        {/* Ready to start — pipeline items (identified/applying) without an
            application yet. Bridges pipeline intent -> drafting. */}
        {loaded && readyToStart.length > 0 && (
          <div style={{ marginTop: apps.length > 0 ? 14 : 0 }}>
            <h2 style={{ fontFamily: UI, fontWeight: 600, fontSize: 16, color: T.textPrimary, margin: '0 0 3px' }}>
              Ready to start
            </h2>
            <p style={{ fontFamily: BODY, fontSize: 12.5, color: T.textSecondary, margin: '0 0 10px', lineHeight: 1.5 }}>
              In your pipeline, not drafted yet. Start an application when you&apos;re ready.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {readyToStart.map(p => {
                const stageLabel = p.stage === 'applying' ? 'Applying' : 'Identified'
                const deadline = p.deadline
                  ? new Date(p.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                  : null
                const overdue = !!p.deadline && p.deadline < new Date().toISOString().split('T')[0]
                return (
                  <div key={p.id} style={{
                    background: T.white, border: `1px solid ${T.border}`, borderRadius: 12,
                    padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 14,
                  }}>
                    <span style={{
                      width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                      background: T.cream, color: T.textSecondary, fontFamily: UI, fontWeight: 600, fontSize: 13,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {monogram(p.funder_name || p.grant_name || '?')}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                        <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 14.5, color: T.textPrimary }}>
                          {p.grant_name || p.funder_name || 'Untitled'}
                        </span>
                        <span style={{
                          fontFamily: UI, fontWeight: 600, fontSize: 10.5, letterSpacing: '0.03em',
                          background: T.cream, color: T.textSecondary, padding: '2px 9px', borderRadius: 999,
                        }}>
                          {stageLabel}
                        </span>
                      </div>
                      <span style={{ fontFamily: BODY, fontSize: 12.5, color: T.textSecondary }}>
                        {p.funder_name && p.grant_name ? p.funder_name : 'From your pipeline'}
                        {deadline && !overdue && ` · Deadline ${deadline}`}
                        {deadline && overdue && (
                          <span style={{ fontFamily: UI, fontWeight: 600, color: T.coral }}> · Overdue {deadline}</span>
                        )}
                      </span>
                    </div>
                    <Link
                      href={`/dashboard/applications/new?pipeline=${p.id}`}
                      style={{
                        fontFamily: UI, fontWeight: 600, fontSize: 12.5, color: T.greenDeep, background: T.lime,
                        padding: '8px 14px', borderRadius: 8, textDecoration: 'none', whiteSpace: 'nowrap',
                        flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      <FilePenLine size={13} /> Start an application
                    </Link>
                  </div>
                )
              })}
            </div>
          </div>
        )}

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
