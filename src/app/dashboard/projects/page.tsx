'use client'

// Projects list — project-first phase 2. A project is the user's real
// starting object: describe it once, get matched with funders, then spin up
// an application per funder you choose.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, ChevronRight, Trash2, Lightbulb, HelpCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getOrganisationByOwner } from '@/lib/organisations'
import { T, UI, BODY } from '@/components/builder/tokens'
import { projectCompleteness, readyToMatch, type Project } from '@/lib/builder/projects'
import { brand } from '@/config/brand'

const TYPE_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  project:   { bg: T.paleGreen,  color: T.stateSuccess,       label: 'Project' },
  campaign:  { bg: T.amberBg,    color: T.amberText,  label: 'Campaign' },
  programme: { bg: 'var(--state-error-pale)',    color: 'var(--state-error)',    label: 'Programme' },
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  active:   { bg: T.paleGreen2, color: T.stateSuccess,          label: 'Active' },
  funded:   { bg: 'var(--sage-pale)',    color: T.greenDeep,     label: 'Funded' },
  archived: { bg: T.surfaceSunken,      color: T.textSecondary, label: 'Archived' },
}

const HOW_STEPS = [
  { title: 'Describe it once', body: 'Type a few sentences or paste from an old document. We turn it into a structured project.' },
  { title: 'Fill the gaps', body: 'A completeness bar shows what each missing detail buys you. Fill as much or as little as you like.' },
  { title: 'See who fits', body: 'We match the project against the catalogue: your organisation covers eligibility, the project covers relevance.' },
  { title: 'Apply to each', body: 'Start an application for any match, with the project carried in as material.' },
]

function HowItWorks({ withCta }: { withCta?: boolean }) {
  return (
    <div style={{ background: T.white, border: `1px solid ${T.borderHairline}`, borderRadius: 12, padding: '22px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <HelpCircle size={18} color={T.stateSuccess} />
        <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 16, color: T.textPrimary }}>How it works</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        {HOW_STEPS.map((s, i) => (
          <div key={i} style={{ flex: '1 1 150px', minWidth: 150 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              <span style={{
                fontFamily: UI, fontWeight: 700, fontSize: 13, color: 'var(--state-success-pale)', background: T.greenDeep,
                width: 30, height: 30, borderRadius: 999, display: 'inline-flex', alignItems: 'center',
                justifyContent: 'center', flexShrink: 0,
              }}>
                {i + 1}
              </span>
              {i < HOW_STEPS.length - 1 && (
                <span style={{ flex: 1, height: 2, background: 'rgba(23,52,4,0.12)', marginLeft: 10, borderRadius: 2 }} />
              )}
            </div>
            <p style={{ fontFamily: UI, fontWeight: 600, fontSize: 14.5, color: T.textPrimary, margin: '0 0 4px' }}>{s.title}</p>
            <p style={{ fontFamily: BODY, fontSize: 12.5, color: T.textSecondary, margin: 0, lineHeight: 1.5 }}>{s.body}</p>
          </div>
        ))}
      </div>
      {withCta && (
        <Link href="/dashboard/projects/new" style={{
          fontFamily: UI, fontWeight: 600, fontSize: 13, color: T.greenDeep, background: T.lime,
          padding: '9px 16px', borderRadius: 8, textDecoration: 'none', display: 'inline-flex',
          alignItems: 'center', gap: 6, marginTop: 18,
        }}>
          <Plus size={14} /> New project
        </Link>
      )}
    </div>
  )
}

export default function ProjectsPage() {
  const router = useRouter()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [loaded, setLoaded] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  async function handleDelete(id: string) {
    setProjects(prev => prev.filter(p => p.id !== id))
    setConfirmDeleteId(null)
    const supabase = createClient()
    await supabase.from('projects').delete().eq('id', id)
  }

  useEffect(() => {
    document.title = `Projects · ${brand.name}`
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
          .from('projects')
          .select('*')
          .eq('org_id', org.id)
          .order('updated_at', { ascending: false })
        setProjects((data ?? []) as Project[])
      }
      setLoaded(true)
    }
    load()
  }, [router])

  if (allowed === false) {
    return (
      <div style={{ maxWidth: 660 }}>
        <h1 style={{ fontFamily: UI, fontWeight: 600, fontSize: 24, color: T.textPrimary, letterSpacing: '-0.01em', marginBottom: 8 }}>
          Projects
        </h1>
        <div style={{ background: T.surfaceSunken, borderRadius: 12, padding: '20px 24px' }}>
          <p style={{ fontFamily: BODY, fontSize: 14, color: T.textSecondary, margin: 0, lineHeight: 1.6 }}>
            Projects are currently available to founding cohort members while we shape them
            together. They will open more widely soon.
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
            Projects
          </h1>
          <p style={{ fontFamily: BODY, fontSize: 14, color: T.textSecondary, margin: '6px 0 0', lineHeight: 1.55, maxWidth: 540 }}>
            A clear project is the foundation of every strong application. Describe what needs
            funding once, match it against the catalogue, and carry it into every application you build.
          </p>
        </div>
        <Link
          href="/dashboard/projects/new"
          style={{
            fontFamily: UI, fontWeight: 600, fontSize: 14, color: T.textPrimary,
            background: T.white, border: `1px solid ${T.textPrimary}`, padding: '9px 18px',
            borderRadius: 8, textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
            gap: 7, whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          <Plus size={15} /> New project
        </Link>
      </div>

      {/* Status strip — lead with state */}
      {loaded && projects.length > 0 && (() => {
        const ready = projects.filter(readyToMatch).length
        const funded = projects.filter(p => p.status === 'funded').length
        const inDraft = projects.filter(p => p.status === 'active' && !readyToMatch(p)).length
        const tiles = [
          { n: ready, label: 'Ready to match', accent: T.stateSuccess },
          { n: funded, label: 'Funded', accent: T.greenDeep },
          { n: inDraft, label: 'In draft', accent: T.textTertiary },
        ]
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 18 }}>
            {tiles.map(t => (
              <div key={t.label} style={{ background: T.white, border: `1px solid ${T.borderHairline}`, borderRadius: 10, padding: '12px 16px' }}>
                <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 22, color: t.accent, display: 'block', lineHeight: 1.1 }}>{t.n}</span>
                <span style={{ fontFamily: BODY, fontSize: 12.5, color: T.textSecondary }}>{t.label}</span>
              </div>
            ))}
          </div>
        )
      })()}

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
        {!loaded && [0, 1].map(i => (
          <div key={i} style={{
            background: T.white, border: `1px solid ${T.borderHairline}`, borderRadius: 12,
            padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ height: 14, width: `${50 - i * 10}%`, background: T.surfaceSunken, borderRadius: 6, marginBottom: 8 }} />
              <div style={{ height: 11, width: '28%', background: T.surfaceSunken, borderRadius: 6, opacity: 0.7 }} />
            </div>
            <div style={{ height: 5, width: 90, background: T.surfaceSunken, borderRadius: 999 }} />
          </div>
        ))}
        {loaded && projects.length === 0 && <HowItWorks withCta />}

        {projects.map(p => {
          const type = TYPE_STYLE[p.type_label] ?? TYPE_STYLE.project
          const status = STATUS_STYLE[p.status] ?? STATUS_STYLE.active
          const pct = projectCompleteness(p)
          return (
            <Link
              key={p.id}
              href={`/dashboard/projects/${p.id}`}
              onMouseEnter={() => setHoveredId(p.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                background: T.white, border: `1px solid ${T.borderHairline}`, borderRadius: 12,
                padding: '14px 18px', textDecoration: 'none',
                display: 'flex', alignItems: 'center', gap: 14,
              }}
            >
              <span style={{
                width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                background: type.bg, color: type.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Lightbulb size={19} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginBottom: 3 }}>
                  <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 15.5, color: T.textPrimary }}>
                    {p.name}
                  </span>
                  {/* No type badge on list rows — it's AI-guessed and redundant
                      inside "Projects". type_label stays in data + detail page. */}
                  {p.status !== 'active' && (
                    <span style={{
                      fontFamily: UI, fontWeight: 600, fontSize: 11, letterSpacing: '0.03em',
                      background: status.bg, color: status.color, padding: '3px 10px', borderRadius: 999,
                    }}>
                      {status.label}
                    </span>
                  )}
                </div>
                <span style={{ fontFamily: BODY, fontSize: 13, color: T.textSecondary }}>
                  {readyToMatch(p) ? 'Ready to match' : 'Needs a few more details to match'}
                  {p.budget_amount ? ` · £${p.budget_amount.toLocaleString('en-GB')}` : ''}
                  {p.created_at ? ` · ${new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
                </span>
              </div>
              <div style={{ width: 132, flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontFamily: BODY, fontSize: 11.5, color: T.textSecondary }}>Described</span>
                  <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 11.5, color: T.stateSuccess }}>{pct}%</span>
                </div>
                <div style={{ height: 6, background: T.surfaceSunken, borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${pct}%`,
                    background: T.lime, borderRadius: 999, transition: 'width 200ms ease',
                  }} />
                </div>
              </div>
              {confirmDeleteId === p.id ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}
                  onClick={e => { e.preventDefault(); e.stopPropagation() }}>
                  <button
                    onClick={e => { e.preventDefault(); e.stopPropagation(); handleDelete(p.id) }}
                    style={{
                      fontFamily: UI, fontWeight: 600, fontSize: 12, color: 'var(--surface-card)',
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
                  onClick={e => { e.preventDefault(); e.stopPropagation(); setConfirmDeleteId(p.id) }}
                  aria-label={`Delete ${p.name}`}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: T.textTertiary, padding: 6, borderRadius: 6, flexShrink: 0,
                    opacity: hoveredId === p.id ? 1 : 0, transition: 'opacity 150ms ease',
                  }}
                >
                  <Trash2 size={15} />
                </button>
              )}
              <ChevronRight size={16} color={T.textTertiary} style={{ flexShrink: 0 }} />
            </Link>
          )
        })}

        {/* Dashed describe-new affordance under the list */}
        {loaded && projects.length > 0 && (
          <Link href="/dashboard/projects/new" style={{
            border: `1px dashed ${T.borderStrong}`, borderRadius: 12, padding: '14px 18px',
            textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, color: T.textTertiary, fontFamily: UI, fontWeight: 600, fontSize: 13.5,
          }}>
            <Plus size={15} /> Describe a new project
          </Link>
        )}

        {loaded && projects.length > 0 && projects.length <= 2 && <HowItWorks />}
      </div>
    </div>
  )
}
