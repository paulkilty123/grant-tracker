'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

const UI = 'var(--font-space-grotesk)'

/**
 * The primary action on this page is Copy, not Connect.
 *
 * Shoots cannot perform the connection — that happens inside Claude, and this
 * page's only job is to hand over a URL and explain what is about to happen.
 * A "Connect" button here would send people hunting for something that cannot
 * exist. For the same reason there is no Disconnect anywhere on the page.
 */
export function CopyLink({ url, variant = 'primary' }: { url: string; variant?: 'primary' | 'small' }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      return   // clipboard blocked; the URL is on screen to copy by hand
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const base: React.CSSProperties = {
    fontFamily: UI, cursor: 'pointer', display: 'inline-flex',
    alignItems: 'center', gap: 8, whiteSpace: 'nowrap', borderRadius: 999,
  }

  if (variant === 'small') {
    return (
      <button onClick={copy} style={{
        ...base, fontSize: 13.5, fontWeight: 600, color: '#1D3C3E',
        background: '#fff', border: '1.5px solid rgba(29,60,62,0.24)', padding: '8px 16px',
      }}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    )
  }

  return (
    <button onClick={copy} style={{
      ...base, fontSize: 15, fontWeight: 600, color: '#F6F1E7',
      background: '#1D3C3E', border: 'none', padding: '13px 24px',
    }}>
      {copied ? <Check size={16} /> : <Copy size={16} />}
      {copied ? 'Copied to clipboard' : 'Copy connection link'}
    </button>
  )
}
