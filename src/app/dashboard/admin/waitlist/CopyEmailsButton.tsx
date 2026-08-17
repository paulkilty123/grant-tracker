'use client'

import { useState } from 'react'

/**
 * Copies the whole list as a comma-separated string, which is the paste format
 * every mail client accepts in a To/BCC field. The addresses are rendered on
 * the page anyway, so this adds convenience, not exposure.
 */
export default function CopyEmailsButton({ emails }: { emails: string[] }) {
  const [copied, setCopied] = useState(false)

  if (emails.length === 0) return null

  async function copy() {
    try {
      await navigator.clipboard.writeText(emails.join(', '))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be blocked (insecure context, permissions). Say so
      // rather than showing a success state that did not happen.
      setCopied(false)
      alert('Could not copy. Select the addresses in the table instead.')
    }
  }

  return (
    <button
      onClick={copy}
      style={{
        fontFamily: 'var(--font-space-grotesk)',
        fontSize: 13,
        fontWeight: 600,
        padding: '8px 14px',
        borderRadius: 8,
        border: '1px solid #2C2C2A',
        background: copied ? '#173404' : '#fff',
        color: copied ? '#F1F7E4' : '#2C2C2A',
        cursor: 'pointer',
      }}
    >
      {copied ? 'Copied' : `Copy all ${emails.length} addresses`}
    </button>
  )
}
