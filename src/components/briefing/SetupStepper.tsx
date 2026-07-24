'use client'

// First-run setup stepper (design spec §3.2 amendment) — replaces the pure
// conversational SetupExperience for the guided path. Form for facts,
// conversation for judgment: steps 1-3 collect target/purposes/in-motion
// entirely as structured input and never touch the model, so the F1
// amounts-first bug class is impossible to construct here, not just
// prompted against. Step 4 (recommendation) stays conversational in voice —
// full adviser-voice reasoning, chip-based refinement questions — but even
// its final write is a direct Server Action on Confirm, not a synthesized
// chat message.
//
// "Type instead" on every step drops into the unchanged SetupExperience
// (conversational) flow, seeding whatever's been entered so far into the
// thread as a real user/assistant exchange (see actions.ts) so the model
// sees it on the next turn rather than the user repeating themselves.

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import SetupExperience, { type OrgSummary } from './SetupExperience'
import DurationDatePicker from './DurationDatePicker'
import { recommendMixAction, setFundingGoalAction, addPreExistingRowAction, seedFreeformContextAction } from '@/app/dashboard/briefing/actions'
import type { RecommendMixPayload, MixComponent } from '@/lib/agent/tools/mix'
import type { PurposeInput, PurposeCategory } from '@/lib/agent/tools/goal'
import { COLOR, grotesk, gbp, fmtDate, mixColor, cap, CompanionMark, SectionLabel } from './ui'

type StepKey = 'target' | 'purposes' | 'inmotion' | 'recommend'
const STEP_ORDER: StepKey[] = ['target', 'purposes', 'inmotion', 'recommend']

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function parseAmount(raw: string): number | null {
  const n = Number(raw.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

// ── purposes step vocabulary ─────────────────────────────────────────────────

interface CategoryChipDef { key: PurposeCategory; label: string; placeholder: string }
const CATEGORY_CHIPS: CategoryChipDef[] = [
  { key: 'core', label: 'Core running costs', placeholder: 'e.g. Core running costs' },
  { key: 'programme', label: 'A programme', placeholder: 'e.g. Youth after-school club' },
  { key: 'staffing', label: 'A post', placeholder: 'e.g. Youth worker, 1.0 FTE' },
  { key: 'capital', label: 'Equipment or building', placeholder: 'e.g. Minibus' },
  { key: 'capacity', label: 'Strengthening the org', placeholder: 'e.g. Fundraising strategy' },
  { key: 'other', label: 'Something else', placeholder: 'What is it?' },
]

// A purpose ROW, not a per-category slot — every category supports any number
// of rows (a real org has several programmes), so a chip click always adds a
// new row rather than toggling a single one on/off.
interface PurposeRowEntry { id: string; category: PurposeCategory; label: string; amount: string; refinement: string | null }

const STAFFING_OPTIONS = [
  { value: 'delivery post', label: 'Delivering programmes' },
  { value: 'organisational', label: 'Running the organisation' },
  { value: 'a bit of both', label: 'A mix of both' },
]
const CAPACITY_OPTIONS = [
  { value: 'finance', label: 'Finance' },
  { value: 'digital', label: 'Digital' },
  { value: 'governance', label: 'Governance' },
  { value: 'fundraising', label: 'Fundraising' },
  { value: 'hr', label: 'HR and people' },
  { value: 'marketing', label: 'Marketing and communications' },
  { value: 'operations', label: 'Operations' },
  { value: 'evaluation', label: 'Evaluation and impact' },
]

const OPPORTUNITY_LABELS: Record<string, string> = { programme: 'programmes', in_kind: 'in-kind support', investment: 'investment' }

const WHY_UNRESTRICTED_COPY =
  "Unrestricted funding carries no strings to a specific project or cost, so you decide where it goes. It typically covers whatever the organisation needs most, from rent to a shortfall in a delivery budget. It is usually the hardest funding to win, because most funders prefer to back one clearly defined activity, but every pound goes further because it is not tied to one purpose."

interface InMotionDraft { id: string; name: string; amount: string; status: 'confirmed' | 'expected' }

// ── small shared bits ────────────────────────────────────────────────────────

function StepDots({ active, total }: { active: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => {
        const pos = i + 1
        return (
          <div key={i} style={{
            height: 6,
            width: pos === active ? 18 : 6,
            borderRadius: 999,
            background: pos < active ? COLOR.secured : pos === active ? COLOR.sage : COLOR.hair,
            transition: 'all 250ms ease',
          }} />
        )
      })}
    </div>
  )
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="text-xs mb-3 inline-flex items-center gap-1"
      style={{ ...grotesk, color: COLOR.mid, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
      ← Back
    </button>
  )
}

function PoundInput({ value, onChange, placeholder = '0' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <span className="absolute pointer-events-none" style={{ left: 10, top: '50%', transform: 'translateY(-50%)', color: COLOR.faint, fontSize: 13 }}>£</span>
      <input
        type="text" inputMode="numeric" value={value}
        onChange={e => onChange(e.target.value.replace(/[^\d]/g, ''))}
        placeholder={placeholder}
        className="text-sm rounded-lg outline-none w-full"
        style={{ height: 38, border: `1px solid ${COLOR.hair}`, padding: '0 10px 0 22px', color: COLOR.ink, boxSizing: 'border-box' }}
      />
    </div>
  )
}

function PrimaryButton({ children, onClick, disabled, busy }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; busy?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled || busy}
      className="text-sm font-semibold px-5 py-2.5 rounded-lg disabled:opacity-50"
      style={{ ...grotesk, background: COLOR.lime, color: COLOR.forest, border: 'none', cursor: (disabled || busy) ? 'not-allowed' : 'pointer' }}>
      {busy ? 'One moment…' : children}
    </button>
  )
}

function GhostButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-50"
      style={{ ...grotesk, background: 'var(--surface-card)', color: COLOR.ink, border: `1px solid ${COLOR.ink}`, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      {children}
    </button>
  )
}

/** A card in the assembling panel — briefing/plan card grammar (white, hair
 *  border, rounded-xl) rather than one flat beige block. */
function PanelCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl p-3.5" style={{ border: `1px solid ${COLOR.hair}` }}>
      {children}
    </div>
  )
}

function buildSoFarSummary(opts: {
  targetAmount: string
  endDate: string | null
  purposeRows: PurposeRowEntry[]
  inMotion: InMotionDraft[]
}): string {
  const lines: string[] = []
  const target = parseAmount(opts.targetAmount)
  if (target && opts.endDate) lines.push(`- Target: ${gbp(target)} by ${fmtDate(opts.endDate)}`)
  else if (target) lines.push(`- Target amount: ${gbp(target)} (no deadline set yet)`)
  for (const row of opts.purposeRows) {
    const amt = parseAmount(row.amount)
    if (row.label && amt) lines.push(`- ${row.label} (${cap(row.category)}): about ${gbp(amt)}`)
  }
  for (const row of opts.inMotion) {
    const amt = parseAmount(row.amount)
    if (row.name && amt) lines.push(`- Already in motion: ${row.name}, ${gbp(amt)} (${row.status})`)
  }
  return lines.length ? lines.join('\n') : 'Nothing yet, just getting started.'
}

// ── main component ────────────────────────────────────────────────────────────

export default function SetupStepper({ org }: { org: OrgSummary }) {
  const router = useRouter()
  const [step, setStep] = useState<StepKey>('target')
  const [freeform, setFreeform] = useState(false)

  // step 1 — target
  const [targetAmount, setTargetAmount] = useState('')
  const [endDate, setEndDate] = useState<string | null>(null)

  // step 2 — purposes (one row PER PURPOSE, not per category — a category can
  // repeat any number of times)
  const [purposeRows, setPurposeRows] = useState<PurposeRowEntry[]>([])
  // free text, shared with the recommendation step — one field, editable from
  // either place, not two separate asks (spec §4 B8: nothing a user wanted to
  // say should get lost between the structured steps and the model).
  const [contextText, setContextText] = useState('')

  // step 3 — already in motion
  const [inMotion, setInMotion] = useState<InMotionDraft[]>([])
  const [submittingInMotion, setSubmittingInMotion] = useState(false)
  // Row ids already written to the pipeline — visiting step 3 again (BackLink,
  // then forward again) must never re-submit the same row. Found live: no
  // guard here meant a slow click or a back-and-forth wrote the SAME grant 5
  // times, inflating the unweighted pipeline figure app-wide (£600k for one
  // £120k grant).
  const [submittedInMotionIds, setSubmittedInMotionIds] = useState<Set<string>>(new Set())

  // step 4 — recommendation
  const [mix, setMix] = useState<RecommendMixPayload | null>(null)
  const [mixLoading, setMixLoading] = useState(false)
  const [skippedClarify, setSkippedClarify] = useState<Set<string>>(new Set())
  const [clarifySelections, setClarifySelections] = useState<string[]>([]) // capacity multi-select working state
  const [clarifyOtherText, setClarifyOtherText] = useState('')
  const [staffingFreeTextMode, setStaffingFreeTextMode] = useState(false)
  const [whyOpen, setWhyOpen] = useState(false)
  const [constraintsText, setConstraintsText] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<{ label: string; amount: string }>({ label: '', amount: '' })
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState<{ warning: string | null } | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  function purposesInput(): PurposeInput[] {
    return purposeRows.map(r => ({ category: r.category, label: r.label.trim(), approx_amount: parseAmount(r.amount), refinement: r.refinement }))
  }

  async function refreshMix(purposes: PurposeInput[]) {
    setMixLoading(true)
    try {
      const payload = await recommendMixAction(purposes)
      setMix(payload)
    } catch {
      setErrorMsg("Couldn't work out a recommended mix. Please try again.")
    } finally {
      setMixLoading(false)
    }
  }

  // A chip click always ADDS another row of that category — it never toggles
  // a category off. Removing happens per-row (the × on that row).
  function addPurposeRow(cat: PurposeCategory) {
    setPurposeRows(prev => [...prev, { id: newId(), category: cat, label: '', amount: '', refinement: null }])
  }
  function updatePurposeRow(id: string, patch: Partial<PurposeRowEntry>) {
    setPurposeRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }
  function removePurposeRow(id: string) {
    setPurposeRows(prev => prev.filter(r => r.id !== id))
  }

  const targetNum = parseAmount(targetAmount) ?? 0
  const allocatedSum = purposeRows.reduce((s, r) => s + (parseAmount(r.amount) ?? 0), 0)
  const unallocated = targetNum - allocatedSum

  const targetValid = parseAmount(targetAmount) !== null && !!endDate
  const purposesValid = purposeRows.length > 0 && purposeRows.every(r => r.label.trim().length > 0 && parseAmount(r.amount) !== null)

  function goToPurposesFromTarget() {
    setStep('purposes')
  }

  function goToInMotionFromPurposes() {
    setStep('inmotion')
    void refreshMix(purposesInput()) // kicks off in the background (spec: "the moment step 2 completes")
  }

  async function goToRecommendFromInMotion() {
    if (submittingInMotion) return
    setSubmittingInMotion(true)
    setErrorMsg(null)
    try {
      const valid = inMotion.filter(r => !submittedInMotionIds.has(r.id) && r.name.trim() && parseAmount(r.amount) !== null)
      if (valid.length) {
        await Promise.all(valid.map(r => addPreExistingRowAction({ name: r.name.trim(), amount: parseAmount(r.amount)!, status: r.status })))
        setSubmittedInMotionIds(prev => {
          const next = new Set(prev)
          valid.forEach(r => next.add(r.id))
          return next
        })
      }
      setStep('recommend')
    } catch {
      setErrorMsg("Couldn't save what's already in motion. Please try again.")
    } finally {
      setSubmittingInMotion(false)
    }
  }

  function addInMotionRow() {
    setInMotion(prev => [...prev, { id: newId(), name: '', amount: '', status: 'expected' }])
  }
  function removeInMotionRow(id: string) {
    setInMotion(prev => prev.filter(r => r.id !== id))
  }

  const openClarify = mix?.components.find(c => c.clarify && !skippedClarify.has(c.category + '::' + c.label)) ?? null
  const openClarifyKey = openClarify ? openClarify.category + '::' + openClarify.label : null

  // Fresh working state for whichever clarify question is currently open —
  // otherwise a capacity multi-select would carry over into the next question.
  useEffect(() => {
    setClarifySelections([])
    setClarifyOtherText('')
    setStaffingFreeTextMode(false)
  }, [openClarifyKey])

  function toggleClarifySelection(v: string) {
    setClarifySelections(prev => (prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]))
  }

  // Matches a mix component back to its source row by category+label (labels
  // are user-authored per row and expected to be distinct within a category).
  async function answerClarify(category: string, label: string, value: string) {
    const cat = category as PurposeCategory
    setPurposeRows(prev => prev.map(r => (r.category === cat && r.label === label ? { ...r, refinement: value } : r)))
    const updated = purposesInput().map(p => (p.category === category && p.label === label ? { ...p, refinement: value } : p))
    await refreshMix(updated)
  }
  function skipClarify(category: string, label: string) {
    setSkippedClarify(prev => new Set(prev).add(category + '::' + label))
  }

  function startEditComponent(i: number, c: MixComponent) {
    setEditingIndex(i)
    setEditDraft({ label: c.label, amount: c.approx_amount != null ? String(c.approx_amount) : '' })
  }
  async function saveEditComponent(c: MixComponent) {
    const newLabel = editDraft.label.trim()
    const newAmountStr = editDraft.amount
    const newAmount = parseAmount(newAmountStr)
    setPurposeRows(prev => prev.map(r => (r.category === c.category && r.label === c.label ? { ...r, label: newLabel, amount: newAmountStr } : r)))
    const updated = purposesInput().map(p => (p.category === c.category && p.label === c.label ? { ...p, label: newLabel, approx_amount: newAmount } : p))
    setEditingIndex(null)
    await refreshMix(updated)
  }

  async function handleConfirm() {
    if (!mix) return
    setConfirming(true)
    setErrorMsg(null)
    try {
      const target = parseAmount(targetAmount)!
      const constraints: Array<{ kind: string; text: string }> = []
      if (constraintsText.trim()) constraints.push({ kind: 'user_stated', text: constraintsText.trim() })
      if (contextText.trim()) constraints.push({ kind: 'context', text: contextText.trim() })
      const result = await setFundingGoalAction({
        title: `Raise ${gbp(target)} by ${fmtDate(endDate) ?? endDate}`,
        target_amount: target,
        start_date: todayIso(),
        end_date: endDate!,
        mix_targets: (mix.recommended_mix as Record<string, number> | null) ?? null,
        purposes: purposesInput(),
        constraints: constraints.length ? constraints : undefined,
      })
      setConfirmed({ warning: result.purposes_reconciliation_warning })
    } catch {
      setErrorMsg("Couldn't set up your plan. Please try again.")
    } finally {
      setConfirming(false)
    }
  }

  async function switchToFreeform() {
    const summary = buildSoFarSummary({ targetAmount, endDate, purposeRows, inMotion })
    void seedFreeformContextAction(summary).catch(() => null)
    setFreeform(true)
  }

  if (freeform) return <SetupExperience org={org} />

  const stepIndex = STEP_ORDER.indexOf(step) + 1

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ ...grotesk, color: COLOR.ink }}>Let&rsquo;s build your funding plan.</h1>
          <p className="mt-1 text-sm" style={{ color: COLOR.mid }}>Four quick steps. Your plan assembles on the right as you answer.</p>
        </div>
        <button type="button" onClick={switchToFreeform}
          className="text-xs underline shrink-0 mt-1" style={{ color: COLOR.sage, background: 'none', border: 'none', cursor: 'pointer' }}>
          Type instead
        </button>
      </div>

      <div className="mt-4"><StepDots active={stepIndex} total={STEP_ORDER.length} /></div>

      <div className="mt-5 grid md:grid-cols-[58%_1fr] gap-4 items-start">
        {/* step column */}
        <div className="bg-white rounded-xl p-5" style={{ border: `1px solid ${COLOR.hair}`, minHeight: 420 }}>
          {errorMsg && <p className="text-xs mb-3" style={{ color: 'var(--terra)' }}>{errorMsg}</p>}

          {step === 'target' && (
            <>
              <h2 className="text-base font-semibold" style={{ ...grotesk, color: COLOR.ink }}>How much do you need to raise, and by when?</h2>
              <div className="mt-4">
                <label className="text-xs font-medium block mb-1.5" style={{ color: COLOR.ink }}>Target amount</label>
                <div style={{ maxWidth: 220 }}><PoundInput value={targetAmount} onChange={setTargetAmount} /></div>
              </div>
              <div className="mt-4">
                <label className="text-xs font-medium block mb-1.5" style={{ color: COLOR.ink }}>Deadline</label>
                <DurationDatePicker value={endDate} onChange={setEndDate} />
              </div>
              <div className="mt-6 flex justify-end">
                <PrimaryButton onClick={goToPurposesFromTarget} disabled={!targetValid}>Continue</PrimaryButton>
              </div>
            </>
          )}

          {step === 'purposes' && (
            <>
              <BackLink onClick={() => setStep('target')} />
              <h2 className="text-base font-semibold" style={{ ...grotesk, color: COLOR.ink }}>What is the money for?</h2>
              <p className="text-xs mt-1" style={{ color: COLOR.faint }}>Add everything that applies — click a category again for another one. Rough amounts are fine, you can refine later.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {CATEGORY_CHIPS.map(c => {
                  const count = purposeRows.filter(r => r.category === c.key).length
                  return (
                    <button key={c.key} type="button" onClick={() => addPurposeRow(c.key)}
                      className="text-sm px-3 py-1.5 rounded-lg"
                      style={{ ...grotesk, border: count > 0 ? `1.5px solid ${COLOR.sage}` : `1px solid ${COLOR.hair}`, background: count > 0 ? COLOR.pale : 'var(--surface-card)', color: count > 0 ? COLOR.sage : COLOR.ink }}>
                      {c.label}{count > 0 ? ` (${count})` : ''}
                    </button>
                  )
                })}
              </div>

              <div className="mt-4 space-y-4">
                {CATEGORY_CHIPS.map(def => {
                  const catRows = purposeRows.filter(r => r.category === def.key)
                  if (catRows.length === 0) return null
                  return (
                    <div key={def.key}>
                      <div className="text-[11px] uppercase tracking-wide mb-1.5" style={{ color: COLOR.faint }}>{def.label}</div>
                      <div className="space-y-2">
                        {catRows.map(row => (
                          <div key={row.id} className="rounded-lg p-3 grid gap-2" style={{ background: COLOR.cream, gridTemplateColumns: '1fr 140px 28px' }}>
                            <input type="text" value={row.label} placeholder={def.placeholder}
                              onChange={e => updatePurposeRow(row.id, { label: e.target.value })}
                              className="text-sm rounded-lg outline-none px-3"
                              style={{ height: 38, border: `1px solid ${COLOR.hair}`, color: COLOR.ink, background: 'var(--surface-card)' }} />
                            <PoundInput value={row.amount} onChange={v => updatePurposeRow(row.id, { amount: v })} />
                            <button type="button" onClick={() => removePurposeRow(row.id)}
                              className="flex items-center justify-center rounded-md" style={{ width: 28, height: 28, background: 'var(--surface-card)', border: `1px solid ${COLOR.hair}`, color: COLOR.mid, cursor: 'pointer' }}>
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                      <button type="button" onClick={() => addPurposeRow(def.key)}
                        className="mt-1.5 text-xs underline" style={{ color: COLOR.sage, background: 'none', border: 'none', cursor: 'pointer' }}>
                        + Add another {def.label.toLowerCase()}
                      </button>
                    </div>
                  )
                })}
              </div>

              {targetNum > 0 && purposeRows.length > 0 && (
                <p className="mt-4 text-xs" style={{ color: COLOR.mid }}>
                  {gbp(allocatedSum)} of {gbp(targetNum)} allocated
                  {unallocated > 0 && <> · {gbp(unallocated)} unallocated</>}
                  {unallocated < 0 && <> · {gbp(-unallocated)} over target</>}
                </p>
              )}

              <div className="mt-4">
                <label className="text-xs font-medium block mb-1.5" style={{ color: COLOR.ink }}>
                  Anything else your adviser should know? <span style={{ color: COLOR.faint, fontWeight: 400 }}>optional</span>
                </label>
                <input type="text" value={contextText} onChange={e => setContextText(e.target.value)}
                  placeholder="e.g. we've just lost a major funder, or we're planning a merger"
                  className="text-sm rounded-lg outline-none w-full px-3"
                  style={{ height: 38, border: `1px solid ${COLOR.hair}`, color: COLOR.ink }} />
              </div>

              <div className="mt-6 flex justify-end">
                <PrimaryButton onClick={goToInMotionFromPurposes} disabled={!purposesValid}>Continue</PrimaryButton>
              </div>
            </>
          )}

          {step === 'inmotion' && (
            <>
              <BackLink onClick={() => setStep('purposes')} />
              <h2 className="text-base font-semibold" style={{ ...grotesk, color: COLOR.ink }}>Anything already secured or expected?</h2>
              <p className="text-xs mt-1" style={{ color: COLOR.faint }}>Grants you&rsquo;ve won, applications in flight, likely renewals. Entirely optional.</p>
              <div className="mt-3 space-y-2">
                {inMotion.map(row => (
                  <div key={row.id} className="rounded-lg p-3" style={{ background: COLOR.cream }}>
                    <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 140px 28px' }}>
                      <input type="text" value={row.name} placeholder="e.g. Garfield Weston Foundation"
                        onChange={e => setInMotion(prev => prev.map(r => (r.id === row.id ? { ...r, name: e.target.value } : r)))}
                        className="text-sm rounded-lg outline-none px-3"
                        style={{ height: 38, border: `1px solid ${COLOR.hair}`, color: COLOR.ink, background: 'var(--surface-card)' }} />
                      <PoundInput value={row.amount} onChange={v => setInMotion(prev => prev.map(r => (r.id === row.id ? { ...r, amount: v } : r)))} />
                      <button type="button" onClick={() => removeInMotionRow(row.id)}
                        className="flex items-center justify-center rounded-md" style={{ width: 28, height: 28, background: 'var(--surface-card)', border: `1px solid ${COLOR.hair}`, color: COLOR.mid, cursor: 'pointer' }}>
                        ×
                      </button>
                    </div>
                    <div className="mt-2 flex gap-2">
                      {(['confirmed', 'expected'] as const).map(s => {
                        const sel = row.status === s
                        return (
                          <button key={s} type="button" onClick={() => setInMotion(prev => prev.map(r => (r.id === row.id ? { ...r, status: s } : r)))}
                            className="text-xs px-2.5 py-1 rounded-lg"
                            style={{ ...grotesk, border: sel ? `1.5px solid ${COLOR.sage}` : `1px solid ${COLOR.hair}`, background: sel ? 'var(--surface-card)' : 'transparent', color: sel ? COLOR.sage : COLOR.mid }}>
                            {s === 'confirmed' ? 'Confirmed' : 'Expected'}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addInMotionRow}
                  className="text-xs underline" style={{ color: COLOR.sage, background: 'none', border: 'none', cursor: 'pointer' }}>
                  + Add another
                </button>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <GhostButton onClick={goToRecommendFromInMotion} disabled={submittingInMotion}>Skip</GhostButton>
                <PrimaryButton onClick={goToRecommendFromInMotion} busy={submittingInMotion}>Continue</PrimaryButton>
              </div>
            </>
          )}

          {step === 'recommend' && (
            <>
              <BackLink onClick={() => setStep('inmotion')} />
              {confirmed ? (
                <>
                  <div className="flex items-center gap-2">
                    <CompanionMark size={32} />
                    <SectionLabel>Your plan is set</SectionLabel>
                  </div>
                  {confirmed.warning && (
                    <p className="mt-3 text-sm" style={{ color: COLOR.amberInk }}>{confirmed.warning}</p>
                  )}
                  <button onClick={() => router.refresh()}
                    className="mt-4 text-sm font-semibold px-5 py-2.5 rounded-lg"
                    style={{ ...grotesk, background: COLOR.lime, color: COLOR.forest, border: 'none' }}>
                    See your briefing
                  </button>
                </>
              ) : mixLoading && !mix ? (
                <p className="text-sm" style={{ color: COLOR.faint }}>Working out your recommended mix…</p>
              ) : !mix ? (
                <p className="text-sm" style={{ color: COLOR.faint }}>One moment…</p>
              ) : openClarify ? (
                openClarify.category === 'staffing' ? (
                  <>
                    <h2 className="text-base font-semibold" style={{ ...grotesk, color: COLOR.ink }}>Is this role mainly…</h2>
                    <p className="text-xs mt-1" style={{ color: COLOR.faint }}>About &ldquo;{openClarify.label}&rdquo;. The default split stands if you skip this.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {STAFFING_OPTIONS.map(opt => (
                        <button key={opt.value} type="button"
                          onClick={() => answerClarify(openClarify.category, openClarify.label, opt.value)}
                          className="text-sm px-3 py-1.5 rounded-lg"
                          style={{ ...grotesk, border: `1px solid ${COLOR.hair}`, background: 'var(--surface-card)', color: COLOR.ink }}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {!staffingFreeTextMode ? (
                      <button type="button" onClick={() => setStaffingFreeTextMode(true)}
                        className="mt-2.5 text-xs underline block" style={{ color: COLOR.sage, background: 'none', border: 'none', cursor: 'pointer' }}>
                        This covers more than one role, describe it instead
                      </button>
                    ) : (
                      <div className="mt-2.5 flex gap-2">
                        <input type="text" value={clarifyOtherText} onChange={e => setClarifyOtherText(e.target.value)}
                          placeholder="e.g. two delivery posts and a part-time coordinator"
                          className="text-sm rounded-lg outline-none flex-1 px-3"
                          style={{ height: 38, border: `1px solid ${COLOR.hair}`, color: COLOR.ink }} />
                        <PrimaryButton onClick={() => answerClarify(openClarify.category, openClarify.label, clarifyOtherText.trim())} disabled={!clarifyOtherText.trim()}>Save</PrimaryButton>
                      </div>
                    )}
                    <button type="button" onClick={() => skipClarify(openClarify.category, openClarify.label)}
                      className="mt-3 text-xs underline block" style={{ color: COLOR.faint, background: 'none', border: 'none', cursor: 'pointer' }}>
                      Skip this question
                    </button>
                  </>
                ) : (
                  <>
                    <h2 className="text-base font-semibold" style={{ ...grotesk, color: COLOR.ink }}>Which areas need strengthening?</h2>
                    <p className="text-xs mt-1" style={{ color: COLOR.faint }}>About &ldquo;{openClarify.label}&rdquo;. Select all that apply, then continue.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {CAPACITY_OPTIONS.map(opt => {
                        const sel = clarifySelections.includes(opt.value)
                        return (
                          <button key={opt.value} type="button" onClick={() => toggleClarifySelection(opt.value)}
                            className="text-sm px-3 py-1.5 rounded-lg"
                            style={{ ...grotesk, border: sel ? `1.5px solid ${COLOR.sage}` : `1px solid ${COLOR.hair}`, background: sel ? COLOR.pale : 'var(--surface-card)', color: sel ? COLOR.sage : COLOR.ink }}>
                            {opt.label}
                          </button>
                        )
                      })}
                    </div>
                    <input type="text" value={clarifyOtherText} onChange={e => setClarifyOtherText(e.target.value)}
                      placeholder="Other (optional)"
                      className="mt-2.5 text-sm rounded-lg outline-none w-full px-3"
                      style={{ height: 38, border: `1px solid ${COLOR.hair}`, color: COLOR.ink }} />
                    <div className="mt-3 flex justify-between items-center">
                      <button type="button" onClick={() => skipClarify(openClarify.category, openClarify.label)}
                        className="text-xs underline" style={{ color: COLOR.faint, background: 'none', border: 'none', cursor: 'pointer' }}>
                        Skip this question
                      </button>
                      <PrimaryButton
                        onClick={() => answerClarify(openClarify.category, openClarify.label, [...clarifySelections, clarifyOtherText.trim()].filter(Boolean).join(', '))}
                        disabled={clarifySelections.length === 0 && !clarifyOtherText.trim()}>
                        Continue
                      </PrimaryButton>
                    </div>
                  </>
                )
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <CompanionMark size={32} />
                    <SectionLabel>Your recommended mix</SectionLabel>
                  </div>

                  {mix.recommended_mix && (
                    <>
                      <div className="mt-3 h-4 rounded-full overflow-hidden flex" style={{ background: COLOR.cream }}>
                        {Object.entries(mix.recommended_mix).map(([k, v]) => (
                          <div key={k} style={{ width: `${v}%`, background: mixColor(k) }} title={`${cap(k)} ${v}%`} />
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        {Object.entries(mix.recommended_mix).map(([k, v]) => (
                          <span key={k} style={{ color: COLOR.mid }}>
                            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: mixColor(k), marginRight: 5, verticalAlign: 'middle' }} />
                            {cap(k)} {v}%
                          </span>
                        ))}
                      </div>
                    </>
                  )}

                  <div className="mt-4 space-y-3">
                    {mix.components.map((c, i) => {
                      const editing = editingIndex === i
                      return (
                        <div key={i} className="rounded-lg p-3" style={{ background: COLOR.cream }}>
                          {editing ? (
                            <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 140px' }}>
                              <input type="text" value={editDraft.label} onChange={e => setEditDraft(d => ({ ...d, label: e.target.value }))}
                                className="text-sm rounded-lg outline-none px-3"
                                style={{ height: 36, border: `1px solid ${COLOR.hair}`, color: COLOR.ink, background: 'var(--surface-card)' }} />
                              <PoundInput value={editDraft.amount} onChange={v => setEditDraft(d => ({ ...d, amount: v }))} />
                            </div>
                          ) : (
                            <div className="flex justify-between gap-2 text-sm">
                              <span className="font-semibold" style={{ ...grotesk, color: COLOR.ink }}>{c.label}</span>
                              <span className="flex items-center gap-2" style={{ color: COLOR.faint }}>
                                {c.approx_amount != null && gbp(c.approx_amount)}
                                <button type="button" onClick={() => startEditComponent(i, c)}
                                  className="text-[11px] underline" style={{ color: COLOR.sage, background: 'none', border: 'none', cursor: 'pointer' }}>
                                  Edit
                                </button>
                              </span>
                            </div>
                          )}
                          {editing && (
                            <div className="mt-2 flex gap-2 justify-end">
                              <button type="button" onClick={() => setEditingIndex(null)}
                                className="text-xs px-2.5 py-1 rounded-lg" style={{ ...grotesk, border: `1px solid ${COLOR.hair}`, background: 'var(--surface-card)', color: COLOR.mid }}>
                                Cancel
                              </button>
                              <button type="button" onClick={() => saveEditComponent(c)}
                                className="text-xs font-semibold px-2.5 py-1 rounded-lg" style={{ ...grotesk, background: COLOR.forest, color: COLOR.pale, border: 'none' }}>
                                Save
                              </button>
                            </div>
                          )}
                          {!editing && (c.off_rulebook ? (
                            <p className="mt-1 text-xs" style={{ color: COLOR.faint }}>
                              This one does not map to a standard funding character, so it is not counted in the mix above. Your adviser can help place it, use &ldquo;Type instead&rdquo; to talk it through.
                            </p>
                          ) : (
                            <>
                              <p className="mt-1 text-xs" style={{ color: COLOR.mid }}>{c.reasoning}</p>
                              {c.mapping && (
                                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]" style={{ color: COLOR.mid }}>
                                  {Object.entries(c.mapping).map(([k, v]) => (
                                    <span key={k}>
                                      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 2, background: mixColor(k), marginRight: 4, verticalAlign: 'middle' }} />
                                      {cap(k)} {v}%
                                    </span>
                                  ))}
                                </div>
                              )}
                              {c.recommended_opportunity_types && c.recommended_opportunity_types.length > 0 && (
                                <p className="mt-1 text-[11px]" style={{ color: COLOR.faint }}>
                                  Worth exploring alongside grants: {c.recommended_opportunity_types.map(t => OPPORTUNITY_LABELS[t] ?? t).join(', ')}.
                                </p>
                              )}
                            </>
                          ))}
                        </div>
                      )
                    })}
                  </div>

                  <button type="button" onClick={() => setWhyOpen(o => !o)}
                    className="mt-3 text-xs underline block" style={{ color: COLOR.sage, background: 'none', border: 'none', cursor: 'pointer' }}>
                    Why unrestricted?
                  </button>
                  {whyOpen && <p className="mt-1.5 text-xs" style={{ color: COLOR.mid }}>{WHY_UNRESTRICTED_COPY}</p>}

                  <div className="mt-4">
                    <label className="text-xs font-medium block mb-1.5" style={{ color: COLOR.ink }}>
                      Anything else your adviser should know? <span style={{ color: COLOR.faint, fontWeight: 400 }}>optional</span>
                    </label>
                    <input type="text" value={contextText} onChange={e => setContextText(e.target.value)}
                      placeholder="e.g. we've just lost a major funder, or we're planning a merger"
                      className="text-sm rounded-lg outline-none w-full px-3 mb-2"
                      style={{ height: 38, border: `1px solid ${COLOR.hair}`, color: COLOR.ink }} />
                    <label className="text-xs font-medium block mb-1.5" style={{ color: COLOR.ink }}>
                      Anything to flag, such as a funder to avoid or a location restriction? <span style={{ color: COLOR.faint, fontWeight: 400 }}>optional</span>
                    </label>
                    <input type="text" value={constraintsText} onChange={e => setConstraintsText(e.target.value)}
                      placeholder="e.g. UK-wide funders only"
                      className="text-sm rounded-lg outline-none w-full px-3"
                      style={{ height: 38, border: `1px solid ${COLOR.hair}`, color: COLOR.ink }} />
                  </div>

                  <div className="mt-6 flex justify-end">
                    <PrimaryButton onClick={handleConfirm} busy={confirming}>Confirm and set my plan</PrimaryButton>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* the plan, assembling — briefing/plan card grammar, not one flat block */}
        <div className="space-y-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide" style={{ color: COLOR.faint }}>Your plan, assembling</div>
            <div className="text-sm font-semibold mt-1" style={{ ...grotesk, color: COLOR.ink }}>{org.name}</div>
            <div className="text-[11px] mt-0.5" style={{ color: COLOR.mid }}>
              {[org.structure, org.sectors.slice(0, 3).join(', '), org.incomeBand, org.location].filter(Boolean).join(' · ')}
            </div>
          </div>

          <PanelCard>
            <div className="space-y-2 text-sm" style={{ color: COLOR.ink }}>
              <div className="flex justify-between gap-2">
                <span style={{ color: COLOR.mid }}>Target</span>
                <span className="font-semibold" style={grotesk}>{targetNum > 0 ? gbp(targetNum) : '—'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span style={{ color: COLOR.mid }}>Deadline</span>
                <span className="font-semibold" style={grotesk}>{endDate ? fmtDate(endDate) : '—'}</span>
              </div>
            </div>
          </PanelCard>

          <PanelCard>
            <div className="text-[11px] uppercase tracking-wide" style={{ color: COLOR.faint }}>What the money is for</div>
            {purposeRows.length === 0 ? (
              <div className="text-sm mt-1" style={{ color: COLOR.faint }}>—</div>
            ) : (
              <>
                <ul className="mt-1.5 space-y-1">
                  {purposeRows.map(row => {
                    const amt = parseAmount(row.amount)
                    return (
                      <li key={row.id} className="text-sm flex justify-between gap-2" style={{ color: COLOR.ink }}>
                        <span>{row.label || cap(row.category)}</span>
                        <span style={{ color: COLOR.mid }}>{amt ? gbp(amt) : '—'}</span>
                      </li>
                    )
                  })}
                </ul>
                {targetNum > 0 && (
                  <p className="mt-2 text-[11px]" style={{ color: COLOR.faint }}>
                    {gbp(allocatedSum)} of {gbp(targetNum)} allocated
                    {unallocated > 0 && <> · {gbp(unallocated)} unallocated</>}
                    {unallocated < 0 && <> · {gbp(-unallocated)} over target</>}
                  </p>
                )}
              </>
            )}
          </PanelCard>

          {inMotion.some(r => r.name.trim() && parseAmount(r.amount)) && (
            <PanelCard>
              <div className="text-[11px] uppercase tracking-wide" style={{ color: COLOR.faint }}>Already in motion</div>
              <ul className="mt-1.5 space-y-1">
                {inMotion.filter(r => r.name.trim() && parseAmount(r.amount)).map(r => (
                  <li key={r.id} className="text-sm flex justify-between gap-2" style={{ color: COLOR.ink }}>
                    <span>{r.name}</span>
                    <span style={{ color: COLOR.mid }}>{gbp(parseAmount(r.amount)!)} · {r.status}</span>
                  </li>
                ))}
              </ul>
            </PanelCard>
          )}

          <PanelCard>
            <div className="text-[11px] uppercase tracking-wide" style={{ color: COLOR.faint }}>Recommended mix</div>
            {!mix || !mix.recommended_mix || openClarify ? (
              <div className="text-sm mt-1" style={{ color: COLOR.faint }}>—</div>
            ) : (
              <div className="flex gap-1.5 flex-wrap mt-1.5">
                {Object.entries(mix.recommended_mix).map(([k, v]) => (
                  <span key={k} className="text-[11px] px-2 py-0.5" style={{ background: COLOR.pale, color: COLOR.sage, borderRadius: 999, border: `1px solid ${COLOR.hair}` }}>{cap(k)} {v}%</span>
                ))}
              </div>
            )}
          </PanelCard>
        </div>
      </div>
    </div>
  )
}
