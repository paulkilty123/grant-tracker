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
import { hueMap, PROJECT_HUE_INK, PROJECT_HUE_NONE } from '@/lib/project-hues'
import { HowItWorksPanel } from '@/components/HowItWorksPanel'

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  active:   { bg: '#E3F0E4',    color: '#1B6B3D',       label: 'Active' },
  funded:   { bg: '#B4D496',    color: '#1D3C3E',       label: 'Funded' },
  archived: { bg: T.cream,      color: T.textSecondary, label: 'Archived' },
}

const HOW_STEPS = [
  { title: 'Describe it once', body: 'Type a few sentences or paste from an old document. We turn it into a structured project.' },
  { title: 'Fill the gaps', body: 'A completeness bar shows what each missing detail buys you. Fill as much or as little as you like.' },
  { title: 'See who fits', body: 'We match the project against the catalogue: your organisation covers eligibility, the project covers relevance.' },
  { title: 'Apply to each', body: 'Start an application for any match, with the project carried in as material.' },
]

function HowItWorks({ withCta }: { withCta?: boolean }) {
  return (
    <HowItWorksPanel
      steps={HOW_STEPS}
      cta={withCta ? { href: '/dashboard/projects/new', label: 'New project' } : undefined}
    />
  )
}

export default function ProjectsPage() {
  const router = useRouter()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  // Org name for the blocked screen, so it names the profile rather than the account.
  const [blockedOrgName, setBlockedOrgName] = useState<string | null>(null)
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
    document.title = 'Projects · Shoots'
    async function load() {
      const access = await fetch('/api/builder/access').then(r => r.json()).catch(() => ({ allowed: false }))
      setAllowed(!!access?.allowed)
      setBlockedOrgName(typeof access?.org_name === 'string' ? access.org_name : null)
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
        <div style={{ background: T.cream, borderRadius: 12, padding: '20px 24px' }}>
{/* Blocked-state copy, shared shape across Pipeline / Projects /
              Applications. Two jobs: name the ORGANISATION, because a
              multi-org owner needs to know it is this profile and not their
              account; and say the saved work is still there, because the
              screen otherwise reads as though it was deleted. It is also the
              screen a finished trial lands on, which is why "kept, not
              deleted" is the second sentence rather than a footnote.
              When checkout ships (item 6) this gains a subscribe link. */}
          <p style={{ fontFamily: BODY, fontSize: 14, color: T.textSecondary, margin: 0, lineHeight: 1.6 }}>
            Projects are not switched on for {blockedOrgName ?? 'this organisation'}.
          </p>
          <p style={{ fontFamily: BODY, fontSize: 14, color: T.textSecondary, margin: '10px 0 0', lineHeight: 1.6 }}>
            Anything you have already saved here is kept, not deleted. Get in touch
            and we will switch it back on.
          </p>
        </div>
      </div>
    )
  }

  // Sorted internally by created_at, so this page and the dashboard agree.
  const hues = hueMap(projects)

  return (
    /* No maxWidth and no marginInline. Find Funding and Pipeline sit in the
       layout's own container; this page was in a narrower indented one, which
       with a charcoal heading is most of why it read as a different product.

       The heading colour is set HERE rather than on T.textPrimary. That token
       is shared across every builder surface, so editing it would recolour all
       of them to fix three headings — the same trap as --warm-neutral on Find
       Funding: the token is fine, this usage was wrong. */
    <div>
      {/* Header. flexWrap so the count cluster and button drop BELOW the
          heading when the header runs short of room, rather than compressing
          the button. The counts grow — 2/0/0 sits comfortably beside it,
          12/3/2 on a narrow window would not. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, marginBottom: 6, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 280, flex: '1 1 420px' }}>
          <h1 style={{ fontFamily: UI, fontWeight: 600, fontSize: 31, color: '#1D3C3E', letterSpacing: '-0.025em', margin: 0 }}>
            Projects
          </h1>
          <p style={{ fontFamily: BODY, fontSize: 13.5, color: '#5F5E5A', margin: '5px 0 0', lineHeight: 1.55, maxWidth: 560 }}>
            A clear project is the foundation of every strong application. Describe what needs
            funding once, match it against the catalogue, and carry it into every application you build.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 26, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {loaded && projects.length > 0 && (() => {
            const counts = [
              { n: projects.filter(readyToMatch).length, label: 'Ready to match' },
              { n: projects.filter(pr => pr.status === 'funded').length, label: 'Funded' },
              { n: projects.filter(pr => pr.status === 'active' && !readyToMatch(pr)).length, label: 'In draft' },
            ]
            return counts.map(c => (
              <span key={c.label} style={{ textAlign: 'right' }}>
                <span style={{ fontFamily: UI, fontSize: 27, fontWeight: 600, color: '#1D3C3E', letterSpacing: '-0.03em', lineHeight: 1, display: 'block' }}>{c.n}</span>
                <span style={{ fontFamily: UI, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#5F5E5A', display: 'block', marginTop: 5 }}>{c.label}</span>
              </span>
            ))
          })()}
          <Link
            href="/dashboard/projects/new"
            style={{
              fontFamily: UI, fontWeight: 600, fontSize: 13.5, color: '#F6F1E7',
              background: '#1D3C3E', border: 'none', padding: '11px 20px',
              borderRadius: 999, textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
              gap: 7, whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            <Plus size={15} /> New project
          </Link>
        </div>
      </div>

      {/* The three stat cards that used to sit here are now the count cluster
          in the header above. Three cards to show 2, 0 and 0 was a lot of
          furniture for two projects, and two of the three were empty states
          dressed as statistics. */}

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
        {!loaded && [0, 1].map(i => (
          <div key={i} style={{
            background: T.white, border: `1px solid ${T.border}`, borderRadius: 12,
            padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ height: 14, width: `${50 - i * 10}%`, background: T.cream, borderRadius: 6, marginBottom: 8 }} />
              <div style={{ height: 11, width: '28%', background: T.cream, borderRadius: 6, opacity: 0.7 }} />
            </div>
            <div style={{ height: 5, width: 90, background: T.cream, borderRadius: 999 }} />
          </div>
        ))}
        {loaded && projects.length === 0 && <HowItWorks withCta />}

        {projects.map(p => {
          const status = STATUS_STYLE[p.status] ?? STATUS_STYLE.active
          const pct = projectCompleteness(p)
          return (
            <Link
              key={p.id}
              href={`/dashboard/projects/${p.id}`}
              onMouseEnter={() => setHoveredId(p.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                background: T.white, border: `1px solid ${T.border}`, borderRadius: 12,
                padding: '14px 18px', textDecoration: 'none',
                display: 'flex', alignItems: 'center', gap: 14,
              }}
            >
              {/* The project's own hue, from the shared fixed order, so this
                  page and the dashboard agree on which project is which. It
                  used to key off type_label, which meant every project tagged
                  "programme" came out the same terracotta. */}
              <span style={{
                width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                background: hues.get(p.id) ?? PROJECT_HUE_NONE, color: PROJECT_HUE_INK,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Lightbulb size={19} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginBottom: 3 }}>
                  <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 15.5, color: '#1D3C3E' }}>
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
                  <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 11.5, color: '#1D3C3E' }}>{pct}%</span>
                </div>
                {/* The TRACK is the fix that matters. It was T.cream on a white
                    card — 1.04:1, so the bar read as a floating stub rather
                    than as a proportion of anything. Same class of bug as the
                    sort pill on Find Funding: a warm neutral used as a fill on
                    a white ground. */}
                <div style={{ height: 6, background: 'rgba(29,60,62,0.15)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${pct}%`,
                    background: '#1D3C3E', borderRadius: 999, transition: 'width 200ms ease',
                  }} />
                </div>
              </div>
              {confirmDeleteId === p.id ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}
                  onClick={e => { e.preventDefault(); e.stopPropagation() }}>
                  <button
                    onClick={e => { e.preventDefault(); e.stopPropagation(); handleDelete(p.id) }}
                    style={{
                      fontFamily: UI, fontWeight: 600, fontSize: 12, color: '#fff',
                      background: T.coral, border: 'none', padding: '6px 14px', borderRadius: 999, cursor: 'pointer',
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
