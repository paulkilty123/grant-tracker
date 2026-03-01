'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type FeedbackType = 'feature' | 'bug' | 'general'

const TYPES: { id: FeedbackType; emoji: string; label: string; placeholder: string }[] = [
  {
    id: 'feature',
    emoji: '💡',
    label: 'Suggest a feature',
    placeholder: 'Describe the feature you\'d like to see. What problem would it solve for you?',
  },
  {
    id: 'bug',
    emoji: '🐛',
    label: 'Report an issue',
    placeholder: 'Describe what happened, what you expected to happen, and the steps to reproduce it.',
  },
  {
    id: 'general',
    emoji: '💬',
    label: 'General feedback',
    placeholder: 'Share any thoughts, ideas or comments — anything at all.',
  },
]

export default function FeedbackPage() {
  const [activeType, setActiveType] = useState<FeedbackType>('feature')
  const [message,    setMessage]    = useState('')
  const [status,     setStatus]     = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const supabase = createClient()

  const active = TYPES.find(t => t.id === activeType)!

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setStatus('sending')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('feedback').insert({
        type:    activeType,
        message: message.trim(),
        user_id: user?.id ?? null,
        email:   user?.email ?? null,
      })
      if (error) throw error
      setStatus('sent')
      setMessage('')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">

      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-forest mb-1">Share your feedback</h1>
        <p className="text-mid text-sm">
          Help us make Grant Tracker better. Every message is read and taken seriously.
        </p>
      </div>

      {/* Type tabs */}
      <div className="flex gap-2 mb-6">
        {TYPES.map(t => (
          <button
            key={t.id}
            onClick={() => { setActiveType(t.id); setStatus('idle') }}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition-all ${
              activeType === t.id
                ? 'bg-forest border-forest text-white'
                : 'border-warm text-mid hover:border-sage hover:text-sage bg-white'
            }`}
          >
            <span>{t.emoji}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Form */}
      <div className="bg-white rounded-2xl border border-warm shadow-card p-6">
        {status === 'sent' ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">✓</div>
            <p className="font-display text-lg font-bold text-forest mb-1">Thank you!</p>
            <p className="text-sm text-mid mb-5">Your feedback has been received. We really appreciate it.</p>
            <button
              onClick={() => setStatus('idle')}
              className="text-sm text-sage underline hover:text-forest transition-colors"
            >
              Submit another →
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1.5">
                {active.emoji} {active.label}
              </label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder={active.placeholder}
                rows={6}
                required
                className="form-input w-full resize-none"
              />
            </div>

            {status === 'error' && (
              <p className="text-xs text-red-500">
                Something went wrong — please try again or email us at{' '}
                <a href="mailto:hello@granttracker.co.uk" className="underline">hello@granttracker.co.uk</a>
              </p>
            )}

            <div className="flex items-center justify-between">
              <p className="text-xs text-light">Your account details are attached automatically.</p>
              <button
                type="submit"
                disabled={status === 'sending' || !message.trim()}
                className="btn-primary px-6 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {status === 'sending' ? 'Sending…' : 'Send feedback →'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Previous submissions note */}
      <p className="text-xs text-light text-center mt-6">
        Need a faster response? Email us directly at{' '}
        <a href="mailto:hello@granttracker.co.uk" className="text-sage hover:underline">
          hello@granttracker.co.uk
        </a>
      </p>

    </div>
  )
}
