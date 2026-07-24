'use client'

import { useState, useCallback, useRef } from 'react'
import { saveMatchFeedback, deleteMatchFeedback } from '@/lib/matchFeedback'

const DOWN_CHIPS = [
  { value: 'wrong_size',        label: 'Wrong size' },
  { value: 'wrong_sector',      label: 'Wrong sector' },
  { value: 'wrong_timing',      label: 'Wrong timing' },
  { value: 'eligibility_issue', label: 'Eligibility issue' },
  { value: 'wrong_style',       label: "Doesn't match our style" },
  { value: 'something_else',    label: 'Something else' },
]

const UP_CHIPS = [
  { value: 'right_size',       label: 'Right size' },
  { value: 'right_sector',     label: 'Right sector' },
  { value: 'right_timing',     label: 'Right timing' },
  { value: 'good_eligibility', label: 'Good eligibility fit' },
  { value: 'matches_style',    label: 'Matches our style' },
  { value: 'something_else',   label: 'Something else' },
]

const ThumbUp = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7V10l4.13-8.78a.53.53 0 0 1 .81-.23l2.44 1.95a1 1 0 0 1 .42.97l-.8 3"/>
  </svg>
)

const ThumbDown = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H17v12l-4.13 8.78a.53.53 0 0 1-.81.23l-2.44-1.95a1 1 0 0 1-.42-.97l.8-3"/>
  </svg>
)

interface Props {
  grantId: string
  userId: string
  matchScore: number
  compact?: boolean
  /** Fired when the user taps a direction — 'up' restores a previously-dismissed grant. */
  onDirectionChange?: (dir: 'up' | 'down') => void
  /** Fired when the user clicks "Done — remove this" after a thumbs-down. Pending
   *  reason save is flushed first so reasons captured up to this point are persisted. */
  onDoneAndRemove?: () => void
}

export function MatchFeedbackBlock({ grantId, userId, matchScore, compact = false, onDirectionChange, onDoneAndRemove }: Props) {
  const [direction, setDirection]             = useState<'up' | 'down' | null>(null)
  const [selectedReasons, setSelectedReasons] = useState<string[]>([])
  const [freeText, setFreeText]               = useState('')
  const [showTextInput, setShowTextInput]     = useState(false)
  const [collapsed, setCollapsed]             = useState(false)
  const [showSaved, setShowSaved]             = useState(false)
  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function flashSaved() {
    setShowSaved(true)
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setShowSaved(false), 2000)
  }

  const save = useCallback(async (
    dir: 'up' | 'down',
    reasons: string[],
    text: string,
  ) => {
    if (!userId) return
    await saveMatchFeedback({
      userId,
      grantId,
      direction: dir,
      reasons: reasons.filter(r => r !== 'something_else'),
      freeText: text.trim() || null,
      matchScoreAtTime: matchScore,
    })
    flashSaved()
  }, [userId, grantId, matchScore]) // eslint-disable-line react-hooks/exhaustive-deps

  function scheduleChipSave(dir: 'up' | 'down', reasons: string[], text: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { save(dir, reasons, text) }, 1500)
  }

  async function handleDirectionTap(dir: 'up' | 'down') {
    const isSwitch = direction !== dir
    const nextReasons = isSwitch ? [] : selectedReasons
    const nextText    = isSwitch ? '' : freeText
    if (isSwitch) {
      setSelectedReasons([])
      setFreeText('')
      setShowTextInput(false)
    }
    setDirection(dir)
    onDirectionChange?.(dir)
    await save(dir, nextReasons, nextText)
  }

  function handleChipToggle(value: string) {
    if (!direction) return
    if (value === 'something_else') {
      const next = !showTextInput
      setShowTextInput(next)
      if (!next) {
        setFreeText('')
        scheduleChipSave(direction, selectedReasons, '')
      }
      return
    }
    const next = selectedReasons.includes(value)
      ? selectedReasons.filter(r => r !== value)
      : [...selectedReasons, value]
    setSelectedReasons(next)
    scheduleChipSave(direction, next, freeText)
  }

  function handleTextChange(text: string) {
    setFreeText(text)
    if (!direction) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { save(direction, selectedReasons, text) }, 1500)
  }

  function handleTextBlur() {
    if (!direction || !freeText.trim()) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    save(direction, selectedReasons, freeText)
  }

  async function handleUndo() {
    await deleteMatchFeedback(userId, grantId)
    setDirection(null)
    setSelectedReasons([])
    setFreeText('')
    setShowTextInput(false)
    setCollapsed(false)
    setShowSaved(false)
  }

  // Flush any pending debounced save, then trigger the parent to dismiss the
  // grant card. Used by the "Done — remove this" button on the thumbs-down
  // chip view. Without flushing, a chip the user just tapped could be lost
  // because debounce hadn't fired before unmount.
  async function handleDone() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (direction) {
      await save(direction, selectedReasons, freeText)
    }
    onDoneAndRemove?.()
  }

  const divider: React.CSSProperties = {
    borderTop: '0.5px solid rgba(99,153,34,0.2)',
    marginTop: 12,
    paddingTop: 12,
  }

  // ── Collapsed summary ──────────────────────────────────────────────────
  if (collapsed && direction) {
    const chips = direction === 'up' ? UP_CHIPS : DOWN_CHIPS
    const reasonLabels = chips.filter(c => selectedReasons.includes(c.value)).map(c => c.label)
    const detail = [...reasonLabels, ...(freeText.trim() ? [freeText.trim()] : [])].join(', ')
    const summaryText = direction === 'up'
      ? `You marked this a good match${detail ? `. ${detail}.` : '.'}`
      : `You marked this not for us${detail ? `. ${detail}.` : '.'}`
    return (
      <div style={{ ...divider, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ fontSize: 12.5, color: direction === 'up' ? 'var(--state-success)' : 'var(--state-error)', display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-space-grotesk)', fontWeight: 500 }}>
          {direction === 'up' ? <ThumbUp /> : <ThumbDown />}
          {summaryText}
        </div>
        <button onClick={handleUndo} style={{ background: 'transparent', border: 'none', fontFamily: 'var(--font-space-grotesk)', fontSize: 12.5, color: 'var(--text-subtle)', cursor: 'pointer', textDecoration: 'underline', padding: 0, flexShrink: 0 }}>
          Undo
        </button>
      </div>
    )
  }

  const btnBase: React.CSSProperties = {
    borderRadius: 18, padding: '6px 14px 6px 11px', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontFamily: 'var(--font-space-grotesk)', fontSize: 12.5, fontWeight: 500,
    border: '0.5px solid rgba(99,153,34,0.3)', background: 'white', color: 'var(--state-success)',
  }

  // ── Saved flash microcopy ──────────────────────────────────────────────
  const savedBadge = showSaved ? (
    <span style={{ fontSize: 11.5, color: 'var(--text-subtle)', fontFamily: 'var(--font-space-grotesk)', marginLeft: 8, transition: 'opacity 0.3s', opacity: showSaved ? 1 : 0 }}>
      Saved ✓
    </span>
  ) : null

  // ── Default: no direction chosen ──────────────────────────────────────
  if (!direction) {
    if (compact) {
      return (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => handleDirectionTap('up')} style={btnBase}><ThumbUp /> Good match</button>
          <button onClick={() => handleDirectionTap('down')} style={btnBase}><ThumbDown /> Not for us</button>
        </div>
      )
    }
    return (
      <div style={{ ...divider, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: 'var(--state-success)', fontFamily: 'var(--font-space-grotesk)', fontWeight: 500, display: 'inline-flex', alignItems: 'center' }}>
          Does this look right for you?
          {savedBadge}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => handleDirectionTap('up')} style={btnBase}><ThumbUp /> Good match</button>
          <button onClick={() => handleDirectionTap('down')} style={btnBase}><ThumbDown /> Not for us</button>
        </div>
      </div>
    )
  }

  // ── Direction chosen: updated prompt + chips ───────────────────────────
  const isUp        = direction === 'up'
  const chips       = isUp ? UP_CHIPS : DOWN_CHIPS
  const prompt      = isUp ? 'Nice. What made it work?' : 'Thanks. What made it wrong?'
  const placeholder = isUp ? 'Tell us what else made it work...' : "Tell us what else didn't fit..."

  return (
    <div style={divider}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: 'var(--state-success)', fontFamily: 'var(--font-space-grotesk)', fontWeight: 500, display: 'inline-flex', alignItems: 'center' }}>
          {prompt}
          {savedBadge}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => handleDirectionTap('up')}
            style={{ ...btnBase, background: isUp ? '#8ECB3C' /* eslint-disable-line no-restricted-syntax -- RETIRED lime (#8ECB3C) — button-hierarchy redesign, not a token rename */ : 'white', border: isUp ? '0.5px solid #8ECB3C' : '0.5px solid rgba(99,153,34,0.3)', color: isUp ? 'var(--deep)' : 'var(--state-success)' }}
          >
            <ThumbUp /> Good match
          </button>
          <button
            onClick={() => handleDirectionTap('down')}
            style={{ ...btnBase, background: !isUp ? 'var(--state-error-pale)' : 'white', border: !isUp ? '0.5px solid var(--terra)' : '0.5px solid rgba(99,153,34,0.3)', color: !isUp ? 'var(--state-error)' : 'var(--state-success)' }}
          >
            <ThumbDown /> Not for us
          </button>
        </div>
      </div>

      {!isUp && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-subtle)', fontFamily: 'var(--font-space-grotesk)' }}>
          Captured. Tap a reason below so we can show fewer like this.
        </div>
      )}

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid rgba(99,153,34,0.2)' }}>
        <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 12.5, color: 'var(--state-success)', fontWeight: 500, marginBottom: 10 }}>
          Tap any that apply
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {chips.map(chip => {
            const isSelected = chip.value === 'something_else' ? showTextInput : selectedReasons.includes(chip.value)
            return (
              <button
                key={chip.value}
                onClick={() => handleChipToggle(chip.value)}
                style={{
                  background: isSelected ? 'var(--deep)' : 'white',
                  border: `0.5px solid ${isSelected ? 'var(--deep)' : 'color-mix(in srgb, var(--deep) 14%, transparent)'}`,
                  borderRadius: 18, padding: '5px 12px',
                  fontFamily: 'var(--font-space-grotesk)', fontSize: 12, fontWeight: 500,
                  color: isSelected ? 'white' : 'var(--text-body)', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center',
                  gap: chip.value === 'something_else' ? 5 : 0,
                }}
              >
                {chip.value === 'something_else' && (
                  <span style={{ opacity: isSelected ? 1 : 0.5, fontWeight: 400, fontSize: 14, lineHeight: 1 }}>+</span>
                )}
                {chip.label}
              </button>
            )
          })}
        </div>

        {showTextInput && (
          <div style={{ marginTop: 10 }}>
            <textarea
              placeholder={placeholder}
              value={freeText}
              onChange={e => handleTextChange(e.target.value)}
              onBlur={handleTextBlur}
              rows={2}
              style={{
                width: '100%', boxSizing: 'border-box',
                border: '0.5px solid rgba(99,153,34,0.3)', borderRadius: 10,
                padding: '10px 14px', fontFamily: 'var(--font-dm-sans)', fontSize: 13,
                color: 'var(--text-body)', background: 'white', resize: 'vertical',
                lineHeight: 1.5, outline: 'none',
              }}
            />
          </div>
        )}

        {/* Dismiss button. Only on thumbs-down. Label adapts based on whether
            the user has supplied any reasons — "Skip and remove" when the
            chip + free-text state is empty (lowers friction for impatient
            users), "Save and remove" once at least one reason or free-text
            character is present (signals reasons are captured). */}
        {!isUp && onDoneAndRemove && (() => {
          const hasReasons   = selectedReasons.length > 0 || freeText.trim().length > 0
          const buttonLabel  = hasReasons ? 'Save and remove' : 'Skip and remove'
          return (
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleDone}
                style={{
                  background: 'var(--deep)',
                  color: 'var(--state-success-pale)',
                  border: 'none',
                  borderRadius: 18,
                  padding: '7px 18px',
                  fontFamily: 'var(--font-space-grotesk)',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  letterSpacing: '0.01em',
                }}
              >
                {buttonLabel}
              </button>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
