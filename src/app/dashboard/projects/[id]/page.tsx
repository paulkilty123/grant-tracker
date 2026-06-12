'use client'

// Project page — project-first phases 2+3. The extracted project, editable
// field by field with autosave; a completeness bar with two thresholds
// (ready-to-match checkpoint, then 100%); and live funder matching where the
// organisation supplies the eligibility side and the project supplies the
// relevance side (sectors, beneficiaries, budget).

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Check, ChevronRight, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getOrganisationByOwner } from '@/lib/organisations'
import { emitClientEvent } from '@/lib/events/client'
import { computeMatchScore } from '@/lib/matching'
import { normaliseScrapedGrant, type EnrichedGrant } from '@/lib/grants-normalise'
import { IMPACT_SECTOR_OPTIONS, BENEFICIARY_OPTIONS } from '@/lib/tag-suggestions'
import { T, UI, BODY, inputStyle } from '@/components/builder/tokens'
import {
  PROJECT_FIELDS, fieldFilled, projectCompleteness, readyToMatch,
  updateProject, type Project, type ProjectFieldMeta,
} from '@/lib/builder/projects'
import type { Organisation } from '@/types'

interface LinkedApp {
  id: string
  grant_name: string | null
  funder_name: string | null
  status: string
  questions: { user_answer?: string | null }[] | null
}

type ScoredMatch = { grant: EnrichedGrant; score: number }

const TYPE_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  project:   { bg: T.paleGreen,  color: T.sage,      label: 'Project' },
  campaign:  { bg: T.amberBg,    color: T.amberText, label: 'Campaign' },
  programme: { bg: '#FAECE7',    color: '#993C1D',   label: 'Programme' },
}

const CANONICAL_TYPES = new Set(['grant', 'programme', 'investment', 'in_kind'])
const BROAD_LOCATION = new Set(['uk', 'uk-wide', 'england', 'nationwide', 'national', 'uk wide', 'all uk'])

function tierLabel(score: number): { label: string; bg: string; color: string } {
  if (score >= 80) return { label: 'Strong', bg: '#C0DD97', color: T.greenDeep }
  if (score >= 70) return { label: 'Good',   bg: T.paleGreen2, color: T.sage }
  return { label: 'Partial', bg: T.cream, color: T.textSecondary }
}

function fmtAmount(g: EnrichedGrant): string | null {
  if (g.amountMax > 0 && g.amountMin > 0 && g.amountMax !== g.amountMin)
    return `£${g.amountMin.toLocaleString('en-GB')} to £${g.amountMax.toLocaleString('en-GB')}`
  if (g.amountMax > 0) return `Up to £${g.amountMax.toLocaleString('en-GB')}`
  if (g.amountMin > 0) return `From £${g.amountMin.toLocaleString('en-GB')}`
  return null
}

export default function ProjectPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const projectId = params.id

  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [org, setOrg] = useState<Organisation | null>(null)
  const [linkedApps, setLinkedApps] = useState<LinkedApp[]>([])
  const [loaded, setLoaded] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [matches, setMatches] = useState<ScoredMatch[] | null>(null)
  const [matching, setMatching] = useState(false)
  const [showAllGaps, setShowAllGaps] = useState(false)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const matchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const grantPool = useRef<Record<string, unknown>[] | null>(null)
  const savedFlash = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load ──
  useEffect(() => {
    async function load() {
      const access = await fetch('/api/builder/access').then(r => r.json()).catch(() => ({ allowed: false }))
      setAllowed(!!access?.allowed)
      if (!access?.allowed) { setLoaded(true); return }
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      const orgRow = await getOrganisationByOwner(user.id)
      if (!orgRow) { setLoaded(true); return }
      setOrg(orgRow as unknown as Organisation)
      const [{ data: proj }, { data: apps }] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).maybeSingle(),
        supabase.from('applications').select('id, grant_name, funder_name, status, questions')
          .eq('project_id', projectId).order('updated_at', { ascending: false }),
      ])
      if (proj) {
        setProject(proj as Project)
        document.title = `${(proj as Project).name} · Grant Tracker`
      }
      setLinkedApps((apps ?? []) as LinkedApp[])
      setLoaded(true)
    }
    load()
  }, [projectId, router])

  // ── Autosave (debounced per change batch) ──
  const queueSave = useCallback((patch: Partial<Project>) => {
    setProject(prev => (prev ? { ...prev, ...patch } : prev))
    setSaveState('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        // Read latest state at fire time via the functional setter trick.
        setProject(current => {
          if (current) {
            void updateProject(current.id, {
              name: current.name,
              status: current.status,
              what_it_will_do: current.what_it_will_do,
              who_benefits: current.who_benefits,
              difference_it_makes: current.difference_it_makes,
              duration: current.duration,
              outreach: current.outreach,
              learning: current.learning,
              budget_amount: current.budget_amount,
              sectors: current.sectors,
              beneficiary_groups: current.beneficiary_groups,
            }).then(() => {
              setSaveState('saved')
              if (savedFlash.current) clearTimeout(savedFlash.current)
              savedFlash.current = setTimeout(() => setSaveState('idle'), 2000)
            }).catch(() => setSaveState('idle'))
          }
          return current
        })
      } catch {
        setSaveState('idle')
      }
    }, 800)
  }, [])

  // ── Matching ──
  // Org supplies eligibility (structure, location); project supplies relevance
  // (sectors, beneficiaries, budget) via a synthetic profile through the same
  // computeMatchScore the rest of the product uses.
  const runMatch = useCallback(async (p: Project, o: Organisation) => {
    setMatching(true)
    try {
      const supabase = createClient()
      if (!grantPool.current) {
        const today = new Date().toISOString().split('T')[0]
        const { data } = await supabase
          .from('grants_with_funder')
          .select('*')
          .eq('is_active', true)
          .neq('url_status', 'dead')
          .or(`is_rolling.eq.true,deadline.is.null,deadline.gte.${today},next_open_date_parsed.gte.${today}`)
          .order('last_seen_at', { ascending: false })
          .limit(1000)
        grantPool.current = (data ?? []) as Record<string, unknown>[]
      }

      // Synthetic profile: org base, project relevance. Budget only fills the
      // size floor when the org hasn't set its own minimum, and leniently
      // (10%) so partial-funding grants are not wrongly excluded.
      const synthetic = {
        ...o,
        impact_sectors: p.sectors,
        beneficiary_groups: p.beneficiary_groups,
        min_grant_target: o.min_grant_target ?? (p.budget_amount ? Math.round(p.budget_amount * 0.1) : null),
      } as Organisation

      const orgStructure = o.legal_structure
      const orgLocation = (o.primary_location ?? '').toLowerCase().trim()
      const projectSectors = new Set(p.sectors)

      const scored = grantPool.current
        .map(row => {
          const g = normaliseScrapedGrant(row)
          const ge = g as EnrichedGrant & { impactSectors?: string[]; geoScope?: string[] }
          const ft = (g.fundingType ?? 'grant') as string
          if (!CANONICAL_TYPES.has(ft)) return null
          // Eligibility side: the organisation
          const es = g.eligibleStructures
          if (orgStructure && es && es.length > 0 && !es.includes(orgStructure)) return null
          if (orgLocation && ge.geoScope && ge.geoScope.length > 0) {
            const passes = ge.geoScope.some(s => {
              const sl = s.toLowerCase()
              return BROAD_LOCATION.has(sl) || sl.includes(orgLocation) || orgLocation.includes(sl)
            })
            if (!passes) return null
          }
          // Relevance side: the project
          if (projectSectors.size > 0 && ge.impactSectors && ge.impactSectors.length > 0) {
            if (!ge.impactSectors.some(s => projectSectors.has(s))) return null
          }
          const score = computeMatchScore(g, synthetic).score
          return { grant: g, score }
        })
        .filter((x): x is ScoredMatch => x !== null && x.score >= 55)
        .sort((a, b) => b.score - a.score)
        .slice(0, 12)

      setMatches(scored)
      emitClientEvent(o.id, 'project_match_run', { project_id: p.id, match_count: scored.length })
    } finally {
      setMatching(false)
    }
  }, [])

  // First run on load, then debounced re-runs when relevance inputs change.
  const relevanceKey = project
    ? `${project.sectors.join(',')}|${project.beneficiary_groups.join(',')}|${project.budget_amount ?? ''}|${readyToMatch(project)}`
    : ''
  useEffect(() => {
    if (!project || !org || !readyToMatch(project)) { setMatches(null); return }
    if (matchTimer.current) clearTimeout(matchTimer.current)
    matchTimer.current = setTimeout(() => { void runMatch(project, org) }, matches === null ? 0 : 900)
    return () => { if (matchTimer.current) clearTimeout(matchTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relevanceKey, loaded])

  // ── Gating / loading states ──
  if (allowed === false) {
    return (
      <div style={{ maxWidth: 660 }}>
        <div style={{ background: T.cream, borderRadius: 12, padding: '20px 24px' }}>
          <p style={{ fontFamily: BODY, fontSize: 14, color: T.textSecondary, margin: 0, lineHeight: 1.6 }}>
            Projects are currently available to founding cohort members.
          </p>
        </div>
      </div>
    )
  }
  if (!loaded) {
    return (
      <div style={{ maxWidth: 760, marginInline: 'auto' }}>
        <div style={{ height: 16, width: 120, background: T.cream, borderRadius: 6, marginBottom: 20 }} />
        <div style={{ height: 26, width: '46%', background: T.cream, borderRadius: 8, marginBottom: 16 }} />
        <div style={{ height: 90, background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, marginBottom: 14 }} />
        <div style={{ height: 220, background: T.white, border: `1px solid ${T.border}`, borderRadius: 12 }} />
      </div>
    )
  }
  if (!project) {
    return (
      <div style={{ maxWidth: 660, marginInline: 'auto' }}>
        <p style={{ fontFamily: BODY, fontSize: 14, color: T.textSecondary }}>
          That project could not be found. <Link href="/dashboard/projects" style={{ color: T.sage }}>Back to projects</Link>
        </p>
      </div>
    )
  }

  const pct = projectCompleteness(project)
  const ready = readyToMatch(project)
  const type = TYPE_STYLE[project.type_label] ?? TYPE_STYLE.project
  const gaps = PROJECT_FIELDS.filter(f => !fieldFilled(project, f))
  const visibleGaps = showAllGaps ? gaps : gaps.slice(0, 3)

  const textField = (meta: ProjectFieldMeta) => {
    const value = (project[meta.key] as string | null) ?? ''
    const isCore = meta.key === 'what_it_will_do'
    return (
      <div key={meta.key}>
        <label htmlFor={`f-${meta.key}`} style={{
          fontFamily: UI, fontWeight: 600, fontSize: 13, color: T.textPrimary,
          display: 'block', marginBottom: 6,
        }}>
          {meta.label}
        </label>
        <textarea
          id={`f-${meta.key}`}
          value={value}
          onChange={e => queueSave({ [meta.key]: e.target.value || null } as Partial<Project>)}
          rows={isCore ? 4 : 3}
          placeholder={meta.placeholder}
          style={{ ...inputStyle(), background: T.editorBg, resize: 'vertical', lineHeight: 1.6, minHeight: isCore ? 84 : 64 }}
        />
      </div>
    )
  }

  const tagPicker = (
    label: string,
    options: { value: string; label: string }[],
    selected: string[],
    key: 'sectors' | 'beneficiary_groups',
    cap: number,
  ) => (
    <div>
      <p style={{ fontFamily: UI, fontWeight: 600, fontSize: 13, color: T.textPrimary, margin: '0 0 8px' }}>
        {label} <span style={{ fontFamily: BODY, fontWeight: 400, fontSize: 12, color: T.textTertiary }}>(up to {cap})</span>
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {options.map(opt => {
          const on = selected.includes(opt.value)
          const full = !on && selected.length >= cap
          return (
            <button
              key={opt.value}
              onClick={() => {
                const next = on ? selected.filter(s => s !== opt.value) : [...selected, opt.value]
                if (!on && selected.length >= cap) return
                queueSave({ [key]: next } as Partial<Project>)
              }}
              aria-pressed={on}
              disabled={full}
              style={{
                fontFamily: UI, fontWeight: on ? 600 : 500, fontSize: 12,
                color: on ? T.greenDeep : T.textSecondary,
                background: on ? '#C0DD97' : T.white,
                border: `1px solid ${on ? '#C0DD97' : T.borderStrong}`,
                padding: '5px 12px', borderRadius: 999, cursor: full ? 'not-allowed' : 'pointer',
                opacity: full ? 0.45 : 1,
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 820, marginInline: 'auto' }}>
      <Link href="/dashboard/projects" style={{
        fontFamily: UI, fontWeight: 500, fontSize: 13, color: T.textSecondary,
        textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16,
      }}>
        <ArrowLeft size={14} /> Projects
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        <input
          value={project.name}
          onChange={e => queueSave({ name: e.target.value })}
          aria-label="Project name"
          style={{
            fontFamily: UI, fontWeight: 600, fontSize: 24, color: T.textPrimary, letterSpacing: '-0.01em',
            border: 'none', background: 'transparent', outline: 'none', padding: 0,
            flex: '1 1 280px', minWidth: 200,
          }}
        />
        <span style={{
          fontFamily: UI, fontWeight: 600, fontSize: 11, letterSpacing: '0.03em',
          background: type.bg, color: type.color, padding: '4px 12px', borderRadius: 999, flexShrink: 0,
        }}>
          {type.label}
        </span>
        <span aria-live="polite" style={{ fontFamily: BODY, fontSize: 12, color: T.textTertiary, width: 56, flexShrink: 0 }}>
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''}
        </span>
      </div>

      {/* Completeness */}
      <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: '18px 22px', margin: '16px 0 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <p style={{ fontFamily: UI, fontWeight: 600, fontSize: 13, color: T.textPrimary, margin: 0 }}>
            {pct === 100 ? 'Fully described' : `${pct}% described`}
          </p>
          <span style={{
            fontFamily: UI, fontWeight: 600, fontSize: 11.5, padding: '4px 12px', borderRadius: 999,
            background: ready ? T.paleGreen2 : T.cream, color: ready ? T.sage : T.textSecondary,
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}>
            {ready && <Check size={12} />}
            {ready ? 'Ready to match' : 'Not ready to match yet'}
          </span>
        </div>
        <div style={{ height: 7, background: T.cream, borderRadius: 999, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${pct}%`, background: ready ? T.lime : T.greenMid,
            borderRadius: 999, transition: 'width 250ms ease',
          }} />
        </div>
        {!ready && (
          <p style={{ fontFamily: BODY, fontSize: 12.5, color: T.textSecondary, margin: '10px 0 0', lineHeight: 1.55 }}>
            To match funders we need what the project will do, at least one sector, and a rough budget.
            Everything else sharpens the results but is not required.
          </p>
        )}
        {gaps.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
            {visibleGaps.map(g => (
              <p key={String(g.key)} style={{ fontFamily: BODY, fontSize: 12.5, color: T.textSecondary, margin: 0 }}>
                <span style={{ fontFamily: UI, fontWeight: 600, color: T.amberText }}>Missing: {g.label}.</span>
                {' '}Filling this buys {g.benefit}.
              </p>
            ))}
            {gaps.length > 3 && !showAllGaps && (
              <button onClick={() => setShowAllGaps(true)} style={{
                fontFamily: UI, fontWeight: 600, fontSize: 12, color: T.sage, background: 'transparent',
                border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left',
              }}>
                Show {gaps.length - 3} more
              </button>
            )}
          </div>
        )}
      </div>

      {/* Sections */}
      <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {textField(PROJECT_FIELDS.find(f => f.key === 'what_it_will_do')!)}
        {textField(PROJECT_FIELDS.find(f => f.key === 'who_benefits')!)}
        {textField(PROJECT_FIELDS.find(f => f.key === 'difference_it_makes')!)}

        {/* Budget + duration row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <div>
            <label htmlFor="f-budget" style={{ fontFamily: UI, fontWeight: 600, fontSize: 13, color: T.textPrimary, display: 'block', marginBottom: 6 }}>
              Rough budget
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                fontFamily: UI, fontWeight: 600, fontSize: 14, color: T.textTertiary,
              }}>£</span>
              <input
                id="f-budget"
                value={project.budget_amount != null ? String(project.budget_amount) : ''}
                onChange={e => {
                  const n = Number(e.target.value.replace(/[£,\s]/g, ''))
                  queueSave({ budget_amount: Number.isFinite(n) && n > 0 ? Math.round(n) : null })
                }}
                inputMode="numeric"
                placeholder="15000"
                style={{ ...inputStyle(), paddingLeft: 26 }}
              />
            </div>
          </div>
          <div>
            <label htmlFor="f-duration" style={{ fontFamily: UI, fontWeight: 600, fontSize: 13, color: T.textPrimary, display: 'block', marginBottom: 6 }}>
              Duration
            </label>
            <input
              id="f-duration"
              value={project.duration ?? ''}
              onChange={e => queueSave({ duration: e.target.value || null })}
              placeholder="e.g. 12 months"
              style={inputStyle()}
            />
          </div>
        </div>

        {tagPicker('Sectors', IMPACT_SECTOR_OPTIONS, project.sectors, 'sectors', 3)}
        {tagPicker('Beneficiary groups', BENEFICIARY_OPTIONS, project.beneficiary_groups, 'beneficiary_groups', 3)}

        {textField(PROJECT_FIELDS.find(f => f.key === 'outreach')!)}
        {textField(PROJECT_FIELDS.find(f => f.key === 'learning')!)}
      </div>

      {/* Matches */}
      <div style={{ margin: '26px 0 0' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
          <h2 style={{ fontFamily: UI, fontWeight: 600, fontSize: 18, color: T.textPrimary, margin: 0 }}>
            Funders that fit this project
          </h2>
          {ready && (
            <Link
              href={`/dashboard/applications/new?project=${project.id}`}
              style={{ fontFamily: UI, fontWeight: 600, fontSize: 12.5, color: T.sage, textDecoration: 'none', whiteSpace: 'nowrap' }}
            >
              Draft a general proposal instead
            </Link>
          )}
        </div>
        <p style={{ fontFamily: BODY, fontSize: 13, color: T.textSecondary, margin: '0 0 14px', lineHeight: 1.55 }}>
          Your organisation covers the eligibility side; this project covers the relevance side.
        </p>

        {!ready && (
          <div style={{ background: T.cream, borderRadius: 12, padding: '18px 22px' }}>
            <p style={{ fontFamily: BODY, fontSize: 13.5, color: T.textSecondary, margin: 0, lineHeight: 1.6 }}>
              Add what the project will do, a sector and a rough budget above, and matches will
              appear here.
            </p>
          </div>
        )}

        {ready && matching && matches === null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: '15px 18px' }}>
                <div style={{ height: 13, width: `${56 - i * 9}%`, background: T.cream, borderRadius: 6, marginBottom: 7 }} />
                <div style={{ height: 10, width: '32%', background: T.cream, borderRadius: 6, opacity: 0.7 }} />
              </div>
            ))}
          </div>
        )}

        {ready && matches !== null && matches.length === 0 && (
          <div style={{ background: T.cream, borderRadius: 12, padding: '18px 22px' }}>
            <p style={{ fontFamily: BODY, fontSize: 13.5, color: T.textSecondary, margin: 0, lineHeight: 1.6 }}>
              No strong fits in the catalogue right now. Try broadening the sectors, or check{' '}
              <Link href="/dashboard/search" style={{ color: T.sage }}>Find Funding</Link> for the wider pool.
            </p>
          </div>
        )}

        {ready && matches !== null && matches.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: matching ? 0.6 : 1, transition: 'opacity 150ms ease' }}>
            {matches.map(({ grant, score }) => {
              const tier = tierLabel(score)
              const amount = fmtAmount(grant)
              return (
                <div key={grant.uuid ?? grant.id} style={{
                  background: T.white, border: `1px solid ${T.border}`, borderRadius: 12,
                  padding: '15px 18px', display: 'flex', alignItems: 'center', gap: 14,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                      <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 14.5, color: T.textPrimary }}>
                        {grant.title}
                      </span>
                      <span style={{
                        fontFamily: UI, fontWeight: 600, fontSize: 10.5, letterSpacing: '0.03em',
                        background: tier.bg, color: tier.color, padding: '2px 9px', borderRadius: 999,
                      }}>
                        {tier.label} {score}%
                      </span>
                    </div>
                    <span style={{ fontFamily: BODY, fontSize: 12.5, color: T.textSecondary }}>
                      {grant.funder}
                      {amount ? ` · ${amount}` : ''}
                      {grant.deadline ? ` · Deadline ${new Date(grant.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : grant.isRolling ? ' · Rolling' : ''}
                    </span>
                  </div>
                  <Link
                    href={`/dashboard/applications/new?opportunity=${grant.uuid}&project=${project.id}`}
                    style={{
                      fontFamily: UI, fontWeight: 600, fontSize: 12.5, color: T.greenDeep, background: T.lime,
                      padding: '7px 14px', borderRadius: 8, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    <Sparkles size={12} /> Start an application
                  </Link>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Linked applications */}
      {linkedApps.length > 0 && (
        <div style={{ margin: '26px 0 8px' }}>
          <h2 style={{ fontFamily: UI, fontWeight: 600, fontSize: 18, color: T.textPrimary, margin: '0 0 12px' }}>
            Applications from this project
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {linkedApps.map(a => {
              const total = a.questions?.length ?? 0
              const answered = (a.questions ?? []).filter(q => q.user_answer?.trim()).length
              return (
                <Link key={a.id} href={`/dashboard/applications/${a.id}`} style={{
                  background: T.white, border: `1px solid ${T.border}`, borderRadius: 12,
                  padding: '13px 18px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 14, color: T.textPrimary, display: 'block' }}>
                      {a.grant_name || a.funder_name || 'General proposal'}
                    </span>
                    <span style={{ fontFamily: BODY, fontSize: 12.5, color: T.textSecondary }}>
                      {total > 0 ? `${answered} of ${total} questions written` : 'No questions yet'}
                    </span>
                  </div>
                  <ChevronRight size={15} color={T.textTertiary} style={{ flexShrink: 0 }} />
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
