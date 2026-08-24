'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Lightbulb, AlertCircle, Search, MessageSquare, ArrowRight, Mail, CheckCircle } from 'lucide-react'
import { useIsMobile } from '@/hooks/useIsMobile'

type TabId = 'feature' | 'bug' | 'missing_funder' | 'general'
type SubmissionStatus = 'received' | 'reviewing' | 'actioned' | 'shipped'

interface Submission {
  id: string
  type: TabId
  message: string
  extra: Record<string, string>
  status: SubmissionStatus
  created_at: string
}

const TABS: { id: TabId; label: string; icon: React.ElementType; introTitle: string; introDesc: string }[] = [
  {
    id: 'feature',
    label: 'Feature idea',
    icon: Lightbulb,
    introTitle: 'Suggest a feature',
    introDesc: "Tell us what you'd like to see and what problem it would solve for you.",
  },
  {
    id: 'bug',
    label: 'Issue or bug',
    icon: AlertCircle,
    introTitle: 'Report an issue',
    introDesc: "Something broken or confusing? Tell us what happened and we'll get on it.",
  },
  {
    id: 'missing_funder',
    label: 'Missing funder',
    icon: Search,
    introTitle: 'Suggest a funder',
    introDesc: 'Know a funder that should be in Shoots? Tell us about them.',
  },
  {
    id: 'general',
    label: 'General',
    icon: MessageSquare,
    introTitle: 'General feedback',
    introDesc: 'Share any thoughts, comments, or questions.',
  },
]

const PAGES = ['Dashboard', 'Find Funding', 'Pipeline', 'Deadlines', 'Profile', 'Onboarding', 'Other']

const STATUS_CONFIG: Record<SubmissionStatus, { label: string; bg: string; color: string }> = {
  received:  { label: 'Received',  bg: '#F5F1E8', color: '#5F5E5A' },
  reviewing: { label: 'In review', bg: '#FAEEDA', color: '#854F0B' },
  actioned:  { label: 'Actioned',  bg: '#F0F5F3', color: '#5A9080' },
  shipped:   { label: 'Shipped',   bg: '#F4F9ED', color: '#639922' },
}

const TAB_TYPE_LABELS: Record<TabId, string> = {
  feature:        'Feature idea',
  bug:            'Issue',
  missing_funder: 'Missing funder',
  general:        'General',
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-space-grotesk)',
  fontWeight: 500,
  fontSize: 13,
  color: '#2C2C2A',
}

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--font-dm-sans)',
  fontSize: 14.5,
  color: '#2C2C2A',
  background: '#FAFAF7',
  border: '1px solid rgba(23,52,4,0.14)',
  borderRadius: 8,
  padding: '10px 12px',
  width: '100%',
  outline: 'none',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function FeedbackPage() {
  const isMobile = useIsMobile()
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
        .select('id, type, message, extra, status, created_at')
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

  return (
    <div style={{ padding: isMobile ? '24px 16px 60px' : '40px 48px 80px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 600, fontSize: 28, letterSpacing: '-0.02em', color: '#2C2C2A', marginBottom: 6 }}>
          Feedback
        </h1>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 15, color: '#5F5E5A', maxWidth: 560 }}>
          Tell us what&apos;s working, what isn&apos;t, and what&apos;s missing. We read every message and use it to shape what we build next.
        </p>
      </div>

      {/* Two-column layout — collapses to single column on mobile */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 320px', gap: isMobile ? 20 : 32, alignItems: 'start' }}>

        {/* LEFT: form */}
        <div>

          {/* Category tab strip — 2x2 grid on mobile to keep labels readable */}
          <div style={{
            display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 4,
            padding: 4, background: '#FFFFFF',
            border: '1px solid rgba(23,52,4,0.08)', borderRadius: 10, marginBottom: 20,
          }}>
            {TABS.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setStatus('idle') }}
                  style={{
                    fontFamily: 'var(--font-space-grotesk)', fontWeight: isActive ? 600 : 500,
                    fontSize: 13.5, color: isActive ? '#173404' : '#5F5E5A',
                    background: isActive ? '#F5F1E8' : 'transparent',
                    border: 'none', padding: '10px 12px', borderRadius: 7,
                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: 7, whiteSpace: 'nowrap',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Form card */}
          <div style={{ background: '#FFFFFF', border: '1px solid rgba(23,52,4,0.08)', borderRadius: 12, overflow: 'hidden' }}>

            {status === 'sent' ? (
              <div style={{ textAlign: 'center', padding: '56px 32px' }}>
                <div style={{ width: 48, height: 48, background: 'rgba(23,52,4,0.08)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <CheckCircle size={22} color="#173404" />
                </div>
                <p style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 700, color: '#2C2C2A', marginBottom: 6 }}>Thank you!</p>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 14, color: '#5F5E5A', marginBottom: 24, lineHeight: 1.6 }}>
                  Your feedback has been received. We really appreciate it.
                </p>
                <button onClick={() => setStatus('idle')} style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 13, color: '#e8604c', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
                  Submit another
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div style={{ padding: '24px 26px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>

                  {/* Intro */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, paddingBottom: 18, borderBottom: '1px solid rgba(23,52,4,0.08)' }}>
                    <div style={{ width: 36, height: 36, background: '#F5F1E8', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <meta.icon size={18} color="#173404" />
                    </div>
                    <div style={{ paddingTop: 2 }}>
                      <div style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 600, fontSize: 15, color: '#2C2C2A', marginBottom: 2 }}>{meta.introTitle}</div>
                      <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 13.5, color: '#5F5E5A', lineHeight: 1.5 }}>{meta.introDesc}</div>
                    </div>
                  </div>

                  {/* Bug fields */}
                  {activeTab === 'bug' && (<>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <label style={labelStyle}>What were you trying to do?</label>
                      <input type="text" value={bugWhat} onChange={e => setBugWhat(e.target.value)} placeholder="e.g. Searching for environmental funders in the South East" style={inputStyle} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <label style={labelStyle}>What happened instead?</label>
                      <textarea value={bugHow} onChange={e => setBugHow(e.target.value)} placeholder="Describe what went wrong. Include any error messages you saw." style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <label style={labelStyle}>Where did this happen? <span style={{ fontWeight: 400, fontSize: 12, color: '#8A8986' }}>Optional</span></label>
                      <select value={bugPage} onChange={e => setBugPage(e.target.value)} style={inputStyle}>
                        <option value="">Choose a page…</option>
                        {PAGES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </>)}

                  {/* Missing funder fields */}
                  {activeTab === 'missing_funder' && (<>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <label style={labelStyle}>Funder name</label>
                      <input type="text" value={funderName} onChange={e => setFunderName(e.target.value)} placeholder="e.g. Esmée Fairbairn Foundation" style={inputStyle} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <label style={labelStyle}>Website <span style={{ fontWeight: 400, fontSize: 12, color: '#8A8986' }}>Optional</span></label>
                      <input type="url" value={funderUrl} onChange={e => setFunderUrl(e.target.value)} placeholder="https://…" style={inputStyle} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <label style={labelStyle}>Why is it relevant? <span style={{ fontWeight: 400, fontSize: 12, color: '#8A8986' }}>Optional</span></label>
                      <textarea value={funderWhy} onChange={e => setFunderWhy(e.target.value)} placeholder="What sector do they fund? Who can apply?" style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} />
                    </div>
                  </>)}

                  {/* Feature / General */}
                  {(activeTab === 'feature' || activeTab === 'general') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <label style={labelStyle}>{activeTab === 'feature' ? 'Your idea' : 'Your message'}</label>
                      <textarea
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        placeholder={activeTab === 'feature' ? "Describe the feature you'd like to see. What problem would it solve?" : 'Share any thoughts, ideas or comments.'}
                        style={{ ...inputStyle, minHeight: 130, resize: 'vertical' }}
                      />
                    </div>
                  )}

                  {status === 'error' && (
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 12.5, color: '#993C1D' }}>
                      Something went wrong — please try again or email{' '}
                      <a href="mailto:hello@granttracker.co.uk" style={{ color: 'inherit' }}>hello@granttracker.co.uk</a>
                    </p>
                  )}
                </div>

                {/* Form footer — stacks on mobile so the submit button stays full-width and reachable */}
                <div style={{ background: '#FAFAF7', borderTop: '1px solid rgba(23,52,4,0.08)', padding: isMobile ? '14px 18px' : '14px 26px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', gap: isMobile ? 12 : 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-dm-sans)', fontSize: 12.5, color: '#8A8986' }}>
                    <CheckCircle size={13} />
                    Your account and browser details are attached automatically
                  </div>
                  <button
                    type="submit"
                    disabled={status === 'sending' || !isValid()}
                    style={{
                      fontFamily: 'var(--font-space-grotesk)', fontWeight: 500, fontSize: 14,
                      background: '#8ECB3C', color: '#173404', border: 'none',
                      padding: '10px 20px', borderRadius: 8,
                      cursor: (status === 'sending' || !isValid()) ? 'not-allowed' : 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 8, transition: 'filter 0.15s',
                    }}
                  >
                    {status === 'sending' ? 'Sending…' : 'Send feedback'}
                    {status !== 'sending' && <ArrowRight size={14} />}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Email fallback */}
          <div style={{ marginTop: 24, padding: '16px 20px', background: '#FFFFFF', border: '1px solid rgba(23,52,4,0.08)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'var(--font-dm-sans)', fontSize: 13.5, color: '#5F5E5A' }}>
            <Mail size={16} color="#8A8986" style={{ flexShrink: 0 }} />
            <span>
              Need a faster response, or prefer email? Write to{' '}
              <a href="mailto:hello@granttracker.co.uk" style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 500, color: '#173404', textDecoration: 'none' }}>
                hello@granttracker.co.uk
              </a>
            </span>
          </div>

        </div>

        {/* RIGHT: recent submissions */}
        <aside style={{ background: '#FFFFFF', border: '1px solid rgba(23,52,4,0.08)', borderRadius: 12, padding: '20px 22px', position: 'sticky', top: 24 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid rgba(23,52,4,0.08)' }}>
            <span style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 600, fontSize: 14.5, color: '#2C2C2A' }}>Your recent submissions</span>
            {submissions.length > 0 && (
              <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 12, color: '#8A8986' }}>{submissions.length} total</span>
            )}
          </div>

          {submissions.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 13, color: '#8A8986', lineHeight: 1.6, paddingTop: 4 }}>
              Nothing yet — we&apos;ll show your submissions here once you send one.
            </p>
          ) : (
            submissions.map((sub, i) => {
              const sc    = STATUS_CONFIG[sub.status]
              const tabMeta = TABS.find(t => t.id === sub.type)
              const Icon  = tabMeta?.icon ?? MessageSquare
              const preview = sub.type === 'bug'
                ? (sub.extra?.what_happened || sub.message)
                : sub.message

              return (
                <div key={sub.id} style={{ padding: i === 0 ? '0 0 12px' : '12px 0', borderBottom: i < submissions.length - 1 ? '1px solid rgba(23,52,4,0.08)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 5 }}>
                    <span style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 500, fontSize: 11.5, color: '#5F5E5A', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Icon size={11} style={{ opacity: 0.7 }} />
                      {TAB_TYPE_LABELS[sub.type]}
                    </span>
                    <span style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 500, fontSize: 11, padding: '2px 8px', borderRadius: 10, background: sc.bg, color: sc.color, letterSpacing: '0.01em' }}>
                      {sc.label}
                    </span>
                  </div>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 13, color: '#2C2C2A', lineHeight: 1.45, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {preview}
                  </p>
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 11.5, color: '#8A8986' }}>
                    Sent {formatDate(sub.created_at)}
                  </span>
                </div>
              )
            })
          )}
        </aside>

      </div>
    </div>
  )
}
