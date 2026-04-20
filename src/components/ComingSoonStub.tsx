'use client'

import { Clock } from 'lucide-react'

/**
 * Generic "available after beta" placeholder. Linked from the avatar
 * dropdown (Account, Notifications) so users don't hit a 404 while the
 * real pages are being built post-beta per the launch plan.
 */
export default function ComingSoonStub({ title, body }: { title: string; body: string }) {
  return (
    <div className="max-w-xl">
      <div
        className="p-8 md:p-10 rounded-xl border"
        style={{ background: '#FAF7F2', borderColor: '#E4E2DA' }}
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center mb-5"
          style={{ background: 'rgba(132,204,22,0.15)' }}
        >
          <Clock className="w-5 h-5" style={{ color: '#3F6814' }} />
        </div>
        <h2
          className="text-2xl font-bold text-charcoal mb-2"
          style={{ fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.02em' }}
        >
          {title}
        </h2>
        <p className="text-sm text-mid leading-relaxed">
          {body}
        </p>
      </div>
    </div>
  )
}
