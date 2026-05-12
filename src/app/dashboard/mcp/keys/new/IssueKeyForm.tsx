'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Copy } from 'lucide-react'

interface Props {
  tosVersion: string
  tosStatus: string | null
}

interface IssuedKey {
  api_key: string
  key: {
    id: string
    key_prefix: string
    name: string
    utm_source: string
    created_at: string
    tos_version: string
  }
}

export function IssueKeyForm({ tosVersion, tosStatus }: Props) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [useCase, setUseCase] = useState('')
  const [tosAccepted, setTosAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<IssuedKey | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const r = await fetch('/api/mcp/keys/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          org_name: orgName.trim() || undefined,
          use_case: useCase.trim() || undefined,
          tos_accepted: tosAccepted,
          tos_version: tosVersion,
        }),
      })
      const j = await r.json()
      if (!r.ok) {
        setError(j?.error?.message ?? 'Issuance failed')
        setLoading(false)
        return
      }
      setIssued(j as IssuedKey)
      setLoading(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Issuance failed')
      setLoading(false)
    }
  }

  async function copyKey() {
    if (!issued) return
    await navigator.clipboard.writeText(issued.api_key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (issued) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border p-5" style={{ background: '#F1F7E4', borderColor: 'rgba(99,153,34,0.30)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Check className="w-5 h-5" style={{ color: '#3B6D11' }} />
            <p className="text-sm font-bold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
              Key created — save it now
            </p>
          </div>
          <p className="text-xs mb-4" style={{ color: '#3B6D11' }}>
            This is the only time you&apos;ll see the full key. Copy it somewhere safe (a password manager is good) before leaving this page.
          </p>
          <div className="bg-white border rounded-md p-3 flex items-center gap-3" style={{ borderColor: 'rgba(99,153,34,0.30)' }}>
            <code className="flex-1 text-xs break-all" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              {issued.api_key}
            </code>
            <button
              onClick={copyKey}
              className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md hover:opacity-90"
              style={{ background: '#173404', color: '#FAF7F2', fontFamily: 'var(--font-space-grotesk)' }}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-warm p-5 bg-white text-sm" style={{ boxShadow: '0 2px 16px rgba(26,46,43,0.04)' }}>
          <p className="font-semibold mb-2 text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            Using your key
          </p>
          <p className="text-xs text-mid mb-3 leading-relaxed">
            Pass the key in the <code className="text-[11px] px-1 py-0.5 rounded" style={{ background: '#F0EDE2' }}>Authorization</code> header on every MCP request:
          </p>
          <pre className="text-[11px] p-3 rounded-md overflow-x-auto" style={{ background: '#F0EDE2', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            <code>Authorization: Bearer {issued.api_key}</code>
          </pre>
        </div>

        <button
          onClick={() => router.push('/dashboard/mcp/keys')}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
          style={{ background: '#173404', color: '#FAF7F2', fontFamily: 'var(--font-space-grotesk)' }}
        >
          Done
        </button>
      </div>
    )
  }

  const isDraft = tosStatus?.startsWith('DRAFT')

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-md p-3 text-sm" style={{ background: '#FAECE7', color: '#993C1D' }}>
          {error}
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: '#2C2C2A', fontFamily: 'var(--font-space-grotesk)' }}>
          Name <span style={{ color: '#993C1D' }}>*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Claude desktop"
          required
          maxLength={80}
          className="form-input"
        />
        <p className="text-[11px] text-mid mt-1">A label so you can identify this key later. Visible to you only.</p>
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: '#2C2C2A', fontFamily: 'var(--font-space-grotesk)' }}>
          Organisation name (optional)
        </label>
        <input
          type="text"
          value={orgName}
          onChange={e => setOrgName(e.target.value)}
          placeholder="e.g. Acme Charity"
          maxLength={120}
          className="form-input"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: '#2C2C2A', fontFamily: 'var(--font-space-grotesk)' }}>
          Use case (optional)
        </label>
        <textarea
          value={useCase}
          onChange={e => setUseCase(e.target.value)}
          placeholder="Briefly, what will you use the MCP for? Helps us understand adoption patterns."
          rows={3}
          maxLength={500}
          className="form-input"
        />
      </div>

      <div className="rounded-xl border border-warm p-5" style={{ background: '#FAFAF7' }}>
        <p className="text-sm font-semibold text-charcoal mb-2" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
          Terms of Service
        </p>
        {isDraft && (
          <p className="text-xs mb-2" style={{ color: '#993C1D' }}>
            {tosStatus}
          </p>
        )}
        <p className="text-xs text-mid mb-3 leading-relaxed">
          Please read the full <Link href="/mcp/terms" target="_blank" className="font-semibold hover:underline" style={{ color: '#3B6D11' }}>Terms of Service</Link> (version <code className="text-[10px] px-1 rounded" style={{ background: '#F0EDE2' }}>{tosVersion}</code>) before continuing. They cover attribution, no-commercial-re-aggregation, no-rebranding, rate-limit conduct, and Grant Tracker&apos;s right to revoke keys.
        </p>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={tosAccepted}
            onChange={e => setTosAccepted(e.target.checked)}
            className="mt-0.5 flex-shrink-0"
          />
          <span className="text-xs text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            I&apos;ve read and accept the Terms of Service ({tosVersion}).
          </span>
        </label>
      </div>

      <button
        type="submit"
        disabled={loading || !tosAccepted || !name.trim()}
        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: '#8ECB3C', color: '#173404', fontFamily: 'var(--font-space-grotesk)' }}
      >
        {loading ? 'Generating…' : 'Generate key'}
      </button>
    </form>
  )
}
