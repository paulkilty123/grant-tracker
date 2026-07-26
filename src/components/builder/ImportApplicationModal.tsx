'use client'

// Import-a-past-application modal (builder v0.x). Shared by the profile
// content-bank section and the application workspace — the blocks land in the
// same org library either way. Paste -> proposed verbatim blocks -> review
// each -> bank.

import { useState } from 'react'
import { Check, X as XIcon } from 'lucide-react'
import { T, UI, BODY, inputStyle, ghostBtn } from '@/components/builder/tokens'
import { BLOCK_TYPES, BLOCK_TYPE_LABELS, type BlockType } from '@/lib/builder/types'

interface ProposedBlock {
  block_type: BlockType
  title: string
  content: string
  keep: boolean
}

export default function ImportApplicationModal({ orgId, onClose, onImported }: {
  orgId: string
  onClose: () => void
  onImported: (count: number) => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [proposed, setProposed] = useState<ProposedBlock[] | null>(null)

  async function propose() {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/builder/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: text }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data?.error ?? 'Import failed'); return }
      setProposed((data.blocks as Omit<ProposedBlock, 'keep'>[]).map(b => ({ ...b, keep: true })))
    } catch {
      setError('Import failed, please try again')
    } finally {
      setBusy(false)
    }
  }

  async function confirm() {
    if (!proposed) return
    const keep = proposed.filter(b => b.keep)
    if (keep.length === 0) { setError('Keep at least one block, or cancel'); return }
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/builder/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          blocks: keep.map(({ block_type, title, content }) => ({ block_type, title, content })),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data?.error ?? 'Could not add the blocks'); return }
      onImported(keep.length)
      onClose()
    } catch {
      setError('Could not add the blocks, please try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{
          background: T.white, borderRadius: 12, padding: '22px 24px', width: '100%', maxWidth: 640,
          maxHeight: '86vh', overflowY: 'auto', boxShadow: '0 16px 64px color-mix(in srgb, var(--text-body) 18%, transparent)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h3 style={{ fontFamily: UI, fontWeight: 600, fontSize: 16.5, color: T.textPrimary, margin: 0 }}>
            Import a previous application
          </h3>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textTertiary }}>
            <XIcon size={16} />
          </button>
        </div>

        {!proposed ? (
          <>
            <p style={{ fontFamily: BODY, fontSize: 13, color: T.textSecondary, margin: '0 0 14px', lineHeight: 1.55 }}>
              Paste the written answers from a past application. They get split into reusable
              blocks, in your words exactly as you wrote them, and you review every block before
              it is added to your material. Guides and drafts then build from what you really wrote.
            </p>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={10}
              placeholder="Paste the application text here, answers and all…"
              style={{ ...inputStyle(), resize: 'vertical', lineHeight: 1.6, fontSize: 13.5, marginBottom: 12 }}
            />
            {error && <p style={{ fontFamily: BODY, fontSize: 13, color: T.coralText, margin: '0 0 10px' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={propose} disabled={busy} style={{
                fontFamily: UI, fontWeight: 600, fontSize: 13.5, color: 'var(--state-success-pale)',
                background: T.greenDeep, border: 'none', padding: '9px 18px', borderRadius: 8,
                cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
              }}>
                {busy ? 'Splitting into blocks…' : 'Continue'}
              </button>
              <button onClick={onClose} style={ghostBtn()}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontFamily: UI, fontWeight: 600, fontSize: 14, color: T.textPrimary, margin: '0 0 10px' }}>
              {proposed.filter(b => b.keep).length} of {proposed.length} blocks selected, check them over
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {proposed.map((b, i) => (
                <div key={i} style={{
                  background: T.paleGreen, borderRadius: 8, padding: '11px 13px',
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                  opacity: b.keep ? 1 : 0.45,
                }}>
                  <button
                    onClick={() => setProposed(ps => ps!.map((p, j) => j === i ? { ...p, keep: !p.keep } : p))}
                    aria-label={b.keep ? 'Exclude block' : 'Include block'}
                    style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 2,
                      border: `1.5px solid ${T.greenMid}`,
                      background: b.keep ? T.greenMid : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    }}
                  >
                    {b.keep && <Check size={13} color="var(--surface-card)" />}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                      <input
                        value={b.title}
                        onChange={e => setProposed(ps => ps!.map((p, j) => j === i ? { ...p, title: e.target.value } : p))}
                        style={{ fontFamily: UI, fontWeight: 600, fontSize: 13.5, color: T.textPrimary, border: 'none', background: 'transparent', outline: 'none', flex: 1, minWidth: 140 }}
                      />
                      <select
                        value={b.block_type}
                        onChange={e => setProposed(ps => ps!.map((p, j) => j === i ? { ...p, block_type: e.target.value as BlockType } : p))}
                        style={{ fontFamily: UI, fontSize: 11.5, color: T.greenText, background: T.greenBg, border: 'none', borderRadius: 999, padding: '3px 8px', cursor: 'pointer' }}
                      >
                        {BLOCK_TYPES.map(t => <option key={t} value={t}>{BLOCK_TYPE_LABELS[t]}</option>)}
                      </select>
                    </div>
                    <p style={{
                      fontFamily: BODY, fontSize: 12.5, color: T.textSecondary, margin: 0, lineHeight: 1.5,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                      {b.content}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {error && <p style={{ fontFamily: BODY, fontSize: 13, color: T.coralText, margin: '0 0 10px' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={confirm} disabled={busy} style={{
                fontFamily: UI, fontWeight: 600, fontSize: 13.5, color: T.greenDeep,
                background: T.lime, border: 'none', padding: '9px 18px', borderRadius: 8,
                cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
              }}>
                {busy ? 'Adding…' : `Add ${proposed.filter(b => b.keep).length} blocks to your material`}
              </button>
              <button onClick={() => setProposed(null)} style={ghostBtn()}>Back</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
