'use client'

// New application — builder v0 steps 1-2 (spec B3).
// Step 1 (setup): optionally link a catalogue opportunity (typeahead) or name
// the funder, then paste the application questions.
// Step 2 (confirm): the parsed questions, editable — the cheap correction
// point before any generation spend.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Search as SearchIcon, X as XIcon, Plus, Trash2, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getOrganisationByOwner } from '@/lib/organisations'
import { T, UI, BODY, inputStyle, primaryBtn, forestBtn, ghostBtn } from '@/components/builder/tokens'
import { OUTLINE_TEMPLATE } from '@/lib/builder/types'

interface PickedOpportunity {
  id: string          // scraped_grants.id (catalogue UUID)
  title: string
  funder: string
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
        background: done ? T.lime : active ? T.greenDeep : T.cream,
        color: done ? T.greenDeep : active ? '#F1F7E4' : T.textTertiary,
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

export default function NewApplicationPage() {
  const router = useRouter()
  const [orgId, setOrgId] = useState<string | null>(null)
  const [step, setStep] = useState<'setup' | 'confirm'>('setup')

  // ── Step 1 state ──
  const [oppQuery, setOppQuery] = useState('')
  const [oppResults, setOppResults] = useState<PickedOpportunity[]>([])
  const [picked, setPicked] = useState<PickedOpportunity | null>(null)
  const [funderName, setFunderName] = useState('')
  const [grantName, setGrantName] = useState('')
  const [rawText, setRawText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Step 2 state ──
  const [questions, setQuestions] = useState<EditableQuestion[]>([])
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      const org = await getOrganisationByOwner(user.id)
      if (org) setOrgId(org.id)
    }
    init()
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
        .select('id, title, funder')
        .eq('is_active', true)
        .or(`title.ilike.%${q}%,funder.ilike.%${q}%`)
        .limit(7)
      setOppResults(((data ?? []) as { id: string; title: string; funder: string }[])
        .map(r => ({ id: String(r.id), title: r.title, funder: r.funder })))
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
    <div style={{ maxWidth: 760 }}>
      {/* Breadcrumb + stepper */}
      <Link href="/dashboard/applications" style={{
        fontFamily: UI, fontWeight: 500, fontSize: 13, color: T.textSecondary,
        textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16,
      }}>
        <ArrowLeft size={14} /> Applications
      </Link>

      <h1 style={{ fontFamily: UI, fontWeight: 600, fontSize: 24, color: T.textPrimary, letterSpacing: '-0.01em', margin: '0 0 16px' }}>
        New application
      </h1>

      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 26 }}>
        <StepDot n={1} label="Set up" active={step === 'setup'} done={step === 'confirm'} />
        <div style={{ flex: '0 0 32px', height: 1, background: T.borderStrong }} />
        <StepDot n={2} label="Check the questions" active={step === 'confirm'} done={false} />
        <div style={{ flex: '0 0 32px', height: 1, background: T.border }} />
        <StepDot n={3} label="Build" active={false} done={false} />
      </div>

      {step === 'setup' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Funder / opportunity card */}
          <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: '20px 24px' }}>
            <h2 style={{ fontFamily: UI, fontWeight: 600, fontSize: 16, color: T.textPrimary, margin: '0 0 4px' }}>
              Who is this application to?
            </h2>
            <p style={{ fontFamily: BODY, fontSize: 13, color: T.textSecondary, margin: '0 0 14px', lineHeight: 1.55 }}>
              Link a funder from the catalogue and the builder uses everything Grant Tracker knows
              about them: priorities, exclusions, what a strong application covers. It also checks
              your eligibility before you spend any time writing.
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
                <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <label style={{ fontFamily: UI, fontSize: 12.5, fontWeight: 600, color: T.textSecondary, display: 'block', marginBottom: 6 }}>
                      Or enter the funder yourself
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
              limits and all. The builder sorts them into a checklist you can correct before
              anything else happens.
            </p>
            <textarea
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              rows={9}
              placeholder={'1. Tell us about your organisation (max 300 words)\n2. What do you want to do with this funding? (max 500 words)\n3. Who will benefit, and how do you know they need it?\n…'}
              style={{ ...inputStyle(), resize: 'vertical', lineHeight: 1.6, fontSize: 13.5 }}
            />
            {/* Outline / EOI mode — for portal-gated forms, EOI-first funders,
                and letter-style applications where there is nothing to paste. */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
              <p style={{ fontFamily: BODY, fontSize: 12.5, color: T.textSecondary, margin: '0 0 8px', lineHeight: 1.5 }}>
                No questions to paste? Many funders gate their form behind a portal or ask for a
                project outline first. Start from a standard outline instead, six sections every
                funder expects.
              </p>
              <button
                onClick={() => {
                  setQuestions(OUTLINE_TEMPLATE.map(q => ({ ...q })))
                  setError(null)
                  setStep('confirm')
                }}
                style={{
                  fontFamily: UI, fontWeight: 600, fontSize: 13, color: T.textPrimary,
                  background: T.white, border: `1px solid ${T.textPrimary}`, padding: '8px 16px',
                  borderRadius: 8, cursor: 'pointer',
                }}
              >
                Start from a standard outline
              </button>
            </div>
          </div>

          {error && (
            <p style={{ fontFamily: BODY, fontSize: 13.5, color: T.coralText, margin: 0 }}>{error}</p>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleParse} disabled={parsing} style={forestBtn(parsing)}>
              {parsing ? 'Reading the questions…' : 'Continue'}
            </button>
          </div>
        </div>
      )}

      {step === 'confirm' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: '20px 24px' }}>
            <h2 style={{ fontFamily: UI, fontWeight: 600, fontSize: 16, color: T.textPrimary, margin: '0 0 4px' }}>
              {questions.length} {questions.length === 1 ? 'question' : 'questions'} found, check them over
            </h2>
            <p style={{ fontFamily: BODY, fontSize: 13, color: T.textSecondary, margin: '0 0 16px', lineHeight: 1.55 }}>
              Fix anything the parser got wrong, including word limits, then build. Word limits the
              funder stated in characters are shown as approximate words.
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
                <div key={i} style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{
                      fontFamily: UI, fontWeight: 700, fontSize: 12, color: T.sage, background: T.paleGreen,
                      width: 24, height: 24, borderRadius: 999, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', flexShrink: 0, marginTop: 4,
                    }}>
                      {i + 1}
                    </span>
                    <textarea
                      value={q.question_text}
                      onChange={e => updateQuestion(i, { question_text: e.target.value })}
                      rows={Math.min(4, Math.max(1, Math.ceil(q.question_text.length / 90)))}
                      style={{ ...inputStyle(), border: 'none', padding: '4px 0', resize: 'vertical', lineHeight: 1.5, fontSize: 14 }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <input
                        type="number"
                        value={q.word_limit ?? ''}
                        onChange={e => updateQuestion(i, { word_limit: e.target.value ? Number(e.target.value) : null })}
                        placeholder="none"
                        aria-label="Word limit"
                        style={{ ...inputStyle(), width: 76, padding: '6px 8px', fontSize: 13, textAlign: 'center' }}
                      />
                      <span style={{ fontFamily: UI, fontSize: 11.5, color: T.textTertiary }}>words</span>
                      <button
                        onClick={() => setQuestions(qs => qs.filter((_, j) => j !== i))}
                        aria-label="Remove question"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: T.textTertiary, padding: 4 }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
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
            <button onClick={handleCreate} disabled={creating} style={primaryBtn(creating)}>
              {creating ? 'Setting up…' : 'Looks right, build the scaffolds'}
            </button>
            <button onClick={() => { setStep('setup'); setError(null) }} style={ghostBtn()}>
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
