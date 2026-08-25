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
import { hueMap, PROJECT_HUE_INK, PROJECT_HUE_NONE } from '@/lib/project-hues'
import { HowItWorksPanel, DisclosureControl } from '@/components/HowItWorksPanel'

// The Apply-tier ethos as a few plain principles. Leads with the funder's-eye
// reframe (the highest-value move for first-time applicants), closes on voice.
const STRONG_APPLICATION_PRINCIPLES = [
  { t: 'See it the funder’s way', b: 'A funder is asking "does this fit us, and can we trust them?" before they admire your writing. Answer the question they are actually asking.' },
  { t: 'Lead with the need, backed by evidence', b: 'Show the problem and how you know it is real, not just that you care about it.' },
  { t: 'Show outcomes you can measure', b: 'What will change, and how you will know. Funders fund results, not activity.' },
  { t: 'Be specific and honest', b: 'Concrete numbers and plain claims beat polish. A gap you name reads better than one they find.' },
  { t: 'Your voice, not ours', b: 'The application should sound like you. Shoots drafts from your own material and sharpens it; the final words and the story stay yours.' },
]

const HOW_IT_WORKS_STEPS = [
  { title: 'Add the questions', body: 'Paste them from the funder’s form, or import a past application.' },
  { title: 'Get a guide', body: 'Each question gets a plan: what to cover, and which of your material fits.' },
  { title: 'Write your answers', body: 'In your own words. We flag gaps, word limits and missing evidence.' },
  { title: 'Check and submit', body: 'Score each answer, fix what’s flagged, then download and submit on the funder’s portal.' },
]

function HowItWorks({ withCta }: { withCta?: boolean }) {
  return (
    <HowItWorksPanel
      steps={HOW_IT_WORKS_STEPS}
      cta={withCta ? { href: '/dashboard/applications/new', label: 'New application' } : undefined}
    />
  )
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  // "In progress" and "Complete" are states of the application, so they take
  // the green that means "this is true". Draft is the absence of one and stays
  // neutral — as does the "Identified" chip on a Ready-to-start row, which is a
  // pipeline stage rather than a state of anything drafted.
  draft:       { bg: '#F1EDE3',    color: '#5F5E5A',       label: 'Draft' },
  in_progress: { bg: '#E3F0E4',    color: '#1B6B3D',       label: 'In progress' },
  complete:    { bg: '#B4D496',    color: '#1D3C3E',       label: 'Complete' },
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
  // Org name for the blocked screen, so it names the profile rather than the account.
  const [blockedOrgName, setBlockedOrgName] = useState<string | null>(null)
  const [apps, setApps] = useState<ApplicationRecord[]>([])
  const [loaded, setLoaded] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [howOpen, setHowOpen] = useState(false)
  const [principlesOpen, setPrinciplesOpen] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [deadlineSoon, setDeadlineSoon] = useState(0)
  const [readyToStart, setReadyToStart] = useState<PipeItem[]>([])
  const [projectNames, setProjectNames] = useState<Record<string, string>>({})
  /**
   * Projects in creation order, newest first, for the assign control.
   *
   * The picker on the new-application form only sets project_id going forward.
   * Without this, every application that already exists stays unattributed for
   * ever and the colour arrives for nobody until they happen to start a new
   * one. This is the half that changes something today.
   */
  const [projectList, setProjectList] = useState<{ id: string; name: string; created_at?: string | null }[]>([])
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [assignError, setAssignError] = useState<string | null>(null)

  /**
   * Assign or clear a project. Optimistic, with a revert on failure.
   *
   * Goes through the route rather than a direct update: the UPDATE policy on
   * applications only checks the application's org, so a client-side write
   * could put a foreign project id in the column. The route checks both ends.
   *
   * NO BACKFILL, and none inferred. There is genuinely no project recorded on
   * these rows, and guessing one from the funder name is what produced the
   * wrong claim that three of them shared a project. They share a funder.
   */
  async function assignProject(applicationId: string, projectId: string | null) {
    const before = apps
    setApps(prev => prev.map(a => (a.id === applicationId ? { ...a, project_id: projectId } : a)))
    setAssigningId(null)
    setAssignError(null)
    const res = await fetch('/api/builder/applications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application_id: applicationId, project_id: projectId }),
    }).catch(() => null)
    if (!res || !res.ok) {
      setApps(before)
      setAssignError('That did not save. Try again in a moment.')
    }
  }

  async function deleteApplication(id: string) {
    setApps(prev => prev.filter(a => a.id !== id))
    setConfirmDeleteId(null)
    const supabase = createClient()
    await supabase.from('applications').delete().eq('id', id)
  }

  // hueMap sorts internally, so this page's query order cannot disagree with
  // the dashboard's. It used to: this one reads created_at, that one updated_at.
  const hues = hueMap(projectList)

  useEffect(() => {
    document.title = 'Applications · Shoots'
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
          .from('applications')
          .select('*')
          .eq('org_id', org.id)
          .order('updated_at', { ascending: false })
        const rows = (data ?? []) as ApplicationRecord[]
        setApps(rows)

        // Project names for the "Part of: …" differentiator on rows.
        const { data: projs } = await supabase
          .from('projects').select('id, name, created_at').eq('org_id', org.id)
          .order('created_at', { ascending: false })
        const plist = (projs ?? []) as { id: string; name: string; created_at: string | null }[]
        const pmap: Record<string, string> = {}
        for (const pr of plist) pmap[pr.id] = pr.name
        setProjectNames(pmap)
        setProjectList(plist)

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
{/* Blocked-state copy, shared shape across Pipeline / Projects /
              Applications. Two jobs: name the ORGANISATION, because a
              multi-org owner needs to know it is this profile and not their
              account; and say the saved work is still there, because the
              screen otherwise reads as though it was deleted. It is also the
              screen a finished trial lands on, which is why "kept, not
              deleted" is the second sentence rather than a footnote.
              When checkout ships (item 6) this gains a subscribe link. */}
          <p style={{ fontFamily: BODY, fontSize: 14, color: T.textSecondary, margin: 0, lineHeight: 1.6 }}>
            Applications are not switched on for {blockedOrgName ?? 'this organisation'}.
          </p>
          <p style={{ fontFamily: BODY, fontSize: 14, color: T.textSecondary, margin: '10px 0 0', lineHeight: 1.6 }}>
            Anything you have already saved here is kept, not deleted. Get in touch
            and we will switch it back on.
          </p>
        </div>
      </div>
    )
  }

  return (
    /* Full width, matching Find Funding, Pipeline and Projects. The heading
       colour is set here rather than on T.textPrimary — that token is shared
       across every builder surface. */
    <div>
      {/* Header. flexWrap so the counts and the button drop below the heading
          when space is tight, rather than compressing the button. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, marginBottom: 6, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 280, flex: '1 1 440px' }}>
          <h1 style={{ fontFamily: UI, fontWeight: 600, fontSize: 31, color: '#1D3C3E', letterSpacing: '-0.025em', margin: 0 }}>
            Applications
          </h1>
          <p style={{ fontFamily: BODY, fontSize: 13.5, color: '#5F5E5A', margin: '5px 0 0', lineHeight: 1.55, maxWidth: 600 }}>
            Shoots shapes each answer from your own material, shows you what a strong response
            to this funder needs to cover, and flags the gaps before you start. You write it in your
            own words.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 26, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {loaded && apps.length > 0 && (() => {
            const counts = [
              { n: apps.filter(a => a.status === 'in_progress' || a.status === 'draft').length, label: 'In progress' },
              { n: apps.filter(a => a.status === 'complete').length, label: 'Complete' },
              { n: deadlineSoon, label: 'Deadline soon' },
            ]
            return counts.map(c => (
              <span key={c.label} style={{ textAlign: 'right' }}>
                <span style={{ fontFamily: UI, fontSize: 27, fontWeight: 600, color: c.label === 'Deadline soon' && c.n > 0 ? '#993C1D' : '#1D3C3E', letterSpacing: '-0.03em', lineHeight: 1, display: 'block' }}>{c.n}</span>
                <span style={{ fontFamily: UI, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#5F5E5A', display: 'block', marginTop: 5 }}>{c.label}</span>
              </span>
            ))
          })()}
          <Link
            href="/dashboard/applications/new"
            style={{
              fontFamily: UI, fontWeight: 600, fontSize: 13.5, color: '#F6F1E7',
              background: '#1D3C3E', border: 'none', padding: '11px 20px',
              borderRadius: 999, textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
              gap: 7, whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            <Plus size={15} /> New application
          </Link>
        </div>
      </div>

      {/* Ethos: what makes a strong application (collapsible, light) */}
      <div style={{ marginTop: 14 }}>
        <DisclosureControl open={principlesOpen} onClick={() => setPrinciplesOpen(o => !o)} icon={<Lightbulb size={15} />}>
          What makes a strong application
        </DisclosureControl>
        {principlesOpen && (
          <div style={{
            background: T.softGreen, border: `1px solid ${T.border}`, borderRadius: 12,
            padding: '18px 20px', marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            {STRONG_APPLICATION_PRINCIPLES.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 11 }}>
                <span style={{
                  fontFamily: UI, fontWeight: 700, fontSize: 11, color: '#1D3C3E', background: '#F1EDE3',
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

      {/* The three stat cards that sat here are now the header cluster above. */}

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
        {assignError && (
          <p style={{ fontFamily: BODY, fontSize: 13, color: T.coralText, margin: '0 0 4px' }}>{assignError}</p>
        )}

        {apps.map(app => {
          const status = STATUS_STYLE[app.status] ?? STATUS_STYLE.draft
          const pid  = app.project_id ?? null
          const hue  = pid ? hues.get(pid) ?? null : null
          const pName = pid ? projectNames[pid] ?? null : null
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
              {/* The project's hue, or neutral. Neutral is the honest state,
                  not a placeholder: colour that means nothing is worse than no
                  colour, so an unfiled row simply has none. */}
              <span style={{
                width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                background: hue ?? PROJECT_HUE_NONE, color: PROJECT_HUE_INK,
                fontFamily: UI, fontWeight: 600, fontSize: 14.5,
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
                  {(app as { created_at?: string }).created_at
                    ? ` · ${new Date((app as { created_at: string }).created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                    : ''}
                </span>
                {/* Filed, or the control to file it. The affordance is
                    self-cancelling — choose a project and the swatch takes its
                    place — so it needs no empty state of its own, and it never
                    nags: an unfiled row says nothing about being unfiled. */}
                <span
                  onClick={e => { e.preventDefault(); e.stopPropagation() }}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5 }}
                >
                  {pid && pName ? (
                    <>
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: hue ?? PROJECT_HUE_NONE, flexShrink: 0 }} />
                      <span style={{ fontFamily: BODY, fontSize: 12.5, color: T.textSecondary }}>Part of {pName}</span>
                    </>
                  ) : projectList.length === 0 ? null : assigningId === app.id ? (
                    <select
                      autoFocus
                      defaultValue=""
                      onChange={e => assignProject(app.id, e.target.value || null)}
                      onBlur={() => setAssigningId(null)}
                      style={{
                        fontFamily: BODY, fontSize: 12.5, color: T.textPrimary, background: T.white,
                        border: `1px solid ${T.borderStrong}`, borderRadius: 8, padding: '5px 8px',
                        cursor: 'pointer', maxWidth: 260,
                      }}
                    >
                      <option value="" disabled>Choose a project…</option>
                      {projectList.map(pr => (
                        <option key={pr.id} value={pr.id}>{pr.name}</option>
                      ))}
                    </select>
                  ) : (
                    <button
                      onClick={() => { setAssignError(null); setAssigningId(app.id) }}
                      style={{
                        fontFamily: UI, fontWeight: 600, fontSize: 11.5, color: T.textSecondary,
                        background: 'transparent', border: `1px dashed ${T.borderStrong}`,
                        borderRadius: 999, padding: '4px 10px', cursor: 'pointer',
                      }}
                    >
                      Assign project
                    </button>
                  )}
                </span>
              </div>
              {total > 0 && (
                <div style={{ width: 132, flexShrink: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontFamily: BODY, fontSize: 11.5, color: T.textSecondary }}>
                      {answered} of {total} written
                    </span>
                    <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 12.5, color: '#1D3C3E' }}>
                      {Math.round((answered / total) * 100)}%
                    </span>
                  </div>
                  {/* Track was T.cream on a white card — 1.04:1, invisible, so the bar read as a floating stub. Same bug as the Find Funding sort pill. */}
                  <div style={{ height: 6, background: 'rgba(29,60,62,0.15)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${Math.round((answered / total) * 100)}%`,
                      background: '#1D3C3E', borderRadius: 999, transition: 'width 200ms ease',
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
            <h2 style={{ fontFamily: UI, fontWeight: 600, fontSize: 19, color: '#1D3C3E', margin: '0 0 4px', letterSpacing: '-0.015em' }}>
              Ready to start
            </h2>
            <p style={{ fontFamily: BODY, fontSize: 13.2, color: '#5F5E5A', margin: '0 0 12px', lineHeight: 1.5 }}>
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
                        fontFamily: UI, fontWeight: 600, fontSize: 13, color: '#F6F1E7', background: '#1D3C3E',
                        padding: '11px 18px', borderRadius: 999, textDecoration: 'none', whiteSpace: 'nowrap',
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
              /* Matches the disclosure at the top of the page rather than
                 being a second pattern — it was a bare green link. */
              <span style={{ alignSelf: 'flex-start', marginTop: 6 }}>
                <DisclosureControl open={false} onClick={() => setHowOpen(true)} icon={<HelpCircle size={15} />}>
                  How it works
                </DisclosureControl>
              </span>
            )
        )}
      </div>
    </div>
  )
}
