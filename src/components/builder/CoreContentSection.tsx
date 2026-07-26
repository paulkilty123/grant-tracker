'use client'

// Reusable content bank — profile-page section (builder v0, spec B7.2).
// The org's library of application-ready content blocks. Every banked answer
// from the application builder lands here, so the bank grows through use.
// Styling mirrors the profile page's card sections (T tokens, UI/BODY fonts).

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, BookOpen, X as XIcon, Upload } from 'lucide-react'
import {
  getCoreContent, createCoreContentBlock, updateCoreContentBlock, deleteCoreContentBlock,
} from '@/lib/builder/core-content'
import ImportApplicationModal from '@/components/builder/ImportApplicationModal'
import { BLOCK_TYPES, BLOCK_TYPE_LABELS, type BlockType, type CoreContentBlock } from '@/lib/builder/types'

const T = {
  lime:          '#8ECB3C' /* eslint-disable-line no-restricted-syntax -- RETIRED lime (#8ECB3C) — button-hierarchy redesign, not a token rename */,
  greenDeep:     'var(--deep)',
  greenMid:      'var(--sage-deep)',
  cream:         'var(--surface-sunken)',
  paleGreen:     'var(--state-success-pale)',
  white:         'var(--surface-card)',
  textPrimary:   'var(--text-body)',
  textSecondary: 'var(--text-muted)',
  textTertiary:  'var(--text-subtle)',
  border:        'color-mix(in srgb, var(--deep) 8%, transparent)',
  greenBg:       'var(--type-inkind-pale)',
  greenText:     'var(--state-success)',
}
const UI   = 'var(--font-space-grotesk)'
const BODY = 'var(--font-dm-sans)'

const SOURCE_LABELS: Record<CoreContentBlock['source'], string> = {
  user_entered:              'Added by you',
  banked_from_application:   'Saved from an application',
  extracted_from_profile:    'From your profile',
  imported_from_application: 'Imported from a past application',
}

function inputStyle(): React.CSSProperties {
  return {
    fontFamily: BODY, fontSize: 14, color: T.textPrimary,
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: `1px solid color-mix(in srgb, var(--deep) 16%, transparent)`, background: T.white, outline: 'none',
  }
}

export default function CoreContentSection({ orgId }: { orgId: string }) {
  const [blocks, setBlocks] = useState<CoreContentBlock[]>([])
  const [loaded, setLoaded] = useState(false)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [draftType, setDraftType] = useState<BlockType>('mission')
  const [draftTitle, setDraftTitle] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Import a previous application — shared modal; blocks land in this library.
  const [importOpen, setImportOpen] = useState(false)

  async function refreshAfterImport() {
    try {
      const refreshed = await getCoreContent(orgId)
      setBlocks(refreshed)
    } catch { /* next visit reloads */ }
  }

  useEffect(() => {
    getCoreContent(orgId)
      .then(b => { setBlocks(b); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [orgId])

  function startNew() {
    setDraftType('mission'); setDraftTitle(''); setDraftContent('')
    setError(null); setEditingId('new')
  }
  function startEdit(b: CoreContentBlock) {
    setDraftType(b.block_type); setDraftTitle(b.title); setDraftContent(b.content)
    setError(null); setEditingId(b.id)
  }
  function cancel() { setEditingId(null); setError(null) }

  async function save() {
    if (!draftTitle.trim() || !draftContent.trim()) {
      setError('Add a title and some content before saving'); return
    }
    setSaving(true); setError(null)
    try {
      if (editingId === 'new') {
        const created = await createCoreContentBlock({
          org_id: orgId, block_type: draftType,
          title: draftTitle.trim(), content: draftContent.trim(),
        })
        setBlocks(prev => [...prev, created])
      } else if (editingId) {
        await updateCoreContentBlock(editingId, {
          block_type: draftType, title: draftTitle.trim(), content: draftContent.trim(),
        })
        setBlocks(prev => prev.map(b => b.id === editingId
          ? { ...b, block_type: draftType, title: draftTitle.trim(), content: draftContent.trim() }
          : b))
      }
      setEditingId(null)
    } catch {
      setError('Save failed, please try again')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    setBlocks(prev => prev.filter(b => b.id !== id))
    try { await deleteCoreContentBlock(id) } catch { /* optimistic; reload on next visit */ }
  }

  const editorOpen = editingId !== null

  return (
    <section id="card-content-bank" style={{
      background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '18px 24px 6px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BookOpen size={17} color={T.greenMid} />
            <h2 style={{ fontFamily: UI, fontWeight: 600, fontSize: 17, color: T.textPrimary, letterSpacing: '-0.01em' }}>
              Your material
            </h2>
            {blocks.length > 0 && (
              <span style={{ fontFamily: UI, fontWeight: 500, fontSize: 12, color: T.greenText, background: T.greenBg, padding: '2px 9px', borderRadius: 999 }}>
                {blocks.length} {blocks.length === 1 ? 'block' : 'blocks'}
              </span>
            )}
          </div>
          <p style={{ fontFamily: BODY, fontSize: 13, color: T.textSecondary, margin: '6px 0 0', lineHeight: 1.55, maxWidth: 520 }}>
            Application-ready content in your own words. We map it into your question guides, and
            answers you save from finished applications land here, so every application makes
            the next one easier.
          </p>
        </div>
        {!editorOpen && !importOpen && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => setImportOpen(true)}
              style={{
                fontFamily: UI, fontWeight: 600, fontSize: 13, color: T.textPrimary,
                background: T.white, border: `1px solid ${T.textPrimary}`, padding: '7px 14px',
                borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
              }}
            >
              <Upload size={14} /> Import a past application
            </button>
            <button
              onClick={startNew}
              style={{
                fontFamily: UI, fontWeight: 600, fontSize: 13, color: T.textPrimary,
                background: T.white, border: `1px solid ${T.textPrimary}`, padding: '7px 14px',
                borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
              }}
            >
              <Plus size={14} /> Add block
            </button>
          </div>
        )}
      </div>

      {/* Import modal — shared with the application workspace */}
      {importOpen && (
        <ImportApplicationModal
          orgId={orgId}
          onClose={() => setImportOpen(false)}
          onImported={() => refreshAfterImport()}
        />
      )}

      {/* Body */}
      <div style={{ padding: '14px 24px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Editor */}
        {editorOpen && (
          <div style={{ background: T.paleGreen, borderRadius: 10, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '0 0 220px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontFamily: UI, fontSize: 12.5, fontWeight: 600, color: T.textSecondary }}>Type</label>
                <select
                  value={draftType}
                  onChange={e => setDraftType(e.target.value as BlockType)}
                  style={{ ...inputStyle(), cursor: 'pointer' }}
                >
                  {BLOCK_TYPES.map(t => <option key={t} value={t}>{BLOCK_TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontFamily: UI, fontSize: 12.5, fontWeight: 600, color: T.textSecondary }}>Title</label>
                <input
                  value={draftTitle}
                  onChange={e => setDraftTitle(e.target.value)}
                  placeholder="e.g. Our after-school programme, 2025 impact figures"
                  style={inputStyle()}
                />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontFamily: UI, fontSize: 12.5, fontWeight: 600, color: T.textSecondary }}>Content</label>
              <textarea
                value={draftContent}
                onChange={e => setDraftContent(e.target.value)}
                rows={6}
                placeholder="Write it once, in your own words, with the real numbers. We quote this verbatim, we never rewrite you."
                style={{ ...inputStyle(), resize: 'vertical', lineHeight: 1.6 }}
              />
            </div>
            {error && <p style={{ fontFamily: BODY, fontSize: 13, color: 'var(--state-error)', margin: 0 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={save}
                disabled={saving}
                style={{
                  fontFamily: UI, fontWeight: 600, fontSize: 13.5, color: T.greenDeep,
                  background: T.lime, border: 'none', padding: '9px 18px', borderRadius: 8,
                  cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Saving…' : editingId === 'new' ? 'Save block' : 'Save changes'}
              </button>
              <button
                onClick={cancel}
                style={{
                  fontFamily: UI, fontWeight: 500, fontSize: 13.5, color: T.textSecondary,
                  background: 'transparent', border: 'none', padding: '9px 12px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                <XIcon size={14} /> Cancel
              </button>
            </div>
          </div>
        )}

        {/* Blocks list */}
        {loaded && blocks.length === 0 && !editorOpen && (
          <div style={{
            background: 'linear-gradient(135deg, var(--surface-page) 0%, var(--surface-sunken) 100%)',
            borderRadius: 10, padding: '20px 22px', textAlign: 'center',
          }}>
            <p style={{ fontFamily: BODY, fontSize: 13.5, color: T.textSecondary, margin: 0, lineHeight: 1.6 }}>
              No material yet. Start with your mission or a programme description, the things
              you find yourself rewriting for every application.
            </p>
          </div>
        )}

        {blocks.map(b => (
          <div key={b.id} style={{
            border: `1px solid ${T.border}`, borderRadius: 10, padding: '13px 16px',
            display: 'flex', alignItems: 'flex-start', gap: 12,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 14, color: T.textPrimary }}>{b.title}</span>
                <span style={{ fontFamily: UI, fontWeight: 500, fontSize: 11, color: T.greenText, background: T.greenBg, padding: '2px 9px', borderRadius: 999 }}>
                  {BLOCK_TYPE_LABELS[b.block_type] ?? b.block_type}
                </span>
                <span style={{ fontFamily: UI, fontWeight: 500, fontSize: 11, color: T.textTertiary }}>
                  {SOURCE_LABELS[b.source]}
                </span>
              </div>
              <p style={{
                fontFamily: BODY, fontSize: 13, color: T.textSecondary, margin: 0, lineHeight: 1.55,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>
                {b.content}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button onClick={() => startEdit(b)} aria-label={`Edit ${b.title}`}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: T.textSecondary, padding: 6, borderRadius: 6 }}>
                <Pencil size={14} />
              </button>
              <button onClick={() => remove(b.id)} aria-label={`Delete ${b.title}`}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: T.textTertiary, padding: 6, borderRadius: 6 }}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
