'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Lightbulb, AlertCircle, MessageSquare, CheckCircle, Mail } from 'lucide-react'

type FeedbackType = 'feature' | 'bug' | 'general'

const TYPES: {
  id: FeedbackType
  label: string
  icon: React.ElementType
  placeholder: string
  activeBg: string
  activeText: string
  activeBorder: string
  iconColour: string
}[] = [
  {
    id: 'feature',
    label: 'Suggest a feature',
    icon: Lightbulb,
    placeholder: "Describe the feature you'd like to see. What problem would it solve for you?",
    activeBg: 'bg-forest/8',
    activeText: 'text-forest',
    activeBorder: 'border-forest',
    iconColour: '#1f5c52',
  },
  {
    id: 'bug',
    label: 'Report an issue',
    icon: AlertCircle,
    placeholder: 'Describe what happened, what you expected, and how to reproduce it.',
    activeBg: 'bg-coral/8',
    activeText: 'text-coral',
    activeBorder: 'border-coral',
    iconColour: '#e8604c',
  },
  {
    id: 'general',
    label: 'General feedback',
    icon: MessageSquare,
    placeholder: 'Share any thoughts, ideas or comments — anything at all.',
    activeBg: 'bg-gold/10',
    activeText: 'text-[#7a4a00]',
    activeBorder: 'border-gold',
    iconColour: '#e8a030',
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
    <div className="max-w-xl mx-auto px-5 py-8 md:py-10">

      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-charcoal mb-1">Share your feedback</h1>
        <p className="text-mid text-sm leading-relaxed">
          Help us improve Grant Tracker. Every message is read and taken seriously.
        </p>
      </div>

      {/* Type selector */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {TYPES.map(t => {
          const Icon = t.icon
          const isActive = activeType === t.id
          return (
            <button
              key={t.id}
              onClick={() => { setActiveType(t.id); setStatus('idle') }}
              className={`flex flex-col items-center gap-2.5 px-3 py-5 text-center border-2 rounded-xl transition-all ${
                isActive
                  ? `${t.activeBg} ${t.activeBorder} ${t.activeText}`
                  : 'bg-white border-warm/60 text-mid hover:border-warm hover:text-charcoal'
              }`}
            >
              <Icon
                size={20}
                style={{ color: isActive ? t.iconColour : '#9ca3af' }}
              />
              <span className="text-xs font-semibold leading-tight">{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* Form card */}
      <div className="bg-white border border-warm/60 rounded-xl overflow-hidden"
        style={{ boxShadow: '0 2px 16px rgba(26,46,43,0.06)' }}>

        {status === 'sent' ? (
          <div className="text-center py-14 px-8">
            <div className="w-12 h-12 bg-forest/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={22} className="text-forest" />
            </div>
            <p className="font-display text-xl font-bold text-charcoal mb-1">Thank you!</p>
            <p className="text-sm text-mid mb-6 leading-relaxed">
              Your feedback has been received. We really appreciate it.
            </p>
            <button
              onClick={() => setStatus('idle')}
              className="text-sm text-coral hover:underline font-medium"
            >
              Submit another →
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="p-6">
              <label className="block text-sm font-semibold text-charcoal mb-2">
                {active.label}
              </label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder={active.placeholder}
                rows={7}
                required
                className="form-input w-full resize-none text-sm rounded-lg"
              />
              {status === 'error' && (
                <p className="text-xs text-red-500 mt-2">
                  Something went wrong — please try again or email us at{' '}
                  <a href="mailto:hello@granttracker.co.uk" className="underline">hello@granttracker.co.uk</a>
                </p>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-warm/60 px-6 py-4 bg-cream/40">
              <p className="text-xs text-light">Your account details are attached automatically.</p>
              <button
                type="submit"
                disabled={status === 'sending' || !message.trim()}
                className="px-5 py-2.5 bg-forest text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {status === 'sending' ? 'Sending…' : 'Send feedback →'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Contact strip */}
      <div className="mt-5 flex items-center justify-center gap-2 text-xs text-light">
        <Mail size={12} />
        <span>
          Need a faster response?{' '}
          <a
            href="mailto:hello@granttracker.co.uk"
            className="text-mid hover:text-charcoal hover:underline transition-colors"
          >
            hello@granttracker.co.uk
          </a>
        </span>
      </div>

    </div>
  )
}
