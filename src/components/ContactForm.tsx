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
      <div className="border border-warm bg-sage/10 p-8 text-center">
        <div className="text-3xl mb-3">✓</div>
        <p className="font-serif text-lg font-bold text-forest mb-1">Message received</p>
        <p className="text-sm text-mid">We&apos;ll get back to you at {email}.</p>
        <button onClick={() => setStatus('idle')} className="text-xs text-sage underline mt-4 block mx-auto">
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
          className="mt-1.5 h-11 w-full border border-warm rounded-none px-3 text-sm outline-none focus:border-charcoal bg-white transition-colors"
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
          className="mt-1.5 h-11 w-full border border-warm rounded-none px-3 text-sm outline-none focus:border-charcoal bg-white transition-colors"
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
          className="mt-1.5 w-full min-h-[120px] border border-warm rounded-none px-3 py-2.5 text-sm outline-none focus:border-charcoal bg-white transition-colors resize-none"
        />
      </div>
      {status === 'error' && (
        <p className="text-xs text-red-500">Something went wrong — please try again or email us directly.</p>
      )}
      <button
        type="submit"
        disabled={status === 'sending'}
        className="w-full h-11 rounded-xl bg-charcoal text-white text-sm font-medium hover:bg-charcoal/90 disabled:opacity-50 transition-colors"
      >
        {status === 'sending' ? 'Sending…' : 'Send message'}
      </button>
    </form>
  )
}
