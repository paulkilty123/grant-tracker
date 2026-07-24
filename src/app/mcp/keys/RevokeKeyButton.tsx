'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function RevokeKeyButton({ keyId, keyName }: { keyId: string; keyName: string }) {
  const router = useRouter()
  const [revoking, setRevoking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRevoke() {
    if (!window.confirm(`Revoke "${keyName}"? Any agent using this key will lose access immediately. This cannot be undone.`)) {
      return
    }
    setRevoking(true)
    setError(null)
    try {
      const r = await fetch(`/api/mcp/keys/${keyId}/revoke`, { method: 'POST', body: '{}' })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        setError(j?.error?.message ?? 'Revoke failed')
        setRevoking(false)
        return
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revoke failed')
      setRevoking(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1 flex-shrink-0">
      <button
        onClick={handleRevoke}
        disabled={revoking}
        className="text-xs font-semibold px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
        style={{ background: 'var(--state-error-pale)', color: 'var(--state-error)', fontFamily: 'var(--font-space-grotesk)' }}
      >
        {revoking ? 'Revoking…' : 'Revoke'}
      </button>
      {error && <span className="text-[10px]" style={{ color: 'var(--state-error)' }}>{error}</span>}
    </div>
  )
}
