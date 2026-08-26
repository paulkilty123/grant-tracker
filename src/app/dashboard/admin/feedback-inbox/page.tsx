'use client'

/**
 * Feedback inbox — read what people sent through the in-app form, and reply.
 *
 * This exists because /dashboard/feedback now shows the submitter a reply
 * instead of a status chip. The chip it replaced was decoration: four states in
 * the UI, one reachable in the data, because there was no admin surface to move
 * it. A reply column with nowhere to write it would have been the same mistake
 * a second time, so this ships alongside it.
 *
 * A client component so a reply can be written and saved without a round trip
 * through a form action; the admin/layout.tsx gate runs server-side before it
 * renders, and the API it calls re-checks requireAdmin() on every request.
 *
 * Different table from /dashboard/admin/feedback, which is "Match Feedback" —
 * the thumbs up/down on individual grants.
 */

import { useState, useEffect, useCallback } from 'react'
import { Lightbulb, AlertCircle, Search, MessageSquare, Mail, Check } from 'lucide-react'

type FeedbackType = 'feature' | 'bug' | 'missing_funder' | 'general' | 'contact'

interface Row {
  id: string
  created_at: string
  type: FeedbackType
  message: string
  extra: Record<string, string> | null
  email: string | null
  user_id: string | null
  response: string | null
  response_label: string | null
  responded_at: string | null
}

const TYPE_META: Record<string, { label: string; Icon: React.ElementType }> = {
  feature:        { label: 'Feature idea',   Icon: Lightbulb },
  bug:            { label: 'Issue or bug',   Icon: AlertCircle },
  missing_funder: { label: 'Missing funder', Icon: Search },
  general:        { label: 'General',        Icon: MessageSquare },
  contact:        { label: 'Contact form',   Icon: Mail },
}

const UI = 'var(--font-space-grotesk)'

function fmt(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export default function FeedbackInboxPage() {
  const [rows, setRows]       = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [filter, setFilter]   = useState<'all' | 'unanswered'>('unanswered')

  // Draft reply per row id, seeded from what is already saved.
  const [drafts, setDrafts] = useState<Record<string, { response: string; label: string }>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [saved,  setSaved]  = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/feedback-inbox')
      if (!res.ok) throw new Error(`Load failed (${res.status})`)
      const json = await res.json()
      const list = (json.rows ?? []) as Row[]
      setRows(list)
      setDrafts(Object.fromEntries(list.map(r => [r.id, {
        response: r.response ?? '',
        label:    r.response_label ?? '',
      }])))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function save(id: string) {
    const draft = drafts[id]
    if (!draft) return
    setSaving(id)
    setSaved(null)
    try {
      const res = await fetch('/api/admin/feedback-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, response: draft.response, response_label: draft.label }),
      })
      if (!res.ok) throw new Error(`Save failed (${res.status})`)
      const { row } = await res.json()
      setRows(prev => prev.map(r => (r.id === id ? row : r)))
      setSaved(id)
      setTimeout(() => setSaved(s => (s === id ? null : s)), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(null)
    }
  }

  const shown = filter === 'unanswered' ? rows.filter(r => !r.response) : rows
  const unanswered = rows.filter(r => !r.response).length

  return (
    <div style={{ padding: '32px 28px', maxWidth: 940 }}>
      <h1 style={{ fontFamily: UI, fontSize: 26, fontWeight: 700, color: '#2C2C2A', margin: '0 0 6px' }}>
        Feedback inbox
      </h1>
      <p style={{ fontSize: 14, color: '#5F5E5A', margin: '0 0 20px', maxWidth: 620, lineHeight: 1.6 }}>
        Everything sent through the in-app form and the landing contact form. A reply here is shown
        to the submitter on their Feedback page, under the message they sent.
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {([['unanswered', `Needs a reply (${unanswered})`], ['all', `All (${rows.length})`]] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            style={{
              fontFamily: UI, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              padding: '7px 14px', borderRadius: 999,
              border: '1px solid ' + (filter === id ? '#1D3C3E' : 'rgba(29,60,62,0.22)'),
              background: filter === id ? '#1D3C3E' : '#fff',
              color: filter === id ? '#F6F1E7' : '#5F5E5A',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p style={{ fontSize: 13.5, color: '#993C1D', marginBottom: 16 }}>{error}</p>
      )}
      {loading && <p style={{ fontSize: 14, color: '#5F5E5A' }}>Loading…</p>}
      {!loading && shown.length === 0 && (
        <p style={{ fontSize: 14, color: '#74736E' }}>
          {filter === 'unanswered' ? 'Nothing waiting on a reply.' : 'No submissions yet.'}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {shown.map(row => {
          const meta = TYPE_META[row.type] ?? TYPE_META.general
          const Icon = meta.Icon
          const draft = drafts[row.id] ?? { response: '', label: '' }
          const extras = Object.entries(row.extra ?? {}).filter(([, v]) => v && String(v).trim().length > 0)
          const dirty = draft.response !== (row.response ?? '') || draft.label !== (row.response_label ?? '')

          return (
            <div key={row.id} style={{ background: '#fff', border: '1px solid rgba(29,60,62,0.10)', borderRadius: 16, padding: '18px 20px' }}>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 12.5, color: '#1D3C3E', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon size={13} style={{ color: '#74736E' }} />
                  {meta.label}
                </span>
                <span style={{ fontSize: 12, color: '#74736E' }}>· {fmt(row.created_at)}</span>
                {row.email && <span style={{ fontSize: 12, color: '#74736E', marginLeft: 'auto' }}>{row.email}</span>}
              </div>

              <p style={{ fontSize: 14.5, lineHeight: 1.6, color: '#2E2E2E', margin: '0 0 8px', whiteSpace: 'pre-wrap' }}>
                {row.message}
              </p>

              {extras.length > 0 && (
                <div style={{ background: '#FCFBF8', border: '1px solid rgba(29,60,62,0.10)', borderRadius: 11, padding: '10px 12px', marginBottom: 12 }}>
                  {extras.map(([k, v]) => (
                    <p key={k} style={{ fontSize: 13, lineHeight: 1.55, color: '#5F5E5A', margin: 0 }}>
                      <span style={{ fontFamily: UI, fontWeight: 600, color: '#1D3C3E' }}>{k.replace(/_/g, ' ')}:</span>{' '}
                      {String(v)}
                    </p>
                  ))}
                </div>
              )}

              <div style={{ borderTop: '1px solid rgba(29,60,62,0.10)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
                <input
                  value={draft.label}
                  onChange={e => setDrafts(d => ({ ...d, [row.id]: { ...draft, label: e.target.value } }))}
                  placeholder="Kicker, optional — e.g. Added to the catalogue"
                  style={{
                    fontFamily: UI, fontSize: 13, color: '#1D3C3E', background: '#FCFBF8',
                    border: '1px solid rgba(29,60,62,0.22)', borderRadius: 11, padding: '9px 12px', outline: 'none',
                  }}
                />
                <textarea
                  value={draft.response}
                  onChange={e => setDrafts(d => ({ ...d, [row.id]: { ...draft, response: e.target.value } }))}
                  placeholder="Write the reply the submitter will see. Empty clears it."
                  style={{
                    fontSize: 14, lineHeight: 1.6, color: '#1D3C3E', background: '#FCFBF8',
                    border: '1px solid rgba(29,60,62,0.22)', borderRadius: 11, padding: '11px 13px',
                    minHeight: 78, resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    onClick={() => save(row.id)}
                    disabled={saving === row.id || !dirty}
                    style={{
                      fontFamily: UI, fontSize: 13.5, fontWeight: 600, borderRadius: 999, border: 'none',
                      padding: '9px 18px', whiteSpace: 'nowrap',
                      cursor: (saving === row.id || !dirty) ? 'not-allowed' : 'pointer',
                      background: dirty ? '#1D3C3E' : '#F1EDE3',
                      color: dirty ? '#F6F1E7' : '#74736E',
                    }}
                  >
                    {saving === row.id ? 'Saving…' : row.response ? 'Update reply' : 'Send reply'}
                  </button>
                  {saved === row.id && (
                    <span style={{ fontFamily: UI, fontSize: 12.5, fontWeight: 600, color: '#1B6B3D', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Check size={13} /> Saved
                    </span>
                  )}
                  {row.responded_at && saved !== row.id && (
                    <span style={{ fontSize: 12.5, color: '#74736E' }}>Replied {fmt(row.responded_at)}</span>
                  )}
                  {!row.user_id && (
                    <span style={{ fontSize: 12.5, color: '#74736E' }}>
                      Not signed in — they will not see a reply in the app
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
