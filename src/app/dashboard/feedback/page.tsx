'use client'

/**
 * Feedback — built to the Band C reference (`feedback.html` + `feedback-spec.md`).
 *
 * The change that mattered here was not visual. The page used to show a status
 * chip with four states (Received, In review, Actioned, Shipped) of which
 * exactly one was reachable: nothing in the codebase ever set `status`, there
 * was no admin surface for it, and all 12 rows in the table read 'received'.
 * A chip that only ever shows one value is not a status, it is decoration
 * implying a triage process that does not exist.
 *
 * It is replaced by a reply. A status tells you your message was filed; a reply
 * tells you it was read. Written from /dashboard/admin/feedback-inbox, stored on
 * feedback.response, and shown under the message it answers. A submission with
 * no reply shows nothing, which is honest, rather than a chip that looks like
 * progress.
 *
 * Copy follows the spec's direction throughout: no promise of a fix, a
 * timescale, or an outcome we cannot guarantee. Deliberately absent, per the
 * spec, is a response time. "We usually reply within two days" would be the
 * strongest line on the page and nobody has committed to the number, so step 2
 * of "What happens next" says what we will do, not when.
 *
 * House copy rule applies over the reference file: the reference's em dashes
 * are commas and full stops here.
 */

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Lightbulb, AlertCircle, Search, MessageSquare, ArrowRight, Mail, Info, Check } from 'lucide-react'
import { useIsMobile } from '@/hooks/useIsMobile'

type TabId = 'feature' | 'bug' | 'missing_funder' | 'general'

interface Submission {
  id: string
  type: TabId
  message: string
  extra: Record<string, string>
  created_at: string
  response: string | null
  response_label: string | null
  responded_at: string | null
}

/* ── tokens ─────────────────────────────────────────────────────────────── */

const UI   = 'var(--font-space-grotesk)'
const BODY = 'var(--font-dm-sans)'

const T = {
  cream:       '#F6F1E7',
  deep:        '#1D3C3E',
  inkMuted:    '#5F5E5A',
  inkPlace:    '#74736E',
  warmNeutral: '#F1EDE3',
  hair:        'rgba(29,60,62,0.10)',
  ghost:       'rgba(29,60,62,0.22)',
  field:       '#FCFBF8',
  green:       '#1B6B3D',
  greenBg:     '#E4F1EA',
  danger:      '#993C1D',
}

/**
 * One accent per form type, and the same four Band C uses on Deadlines,
 * Projects and Connect. The glyph carries the contrast at --deep, so nothing
 * rests on the tile's edge.
 */
const ACCENT: Record<TabId, string> = {
  feature:        '#EBCE78',  // gold
  bug:            '#D67558',  // terracotta
  missing_funder: '#4EAAB4',  // teal
  general:        '#9BCA9D',  // sage
}

const TABS: { id: TabId; label: string; icon: React.ElementType; introTitle: string; introDesc: string }[] = [
  {
    id: 'feature',
    label: 'Feature idea',
    icon: Lightbulb,
    introTitle: 'Suggest a feature',
    introDesc: "What would you like Shoots to do that it doesn't? The problem you're trying to solve is more useful to us than the solution, because we may find a better way to fix it.",
  },
  {
    id: 'bug',
    label: 'Issue or bug',
    icon: AlertCircle,
    introTitle: 'Report an issue',
    introDesc: 'Something broken, or just confusing? The more detail you give, the faster we can find it.',
  },
  {
    id: 'missing_funder',
    label: 'Missing funder',
    icon: Search,
    introTitle: "Tell us about a funder we're missing",
    introDesc: 'These are the most useful messages we get. Every funder that checks out goes into the catalogue, for you and for everyone else searching.',
  },
  {
    id: 'general',
    label: 'General',
    icon: MessageSquare,
    introTitle: 'General feedback',
    introDesc: "Anything that doesn't fit the other three. Thoughts, questions, or something that just felt off.",
  },
]

const PAGES = ['Dashboard', 'Find Funding', 'Pipeline', 'Deadlines', 'Profile', 'Onboarding', 'Other']

const TAB_TYPE_LABELS: Record<TabId, string> = {
  feature:        'Feature idea',
  bug:            'Issue',
  missing_funder: 'Missing funder',
  general:        'General',
}

const TAB_ICONS: Record<TabId, React.ElementType> = {
  feature:        Lightbulb,
  bug:            AlertCircle,
  missing_funder: Search,
  general:        MessageSquare,
}

/* ── shared styles ──────────────────────────────────────────────────────── */

const cardStyle: React.CSSProperties = {
  background: '#FFFFFF',
  border: `1px solid ${T.hair}`,
  borderRadius: 16,
  overflow: 'hidden',
}

const sideCardStyle: React.CSSProperties = {
  background: '#FFFFFF',
  border: `1px solid ${T.hair}`,
  borderRadius: 16,
  padding: '20px 22px',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: UI,
  fontWeight: 600,
  fontSize: 13.5,
  color: T.deep,
  marginBottom: 7,
}

const optionalStyle: React.CSSProperties = {
  fontWeight: 400,
  fontSize: 12.5,
  color: T.inkPlace,
  marginLeft: 5,
}

const inputStyle: React.CSSProperties = {
  fontFamily: BODY,
  fontSize: 14.5,
  color: T.deep,
  background: T.field,
  border: `1px solid ${T.ghost}`,
  borderRadius: 11,
  padding: '12px 14px',
  width: '100%',
  outline: 'none',
  display: 'block',
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 120,
  resize: 'vertical',
  lineHeight: 1.6,
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/* ── page ───────────────────────────────────────────────────────────────── */

export default function FeedbackPage() {
  const isMobile = useIsMobile()
  const isNarrow = useIsMobile(1000)

  const [activeTab, setActiveTab]     = useState<TabId>('feature')
  const [status, setStatus]           = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [submissions, setSubmissions] = useState<Submission[]>([])

  const [bugWhat,    setBugWhat]    = useState('')
  const [bugHow,     setBugHow]     = useState('')
  const [bugPage,    setBugPage]    = useState('')
  const [funderName, setFunderName] = useState('')
  const [funderUrl,  setFunderUrl]  = useState('')
  const [funderWhy,  setFunderWhy]  = useState('')
  const [message,    setMessage]    = useState('')

  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('feedback')
        .select('id, type, message, extra, created_at, response, response_label, responded_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10)
      if (data) setSubmissions(data as Submission[])
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  function resetForm() {
    setBugWhat(''); setBugHow(''); setBugPage('')
    setFunderName(''); setFunderUrl(''); setFunderWhy('')
    setMessage('')
  }

  function isValid() {
    if (activeTab === 'bug')            return bugWhat.trim().length > 0 && bugHow.trim().length > 0
    // The name on its own is a valid suggestion. Website and description are
    // optional and say so: this is the tab that produces catalogue, so the
    // friction comes off it.
    if (activeTab === 'missing_funder') return funderName.trim().length > 0
    return message.trim().length > 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid()) return
    setStatus('sending')
    try {
      let msg = message
      let extra: Record<string, string> = {}

      if (activeTab === 'bug') {
        msg = bugWhat.trim()
        extra = { what_happened: bugHow.trim(), page: bugPage }
      } else if (activeTab === 'missing_funder') {
        msg = funderName.trim()
        extra = { url: funderUrl.trim(), why: funderWhy.trim() }
      }

      // Submit via API route so the server-side handler can send a
      // notification email via Resend (RESEND_API_KEY isn't exposed
      // client-side). The route uses the user's auth cookie to attach
      // user_id and email.
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: activeTab, message: msg, extra }),
      })
      if (!res.ok) throw new Error('Submission failed')
      setStatus('sent')
      resetForm()
    } catch {
      setStatus('error')
    }
  }

  const meta = TABS.find(t => t.id === activeTab)!
  const MetaIcon = meta.icon
  const disabled = status === 'sending' || !isValid()

  // The attached-data note earns its place by saying what it saves you. On
  // Missing funder there is no setup to explain, so it says the useful thing
  // instead: you do not have to do the research.
  const attachedNote = activeTab === 'missing_funder'
    ? "The name alone is enough. We'll research the rest."
    : "Your account and the page you're on are attached automatically, so you don't have to explain the setup."

  return (
    <div style={{ padding: isMobile ? '24px 16px 60px' : '34px 26px 40px', maxWidth: 1220 }}>

      {/* Header */}
      <div style={{ marginBottom: 26 }}>
        <h1 style={{ fontFamily: UI, fontWeight: 600, fontSize: 31, letterSpacing: '-0.025em', color: T.deep, margin: '0 0 6px' }}>
          Feedback
        </h1>
        <p style={{ fontFamily: BODY, fontSize: 14.5, lineHeight: 1.6, color: T.inkMuted, margin: 0, maxWidth: 640 }}>
          Tell us what&rsquo;s missing, what&rsquo;s broken, or what would make Shoots more useful.
          Every message goes straight to the people building it.
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: isNarrow ? '1fr' : 'minmax(0, 1fr) 330px',
        gap: isNarrow ? 20 : 24,
        alignItems: 'start',
      }}>

        {/* ── LEFT: the form ─────────────────────────────────────────────── */}
        <div>

          {/* Category tabs. The active one is deep on cream at 10.55:1. It
              decides what the whole form is, so there is no ambiguity about
              which one you are on. */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isNarrow ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
            gap: 5, padding: 5, background: '#FFFFFF',
            border: `1px solid ${T.hair}`,
            borderRadius: isNarrow ? 16 : 999,
            marginBottom: 16,
          }}>
            {TABS.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => { setActiveTab(tab.id); setStatus('idle') }}
                  /* Hover in JS because the resting background is an inline
                     style, which a hover: class would lose to. */
                  onMouseEnter={e => {
                    if (isActive) return
                    e.currentTarget.style.background = T.warmNeutral
                    e.currentTarget.style.color = T.deep
                  }}
                  onMouseLeave={e => {
                    if (isActive) return
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = T.inkMuted
                  }}
                  style={{
                    fontFamily: UI,
                    fontWeight: isActive ? 600 : 500,
                    fontSize: 13.5,
                    color: isActive ? T.cream : T.inkMuted,
                    background: isActive ? T.deep : 'transparent',
                    border: 'none', padding: '11px 12px', borderRadius: 999,
                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: 8, whiteSpace: 'nowrap',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  <Icon size={15} style={{ flexShrink: 0 }} />
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Form card */}
          <div style={cardStyle}>
            <form onSubmit={handleSubmit}>

              {/* Intro, with the one colour moment for this form type */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '22px 24px 18px' }}>
                <span style={{
                  width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                  background: ACCENT[activeTab], color: T.deep,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <MetaIcon size={20} />
                </span>
                <div>
                  <p style={{ fontFamily: UI, fontWeight: 600, fontSize: 18, color: T.deep, margin: '1px 0 5px', letterSpacing: '-0.018em' }}>
                    {meta.introTitle}
                  </p>
                  <p style={{ fontFamily: BODY, fontSize: 14.5, lineHeight: 1.6, color: T.inkMuted, margin: 0, maxWidth: '58ch' }}>
                    {meta.introDesc}
                  </p>
                </div>
              </div>

              {/* Fields */}
              <div style={{ borderTop: `1px solid ${T.hair}`, padding: '20px 24px 22px' }}>

                {activeTab === 'bug' && (<>
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>What were you trying to do?</label>
                    <input type="text" value={bugWhat} onChange={e => setBugWhat(e.target.value)} placeholder="e.g. Searching for environmental funders in the South East" style={inputStyle} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>What happened instead?</label>
                    <textarea value={bugHow} onChange={e => setBugHow(e.target.value)} placeholder="Describe what went wrong. Include any error messages you saw." style={textareaStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Where did this happen? <span style={optionalStyle}>optional</span></label>
                    <select value={bugPage} onChange={e => setBugPage(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                      <option value="">Choose a page…</option>
                      {PAGES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </>)}

                {activeTab === 'missing_funder' && (<>
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Funder name</label>
                    <input type="text" value={funderName} onChange={e => setFunderName(e.target.value)} placeholder="e.g. Esmée Fairbairn Foundation" style={inputStyle} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Website <span style={optionalStyle}>optional</span></label>
                    <input type="url" value={funderUrl} onChange={e => setFunderUrl(e.target.value)} placeholder="https://…" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>What do they fund? <span style={optionalStyle}>optional</span></label>
                    <textarea value={funderWhy} onChange={e => setFunderWhy(e.target.value)} placeholder="Sector, area, who can apply. Anything you know helps us find them faster." style={{ ...textareaStyle, minHeight: 90 }} />
                  </div>
                </>)}

                {(activeTab === 'feature' || activeTab === 'general') && (
                  <div>
                    <label style={labelStyle}>{activeTab === 'feature' ? 'Your idea' : 'Your message'}</label>
                    <textarea
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      placeholder={activeTab === 'feature'
                        ? 'What would you like to see, and what would it let you do?'
                        : 'Whatever is on your mind about Shoots.'}
                      style={textareaStyle}
                    />
                  </div>
                )}

                {status === 'error' && (
                  <p style={{ fontFamily: BODY, fontSize: 13, color: T.danger, marginTop: 14 }}>
                    Something went wrong. Please try again, or email{' '}
                    <a href="mailto:hello@shootsfunding.co.uk" style={{ color: 'inherit' }}>hello@shootsfunding.co.uk</a>
                  </p>
                )}
              </div>

              {/* Footer */}
              <div style={{
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'stretch' : 'center',
                justifyContent: 'space-between',
                gap: 16, padding: isMobile ? '14px 18px' : '16px 24px',
                background: T.field, borderTop: `1px solid ${T.hair}`,
                flexWrap: 'wrap',
              }}>
                <span style={{
                  display: 'flex', alignItems: 'flex-start', gap: 9,
                  fontFamily: BODY, fontSize: 13, lineHeight: 1.5, color: T.inkMuted, maxWidth: '46ch',
                }}>
                  <Info size={15} style={{ flexShrink: 0, color: T.inkPlace, marginTop: 1 }} />
                  {attachedNote}
                </span>
                <button
                  type="submit"
                  disabled={disabled}
                  style={{
                    fontFamily: UI, fontSize: 14.5, fontWeight: 600,
                    color: disabled ? T.inkPlace : T.cream,
                    background: disabled ? T.warmNeutral : T.deep,
                    border: 'none', padding: '12px 22px', borderRadius: 999,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    gap: 9, whiteSpace: 'nowrap',
                    width: isMobile ? '100%' : undefined,
                  }}
                >
                  {status === 'sending' ? 'Sending…' : 'Send feedback'}
                  {status !== 'sending' && <ArrowRight size={15} />}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* ── RIGHT: context, then history ───────────────────────────────── */}
        <aside style={{
          display: 'flex', flexDirection: 'column', gap: 16,
          position: isNarrow ? 'static' : 'sticky',
          top: 24,
        }}>

          {status === 'sent' ? (
            /* The confirmation sits directly above the submissions it points
               at, and the form stays where it is, cleared and ready. */
            <div style={{ ...sideCardStyle, padding: 0, overflow: 'hidden' }}>
              <div style={{ textAlign: 'center', padding: '52px 32px' }}>
                <span style={{
                  width: 52, height: 52, borderRadius: 999, background: T.greenBg, color: T.green,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px',
                }}>
                  <Check size={24} />
                </span>
                <h2 style={{ fontFamily: UI, fontWeight: 600, fontSize: 21, color: T.deep, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
                  That&rsquo;s with us
                </h2>
                <p style={{ fontFamily: BODY, fontSize: 14.5, lineHeight: 1.6, color: T.inkMuted, margin: '0 auto 20px', maxWidth: '44ch' }}>
                  It&rsquo;s in your submissions below. If we need anything else we&rsquo;ll email you.
                </p>
                <button
                  type="button"
                  onClick={() => setStatus('idle')}
                  style={{
                    fontFamily: UI, fontSize: 14, fontWeight: 500, color: T.deep,
                    background: '#fff', border: `1px solid ${T.ghost}`,
                    padding: '11px 20px', borderRadius: 999, cursor: 'pointer',
                  }}
                >
                  Send something else
                </button>
              </div>
            </div>
          ) : (
            /* The honest version of the promise the old intro was making. */
            <div style={sideCardStyle}>
              <h2 style={{ fontFamily: UI, fontWeight: 600, fontSize: 15, color: T.deep, margin: '0 0 14px', letterSpacing: '-0.012em' }}>
                What happens next
              </h2>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[
                  ['A person reads it', 'Nothing is auto-filed or auto-replied. It goes to the team building Shoots.'],
                  ['We may come back to you', "If we need more detail we'll email the address on your account."],
                  ['Funder suggestions get researched', 'Every one that checks out goes into the catalogue for everybody.'],
                ].map(([title, body], i) => (
                  <li key={title} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: 999, background: T.warmNeutral, color: T.deep, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: UI, fontWeight: 700, fontSize: 11.5,
                    }}>{i + 1}</span>
                    <span style={{ fontFamily: BODY, fontSize: 13.5, lineHeight: 1.55, color: T.inkMuted }}>
                      <b style={{ display: 'block', fontFamily: UI, fontWeight: 600, fontSize: 13.5, color: T.deep, marginBottom: 2 }}>{title}</b>
                      {body}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Your submissions */}
          <div style={sideCardStyle}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
              <h2 style={{ fontFamily: UI, fontWeight: 600, fontSize: 15, color: T.deep, margin: 0, letterSpacing: '-0.012em' }}>
                Your submissions
              </h2>
              {submissions.length > 0 && (
                <span style={{ fontFamily: UI, fontSize: 12, fontWeight: 500, color: T.inkPlace }}>
                  {submissions.length} total
                </span>
              )}
            </div>

            {submissions.length === 0 ? (
              <p style={{ fontFamily: BODY, fontSize: 13.5, lineHeight: 1.6, color: T.inkPlace, margin: 0 }}>
                Nothing yet. Anything you send will appear here, along with any reply.
              </p>
            ) : (
              submissions.map((sub, i) => {
                const Icon = TAB_ICONS[sub.type] ?? MessageSquare
                const isLast = i === submissions.length - 1
                return (
                  <div
                    key={sub.id}
                    style={{
                      paddingTop: i === 0 ? 0 : 14,
                      paddingBottom: isLast ? 0 : 14,
                      borderBottom: isLast ? 'none' : `1px solid ${T.hair}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                      <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 11.5, color: T.deep, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Icon size={12} style={{ color: T.inkPlace }} />
                        {TAB_TYPE_LABELS[sub.type] ?? 'General'}
                      </span>
                      <span style={{ marginLeft: 'auto', fontFamily: BODY, fontSize: 11.5, color: T.inkPlace }}>
                        {formatDate(sub.created_at)}
                      </span>
                    </div>

                    <p style={{
                      fontFamily: BODY, fontSize: 13.5, lineHeight: 1.5, color: T.inkMuted, margin: 0,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                      {sub.message}
                    </p>

                    {/* A row with no reply shows nothing here. Unfinished and
                        honest beats finished and untrue. */}
                    {sub.response && (
                      <div style={{ marginTop: 10, background: T.greenBg, borderRadius: 11, padding: '11px 13px' }}>
                        <span style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          fontFamily: UI, fontSize: 10.5, fontWeight: 700,
                          letterSpacing: '0.11em', textTransform: 'uppercase', color: T.green, marginBottom: 6,
                        }}>
                          <Check size={11} />
                          {sub.response_label || 'Reply from Shoots'}
                        </span>
                        <span style={{ display: 'block', fontFamily: BODY, fontSize: 13.5, lineHeight: 1.55, color: T.deep, whiteSpace: 'pre-wrap' }}>
                          {sub.response}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Email fallback. In the sidebar, not full-width under the form: a
              fallback should not outweigh the primary action. */}
          <div style={sideCardStyle}>
            <span style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
              <Mail size={16} style={{ flexShrink: 0, color: T.inkPlace, marginTop: 2 }} />
              <span style={{ fontFamily: BODY, fontSize: 13.5, lineHeight: 1.6, color: T.inkMuted }}>
                Prefer email, or need to send an attachment? Write to{' '}
                <a
                  href="mailto:hello@shootsfunding.co.uk"
                  style={{ fontFamily: UI, fontWeight: 600, color: T.deep, textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: T.ghost }}
                >
                  hello@shootsfunding.co.uk
                </a>.
              </span>
            </span>
          </div>

        </aside>
      </div>
    </div>
  )
}
