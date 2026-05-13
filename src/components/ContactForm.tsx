'use client'

import { useState } from 'react'

export default function ContactForm() {
  const [name,    setName]    = useState('')
  const [email,   setEmail]   = useState('')
  const [message, setMessage] = useState('')
  const [status,  setStatus]  = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  // Captured at submit time so the success message still shows the email
  // after we clear the form inputs below.
  const [sentTo,  setSentTo]  = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
      })
      if (!res.ok) throw new Error('Failed')
      setSentTo(email)
      setStatus('sent')
      setName(''); setEmail(''); setMessage('')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <div
        className="p-8 text-center rounded-xl"
        style={{
          background: '#F1F7E4',
          border: '0.5px solid rgba(57,109,17,0.18)',
          boxShadow: '0 1px 3px rgba(23,52,4,0.04)',
        }}
      >
        <div
          className="mx-auto mb-4 flex items-center justify-center"
          style={{ width: 48, height: 48, borderRadius: '50%', background: '#8ECB3C' }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#173404" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h3
          className="mb-1"
          style={{
            fontFamily: 'var(--font-space-grotesk)',
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: '#173404',
          }}
        >
          Message received
        </h3>
        <p style={{ fontFamily: 'var(--font-plus-jakarta, Plus Jakarta Sans, sans-serif)', fontSize: 14, color: '#3B6D11', margin: 0 }}>
          We&apos;ll get back to you at <span style={{ fontWeight: 500 }}>{sentTo}</span>.
        </p>
        <button
          onClick={() => setStatus('idle')}
          className="mt-5 block mx-auto"
          style={{
            fontFamily: 'var(--font-space-grotesk)',
            fontSize: 12.5,
            fontWeight: 500,
            color: '#3B6D11',
            background: 'transparent',
            border: 'none',
            padding: '6px 12px',
            borderRadius: 8,
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          Send another message
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="text-sm font-medium text-charcoal">Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Your name"
          className="mt-1.5 h-11 w-full border border-warm rounded-lg px-3 text-sm outline-none focus:border-charcoal bg-white transition-colors"
        />
      </div>
      <div>
        <label className="text-sm font-medium text-charcoal">Email</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@organisation.org"
          required
          className="mt-1.5 h-11 w-full border border-warm rounded-lg px-3 text-sm outline-none focus:border-charcoal bg-white transition-colors"
        />
      </div>
      <div>
        <label className="text-sm font-medium text-charcoal">Message</label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="How can we help?"
          rows={5}
          required
          className="mt-1.5 w-full min-h-[120px] border border-warm rounded-lg px-3 py-2.5 text-sm outline-none focus:border-charcoal bg-white transition-colors resize-none"
        />
      </div>
      {status === 'error' && (
        <p className="text-xs text-coral-saturated">Something went wrong — please try again or email us directly.</p>
      )}
      <button
        type="submit"
        disabled={status === 'sending'}
        className="w-full h-11 rounded-xl bg-[#8ECB3C] text-[#173404] text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-colors"
      >
        {status === 'sending' ? 'Sending…' : 'Send message'}
      </button>
    </form>
  )
}
