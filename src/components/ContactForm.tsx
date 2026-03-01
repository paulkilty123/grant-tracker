'use client'

import { useState } from 'react'

export default function ContactForm() {
  const [name,    setName]    = useState('')
  const [email,   setEmail]   = useState('')
  const [message, setMessage] = useState('')
  const [status,  setStatus]  = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

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
      setStatus('sent')
      setName(''); setEmail(''); setMessage('')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <div className="bg-sage/10 border border-sage/30 rounded-2xl p-8 text-center">
        <div className="text-3xl mb-3">✓</div>
        <p className="font-display text-lg font-bold text-forest mb-1">Message received</p>
        <p className="text-sm text-mid">We&apos;ll get back to you at {email}.</p>
        <button onClick={() => setStatus('idle')} className="text-xs text-sage underline mt-4 block mx-auto">
          Send another message
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-charcoal mb-1.5">Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
            className="form-input w-full"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-charcoal mb-1.5">Email <span className="text-red-400">*</span></label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="form-input w-full"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-charcoal mb-1.5">Message <span className="text-red-400">*</span></label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Tell us what you'd like to know, or anything else on your mind…"
          rows={4}
          required
          className="form-input w-full resize-none"
        />
      </div>
      {status === 'error' && (
        <p className="text-xs text-red-500">Something went wrong — please try again or email us directly.</p>
      )}
      <button
        type="submit"
        disabled={status === 'sending'}
        className="btn-primary px-8 py-2.5 text-sm font-semibold disabled:opacity-50"
      >
        {status === 'sending' ? 'Sending…' : 'Send message →'}
      </button>
    </form>
  )
}
