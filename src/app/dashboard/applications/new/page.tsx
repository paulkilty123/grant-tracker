'use client'

// New application — builder v0 steps 1-2 (spec B3).
// Step 1 (setup): optionally link a catalogue opportunity (typeahead) or name
// the funder, then paste the application questions.
// Step 2 (confirm): the parsed questions, editable — the cheap correction
// point before any generation spend.

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Search as SearchIcon, X as XIcon, Plus, Trash2, Check, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getOrganisationByOwner } from '@/lib/organisations'
import { emitClientEvent } from '@/lib/events/client'
import { T, UI, BODY, DEEP, inputStyle, deepBtn, ghostBtn } from '@/components/builder/tokens'
import { OUTLINE_TEMPLATE } from '@/lib/builder/types'

interface PickedOpportunity {
  id: string          // scraped_grants.id (catalogue UUID)
  title: string
  funder: string
  applyUrl: string | null     // funder's application page (catalogue apply_url)
  howToApply: string | null   // funder_brief.how_to_apply guidance
}

// Map a grants_with_funder row to a PickedOpportunity, carrying the apply-page
// link and how-to-apply guidance so the setup step can point the user at where
// to get the questions (we have these for ~100% of the catalogue).
function toPicked(row: Record<string, unknown>): PickedOpportunity {
  const brief = row.funder_brief && typeof row.funder_brief === 'object'
    ? (row.funder_brief as Record<string, string | null>)
    : null
  const apply = row.apply_url ? String(row.apply_url).trim() : ''
  const how = brief?.how_to_apply ? String(brief.how_to_apply).trim() : ''
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    funder: String(row.funder ?? ''),
    applyUrl: apply || null,
    howToApply: how || null,
  }
}

// how_to_apply is often stored as inline-numbered steps ("1. … 2. … 3. …").
// Split it into a real list so it can render as one. Returns null when the
// text isn't a numbered sequence (render as a paragraph then). A step boundary
// is a 1-2 digit number + "." + whitespace, preceded by start/whitespace —
// "4.00pm" and "22 June 2026." don't match (no whitespace after the dot).
function parseSteps(text: string): string[] | null {
  const re = /\d{1,2}\.\s+/g
  const starts: number[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index === 0 || /\s/.test(text[m.index - 1])) starts.push(m.index)
  }
  if (starts.length < 2) return null
  const steps: string[] = []
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1] : text.length
    const seg = text.slice(starts[i], end).replace(/^\d{1,2}\.\s+/, '').trim()
    if (seg) steps.push(seg)
  }
  return steps.length >= 2 ? steps : null
}

// Size a question field to its content: one-line questions stay compact, long
// ones grow to fit without an inner scrollbar, and every row ends up an even,
// content-matched height (no guessed row counts leaving empty space).
function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.max(el.scrollHeight, 48)}px`
}

interface EditableQuestion {
  question_text: string
  word_limit: number | null
}

function StepDot({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 24, height: 24, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: UI, fontWeight: 700, fontSize: 12,
        background: done ? '#E3F0E4' : active ? '#1D3C3E' : '#F1EDE3',
        color: done ? '#1B6B3D' : active ? '#F6F1E7' : T.textTertiary,
      }}>
        {done ? <Check size={13} /> : n}
      </div>
      <span style={{
        fontFamily: UI, fontWeight: active || done ? 600 : 500, fontSize: 13,
        color: active || done ? T.textPrimary : T.textTertiary,
      }}>
        {label}
      </span>
    </div>
  )
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function NewApplicationPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [orgId, setOrgId] = useState<string | null>(null)
  // Fork retired (IA: honest per-section creation). "New application" goes
  // straight to the funder form; the project-first path lives in /projects.
  const [step, setStep] = useState<'setup' | 'confirm'>('setup')
  const [mode, setMode] = useState<'project' | 'funder' | null>('funder')
  // Project link-through (project-first phase 3): arriving from a project's
  // match list carries ?opportunity= and ?project=; a general proposal
  // carries ?project= alone and goes straight to the outline.
  const [projectId, setProjectId] = useState<string | null>(null)
  /**
   * The org's projects, newest first, for the picker.
   *
   * `projectFromParam` records that ?project= answered the question already —
   * that path came from a project's own "Find funders" flow, so re-asking would
   * be worse than not asking. The picker renders as a stated fact instead.
   */
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [projectFromParam, setProjectFromParam] = useState(false)
  // Pipeline link-through: arriving from a "Ready to start" pipeline item
  // (?pipeline=) prefills the funder by name and links the new application back.
  const [pipelineItemId, setPipelineItemId] = useState<string | null>(null)

  // ── Step 1 state ──
  const [oppQuery, setOppQuery] = useState('')
  const [oppResults, setOppResults] = useState<PickedOpportunity[]>([])
  const [picked, setPicked] = useState<PickedOpportunity | null>(null)
  const [funderName, setFunderName] = useState('')
  const [grantName, setGrantName] = useState('')
  const [showManual, setShowManual] = useState(false)
  const [rawText, setRawText] = useState('')
  const [projectBrief, setProjectBrief] = useState('')
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Step 2 state ──
  const [questions, setQuestions] = useState<EditableQuestion[]>([])
  const [creating, setCreating] = useState(false)
  const [focusedQ, setFocusedQ] = useState<number | null>(null)

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      const org = await getOrganisationByOwner(user.id)
      if (org) setOrgId(org.id)

      // Deep-link prefill from a project page or a pipeline item.
      const oppParam = searchParams.get('opportunity')
      const projParam = searchParams.get('project')
      const pipeParam = searchParams.get('pipeline')

      // Projects for the picker. Newest first, which is also the default.
      if (org) {
        const { data: projRows } = await supabase
          .from('projects')
          .select('id, name')
          .eq('org_id', org.id)
          .order('created_at', { ascending: false })
        const list = (projRows ?? []) as { id: string; name: string }[]
        setProjects(list)
        if (projParam && UUID_RE.test(projParam)) {
          setProjectFromParam(true)
        } else if (list.length > 0) {
          // Pre-selected rather than blank: a sensible default beats an empty
          // required field. It is safe to default only because the control is
          // visible on the form — a silent pre-selection nobody notices
          // produces confidently wrong data, which is worse than a null.
          setProjectId(list[0].id)
        }
      }
      if (projParam && UUID_RE.test(projParam)) setProjectId(projParam)
      if (pipeParam && UUID_RE.test(pipeParam)) {
        const { data: pi } = await supabase
          .from('pipeline_items')
          .select('id, grant_name, funder_name')
          .eq('id', pipeParam)
          .maybeSingle()
        if (pi) {
          setPipelineItemId(pi.id as string)
          setFunderName((pi.funder_name as string) ?? '')
          setGrantName((pi.grant_name as string) ?? '')
          setShowManual(true)
          setMode('funder')
          setStep('setup')
          return
        }
      }
      if (oppParam && UUID_RE.test(oppParam)) {
        const { data: row } = await supabase
          .from('grants_with_funder')
          .select('id, title, funder, apply_url, funder_brief')
          .eq('id', oppParam)
          .maybeSingle()
        if (row) {
          setPicked(toPicked(row as Record<string, unknown>))
          setMode('funder')
          setStep('setup')
          return
        }
      }
      if (projParam && UUID_RE.test(projParam) && !oppParam) {
        // General proposal from a project: outline mode, skip the fork.
        setMode('project')
        setQuestions(OUTLINE_TEMPLATE.map(q => ({ ...q })))
        setStep('confirm')
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  // Catalogue typeahead — title/funder match over the live published view.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    const q = oppQuery.trim()
    if (q.length < 2 || picked) { setOppResults([]); return }
    searchTimer.current = setTimeout(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('grants_with_funder')
        .select('id, title, funder, apply_url, funder_brief')
        .eq('is_active', true)
        .or(`title.ilike.%${q}%,funder.ilike.%${q}%`)
        .limit(7)
      setOppResults(((data ?? []) as Record<string, unknown>[]).map(toPicked))
    }, 250)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [oppQuery, picked])

  async function handleParse() {
    setError(null)
    if (!rawText.trim()) { setError('Paste the application questions first'); return }
    setParsing(true)
    try {
      const res = await fetch('/api/builder/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: rawText }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data?.error ?? 'Could not parse the questions'); return }
      setQuestions(data.questions)
      setStep('confirm')
    } catch {
      setError('Could not reach the parser, please try again')
    } finally {
      setParsing(false)
    }
  }

  async function handleCreate() {
    if (!orgId) { setError('Complete your organisation profile first'); return }
    const clean = questions.filter(q => q.question_text.trim())
    if (clean.length === 0) { setError('Keep at least one question'); return }
    setCreating(true); setError(null)
    try {
      const res = await fetch('/api/builder/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          opportunity_id: picked?.id ?? null,
          project_id: projectId,
          pipeline_item_id: pipelineItemId,
          project_brief: projectBrief.trim() || null,
          grant_name: picked?.title ?? (grantName.trim() || null),
          funder_name: picked?.funder ?? (funderName.trim() || null),
          questions: clean,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data?.error ?? 'Could not create the application'); setCreating(false); return }
      router.push(`/dashboard/applications/${data.id}`)
    } catch {
      setError('Could not create the application, please try again')
      setCreating(false)
    }
  }

  function updateQuestion(idx: number, patch: Partial<EditableQuestion>) {
    setQuestions(qs => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)))
  }

  return (
    /* Full width, matching the rest of band C. */
    <div>
      {/* Breadcrumb + stepper */}
      <Link href="/dashboard/applications" style={{
        fontFamily: UI, fontWeight: 500, fontSize: 13, color: T.textSecondary,
        textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16,
      }}>
        <ArrowLeft size={14} /> Applications
      </Link>

      <h1 style={{ fontFamily: UI, fontWeight: 600, fontSize: 31, color: '#1D3C3E', letterSpacing: '-0.025em', margin: '0 0 16px' }}>
        New application
      </h1>

      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 26 }}>
        <StepDot n={1} label="Set up" active={step === 'setup'} done={step === 'confirm'} />
        <div style={{ flex: '0 0 32px', height: 1, background: T.borderStrong }} />
        <StepDot n={2} label={mode === 'project' ? 'Describe your project' : 'Check the questions'} active={step === 'confirm'} done={false} />
        <div style={{ flex: '0 0 32px', height: 1, background: T.border }} />
        <StepDot n={3} label="Build" active={false} done={false} />
      </div>

      {/* Project-first fork (spec section 8, phase 1) */}
      {step === 'setup' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Cross-nudge to the project-first path (replaces the old fork). */}
          <div style={{
            background: T.paleGreen, borderRadius: 10, padding: '12px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          }}>
            <span style={{ fontFamily: BODY, fontSize: 12.5, color: T.sage, lineHeight: 1.5 }}>
              Applying to more than one funder, or the form is behind a portal? Start with a project
              and we&apos;ll match you to funders.
            </span>
            <button
              onClick={() => {
                emitClientEvent(orgId, 'builder_path_chosen', { path: 'project' })
                router.push('/dashboard/projects/new')
              }}
              style={{
                fontFamily: UI, fontWeight: 600, fontSize: 12.5, color: '#1D3C3E', background: 'transparent',
                border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              Start a project instead →
            </button>
          </div>

          {/* Funder / opportunity card */}
          <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: '20px 24px' }}>
            <h2 style={{ fontFamily: UI, fontWeight: 600, fontSize: 16, color: T.textPrimary, margin: '0 0 4px' }}>
              Who are you applying to?
            </h2>
            <p style={{ fontFamily: BODY, fontSize: 13, color: T.textSecondary, margin: '0 0 14px', lineHeight: 1.55 }}>
              Choose a funder from the catalogue and we&apos;ll use everything Shoots knows
              about them: priorities, exclusions, what a strong application covers. We&apos;ll also
              check your eligibility before you spend any time writing.
            </p>

            {picked ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, background: T.paleGreen,
                borderRadius: 10, padding: '12px 16px',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 14, color: T.textPrimary }}>{picked.title}</div>
                  <div style={{ fontFamily: BODY, fontSize: 12.5, color: T.sage }}>{picked.funder} · from the catalogue</div>
                </div>
                <button onClick={() => { setPicked(null); setOppQuery('') }} aria-label="Remove linked opportunity"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: T.textSecondary, padding: 6 }}>
                  <XIcon size={15} />
                </button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'relative' }}>
                  <SearchIcon size={15} color={T.textTertiary} style={{ position: 'absolute', left: 12, top: 12 }} />
                  <input
                    value={oppQuery}
                    onChange={e => setOppQuery(e.target.value)}
                    placeholder="Search the catalogue by grant or funder name…"
                    style={{ ...inputStyle(), paddingLeft: 36 }}
                  />
                </div>
                {oppResults.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4,
                    background: T.white, border: `1px solid ${T.borderStrong}`, borderRadius: 10,
                    boxShadow: '0 10px 32px rgba(26,46,43,0.12)', overflow: 'hidden',
                  }}>
                    {oppResults.map(r => (
                      <button
                        key={r.id}
                        onClick={() => { setPicked(r); setOppResults([]) }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px',
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          borderBottom: `1px solid ${T.border}`,
                        }}
                      >
                        <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 13.5, color: T.textPrimary }}>{r.title}</div>
                        <div style={{ fontFamily: BODY, fontSize: 12, color: T.textSecondary }}>{r.funder}</div>
                      </button>
                    ))}
                  </div>
                )}
                {!showManual ? (
                  <button
                    onClick={() => setShowManual(true)}
                    style={{
                      fontFamily: UI, fontWeight: 600, fontSize: 12.5, color: T.sage,
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      padding: 0, marginTop: 12,
                    }}
                  >
                    Can&apos;t find them? Enter the funder manually
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <label style={{ fontFamily: UI, fontSize: 12.5, fontWeight: 600, color: T.textSecondary, display: 'block', marginBottom: 6 }}>
                        Funder name
                      </label>
                      <input value={funderName} onChange={e => setFunderName(e.target.value)}
                        placeholder="Funder name" style={inputStyle()} />
                    </div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <label style={{ fontFamily: UI, fontSize: 12.5, fontWeight: 600, color: T.textSecondary, display: 'block', marginBottom: 6 }}>
                        Grant or fund name <span style={{ fontWeight: 400, color: T.textTertiary }}>(optional)</span>
                      </label>
                      <input value={grantName} onChange={e => setGrantName(e.target.value)}
                        placeholder="e.g. Awards for All" style={inputStyle()} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Questions paste card */}
          <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: '20px 24px' }}>
            <h2 style={{ fontFamily: UI, fontWeight: 600, fontSize: 16, color: T.textPrimary, margin: '0 0 4px' }}>
              Paste the application questions
            </h2>
            <p style={{ fontFamily: BODY, fontSize: 13, color: T.textSecondary, margin: '0 0 14px', lineHeight: 1.55 }}>
              Copy the questions straight from the funder&apos;s form or guidance, numbering, word
              limits and all. We&apos;ll sort them into a checklist you can correct before
              anything else happens.
            </p>

            {/* Where to get the questions — apply-page link + how-to-apply
                guidance from the catalogue (present for ~all grants). */}
            {picked && (picked.applyUrl || picked.howToApply) && (() => {
              const steps = picked.howToApply ? parseSteps(picked.howToApply) : null
              return (
                <div style={{ background: T.paleGreen, borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
                  {picked.howToApply && (
                    <div style={{ marginBottom: picked.applyUrl ? 12 : 0 }}>
                      <p style={{ fontFamily: UI, fontWeight: 600, fontSize: 12.5, color: T.sage, margin: '0 0 6px' }}>
                        How to apply
                      </p>
                      {steps ? (
                        <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {steps.map((s, i) => (
                            <li key={i} style={{ fontFamily: BODY, fontSize: 12.5, color: T.sage, lineHeight: 1.5 }}>{s}</li>
                          ))}
                        </ol>
                      ) : (
                        <p style={{ fontFamily: BODY, fontSize: 12.5, color: T.sage, margin: 0, lineHeight: 1.5 }}>
                          {picked.howToApply}
                        </p>
                      )}
                    </div>
                  )}
                  {picked.applyUrl && (
                    <a
                      href={picked.applyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontFamily: UI, fontWeight: 600, fontSize: 12.5, color: '#1D3C3E',
                        background: T.white, border: `1px solid ${T.borderStrong}`,
                        padding: '6px 12px', borderRadius: 8, textDecoration: 'none',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      Open application page <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              )
            })()}

            <textarea
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              rows={9}
              placeholder={'1. Tell us about your organisation (max 300 words)\n2. What do you want to do with this funding? (max 500 words)\n3. Who will benefit, and how do you know they need it?\n…'}
              style={{ ...inputStyle(), resize: 'vertical', lineHeight: 1.6, fontSize: 13.5 }}
            />
          </div>

          {/* Which project is this for?

              Its own card, above the fold, because the field being SEEN is what
              makes the pre-selected default safe. Tucked below the fold, a
              default nobody notices produces confidently wrong attribution,
              which is worse than the nulls it replaces.

              "Not part of a project" is an explicit option rather than the
              absence of a choice: applications that genuinely stand alone are
              legitimate (the builder reads project_brief as the alternative),
              and a null should record a decision, not an oversight. */}
          <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: '20px 24px' }}>
            <h2 style={{ fontFamily: UI, fontWeight: 600, fontSize: 16, color: T.textPrimary, margin: '0 0 4px' }}>
              Which project is this for?
            </h2>
            {projectFromParam ? (
              <p style={{ fontFamily: BODY, fontSize: 13, color: T.textSecondary, margin: 0, lineHeight: 1.55 }}>
                You started this from{' '}
                <span style={{ fontWeight: 600, color: T.textPrimary }}>
                  {projects.find(pr => pr.id === projectId)?.name ?? 'a project'}
                </span>
                , so it will be filed there.
              </p>
            ) : projects.length === 0 ? (
              <p style={{ fontFamily: BODY, fontSize: 13, color: T.textSecondary, margin: 0, lineHeight: 1.55 }}>
                You have no projects yet, so this will stand on its own. You can file it later from
                your applications list.
              </p>
            ) : (
              <>
                <p style={{ fontFamily: BODY, fontSize: 13, color: T.textSecondary, margin: '0 0 14px', lineHeight: 1.55 }}>
                  Filing it against a project is what tells your applications apart when several go to
                  the same funder, and it colours them to match on your dashboard.
                </p>
                <select
                  value={projectId ?? 'none'}
                  onChange={e => setProjectId(e.target.value === 'none' ? null : e.target.value)}
                  style={{ ...inputStyle(), fontFamily: BODY, fontSize: 13.5, cursor: 'pointer', maxWidth: 460 }}
                >
                  {projects.map(pr => (
                    <option key={pr.id} value={pr.id}>{pr.name}</option>
                  ))}
                  <option value="none">Not part of a project</option>
                </select>
              </>
            )}
          </div>

          {/* Describe this project — optional material fed into the Build step
              so the per-question drafts compose from real plans, not just the
              org profile. Persisted as applications.project_brief. */}
          <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: '20px 24px' }}>
            <h2 style={{ fontFamily: UI, fontWeight: 600, fontSize: 16, color: T.textPrimary, margin: '0 0 4px' }}>
              Describe this project{' '}
              <span style={{ fontFamily: BODY, fontWeight: 400, fontSize: 13, color: T.textTertiary }}>(optional, but it gives you a real head start)</span>
            </h2>
            <p style={{ fontFamily: BODY, fontSize: 13, color: T.textSecondary, margin: '0 0 14px', lineHeight: 1.55 }}>
              A few sentences, or paste from an old proposal: what the project will do, who it helps,
              and the difference it makes. We use this to draft each answer from your real plans,
              not just your organisation profile.
            </p>
            <textarea
              value={projectBrief}
              onChange={e => setProjectBrief(e.target.value)}
              rows={6}
              placeholder={'e.g. We want to run weekly employability workshops for 40 young people in Southall who are not in education or work, over 12 months, with two part-time coaches. The aim is to get at least half into training or a job…'}
              style={{ ...inputStyle(), background: T.editorBg, resize: 'vertical', lineHeight: 1.6, fontSize: 13.5 }}
            />
          </div>

          {error && (
            <p style={{ fontFamily: BODY, fontSize: 13.5, color: T.coralText, margin: 0 }}>{error}</p>
          )}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleParse} disabled={parsing} style={deepBtn(parsing)}>
              {parsing ? 'Reading the questions…' : 'Continue'}
            </button>
            {/* Escape hatch for portal-gated / EOI-first funders where the
                applicant can't paste a question list. Keeps the picked funder
                and any linked project; builds from the standard outline. */}
            <button
              onClick={() => {
                setMode('project')
                setQuestions(OUTLINE_TEMPLATE.map(q => ({ ...q })))
                setError(null)
                setStep('confirm')
              }}
              style={ghostBtn()}
            >
              No questions to paste? Use the questions funders usually ask
            </button>
          </div>
        </div>
      )}

      {step === 'confirm' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: '20px 24px' }}>
            <h2 style={{ fontFamily: UI, fontWeight: 600, fontSize: 16, color: T.textPrimary, margin: '0 0 4px' }}>
              {mode === 'project'
                ? 'Describe your project'
                : `${questions.length} ${questions.length === 1 ? 'question' : 'questions'} found, check them over`}
            </h2>
            <p style={{ fontFamily: BODY, fontSize: 13, color: T.textSecondary, margin: '0 0 16px', lineHeight: 1.55 }}>
              {mode === 'project'
                ? 'These are the sections every funder asks about. Click any one to reword it, change its limit, or remove it, then build. You write the answers in the next step, not here.'
                : 'Click any question to fix what the parser got wrong, including word limits, then build. You write the answers in the next step, not here. Word limits the funder stated in characters are shown as approximate words.'}
            </p>
            {questions.length > 12 && (
              <div style={{ background: T.amberBg, borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
                <p style={{ fontFamily: BODY, fontSize: 12.5, color: T.amberText, margin: 0, lineHeight: 1.5 }}>
                  That is a lot of questions. Long forms work, but the build takes longer, and form
                  fields like addresses or registration numbers do not need scaffolds. Remove any
                  that are not real writing questions.
                </p>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {questions.map((q, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{
                    fontFamily: UI, fontWeight: 700, fontSize: 12.5, color: T.sage, background: T.paleGreen,
                    width: 26, height: 26, borderRadius: 999, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', flexShrink: 0, marginTop: 11,
                  }}>
                    {i + 1}
                  </span>
                  <textarea
                    ref={autoGrow}
                    value={q.question_text}
                    onChange={e => { updateQuestion(i, { question_text: e.target.value }); autoGrow(e.target) }}
                    onFocus={() => setFocusedQ(i)}
                    onBlur={() => setFocusedQ(null)}
                    rows={1}
                    placeholder="Type the question"
                    aria-label={`Question ${i + 1}`}
                    style={{
                      ...inputStyle(), flex: 1, background: T.editorBg,
                      border: `1.5px solid ${focusedQ === i ? T.sage : T.borderStrong}`,
                      resize: 'none', overflow: 'hidden', lineHeight: 1.55, fontSize: 15,
                      padding: '12px 14px', minHeight: 48,
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, marginTop: 9 }}>
                    <input
                      type="number"
                      value={q.word_limit ?? ''}
                      onChange={e => updateQuestion(i, { word_limit: e.target.value ? Number(e.target.value) : null })}
                      placeholder="none"
                      aria-label={`Word limit for question ${i + 1}`}
                      style={{ ...inputStyle(), width: 82, padding: '10px 8px', fontSize: 14, textAlign: 'center' }}
                    />
                    <span style={{ fontFamily: UI, fontSize: 12, color: T.textTertiary }}>words</span>
                    <button
                      onClick={() => setQuestions(qs => qs.filter((_, j) => j !== i))}
                      aria-label={`Remove question ${i + 1}`}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: T.textTertiary, padding: 6 }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setQuestions(qs => [...qs, { question_text: '', word_limit: null }])}
              style={{ ...ghostBtn(), display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, paddingLeft: 0 }}
            >
              <Plus size={14} /> Add a question
            </button>
          </div>

          {error && (
            <p style={{ fontFamily: BODY, fontSize: 13.5, color: T.coralText, margin: 0 }}>{error}</p>
          )}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={handleCreate} disabled={creating} style={deepBtn(creating)}>
              {creating ? 'Setting up…' : 'Looks right, plan my answers'}
            </button>
            <button
              onClick={() => {
                // General proposal (project link, no funder) has no setup step
                // to return to — it deep-linked from a project. Go to Projects.
                if (mode === 'project' && !picked) { router.push('/dashboard/projects'); return }
                setStep('setup'); setError(null)
              }}
              style={ghostBtn()}
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
