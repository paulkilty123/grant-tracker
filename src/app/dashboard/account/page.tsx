'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getOrganisationsByOwner } from '@/lib/organisations'
import { Star, Check, X, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import type { Organisation } from '@/types'
import { useIsMobile } from '@/hooks/useIsMobile'
import { brand } from '@/config/brand'

/* ─── design tokens ─── */
const T = {
  lime:          '#8ECB3C',
  greenDeep:     '#173404',
  greenMid:      '#639922',
  pageBg:        '#FAFAF7',
  cream:         '#F5F1E8',
  white:         '#FFFFFF',
  textPrimary:   '#2C2C2A',
  textSecondary: '#5F5E5A',
  textTertiary:  '#8A8986',
  border:        'rgba(23, 52, 4, 0.08)',
  borderStrong:  'rgba(23, 52, 4, 0.14)',
  strongPanel:   '#F4F9ED',
  coralBg:       '#FAECE7',
  coralText:     '#993C1D',
  coralStrong:   '#D85A30',
  amberBg:       '#FAEEDA',
  amberText:     '#854F0B',
}
const UI   = 'var(--font-space-grotesk)'
const BODY = 'var(--font-dm-sans)'

/* ─── helpers ─── */
function orgInitials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w: string) => w[0].toUpperCase()).join('')
}
function legalLabel(ls: string | null) {
  const MAP: Record<string, string> = {
    cic_guarantee: 'CIC', cic_shares: 'CIC (Shares)', cio: 'CIO',
    registered_charity: 'Registered Charity', ltd_guarantee: 'Ltd by Guarantee',
    ltd_shares: 'Ltd by Shares', llp: 'LLP', cooperative: 'Co-operative',
    unincorporated: 'Unincorporated', sole_trader: 'Sole Trader', not_registered: 'Not Registered',
  }
  return ls ? (MAP[ls] ?? ls) : null
}

/* ─── shared primitives ─── */
function SectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h2 style={{ fontFamily: UI, fontWeight: 600, fontSize: 16, color: T.textPrimary, letterSpacing: '-0.01em', marginBottom: 4 }}>
        {title}
      </h2>
      <p style={{ fontFamily: BODY, fontSize: 13.5, color: T.textSecondary, margin: 0 }}>{desc}</p>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
      {children}
    </div>
  )
}

function Row({ label, children, action, last }: { label: React.ReactNode; children: React.ReactNode; action?: React.ReactNode; last?: boolean }) {
  const isMobile = useIsMobile()
  if (isMobile) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        padding: '14px 16px',
        borderBottom: last ? 'none' : `1px solid ${T.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontFamily: UI, fontWeight: 500, fontSize: 13, color: T.textSecondary }}>{label}</div>
          {action}
        </div>
        <div>{children}</div>
      </div>
    )
  }
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: 20,
      alignItems: 'center', padding: '16px 22px',
      borderBottom: last ? 'none' : `1px solid ${T.border}`,
    }}>
      <div style={{ fontFamily: UI, fontWeight: 500, fontSize: 13.5, color: T.textSecondary }}>{label}</div>
      <div>{children}</div>
      <div>{action}</div>
    </div>
  )
}

function Val({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <div style={{ fontFamily: BODY, fontSize: 14.5, color: muted ? T.textTertiary : T.textPrimary }}>{children}</div>
}
function Sub({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: BODY, fontSize: 12.5, color: T.textTertiary, marginTop: 2 }}>{children}</div>
}

function InlineLink({ children, onClick, danger }: { children: React.ReactNode; onClick?: () => void; danger?: boolean }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        fontFamily: UI, fontWeight: 500, fontSize: 13,
        border: 'none', cursor: 'pointer', padding: '6px 10px', borderRadius: 6,
        color: danger ? T.coralStrong : hov ? T.greenDeep : T.textSecondary,
        background: hov ? (danger ? T.coralBg : T.pageBg) : 'transparent',
        transition: 'all 0.15s ease',
      } as React.CSSProperties}
    >
      {children}
    </button>
  )
}

function DangerButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        fontFamily: UI, fontWeight: 500, fontSize: 13.5,
        background: hov ? T.coralBg : 'transparent',
        color: T.coralStrong,
        border: `1px solid ${hov ? T.coralStrong : 'rgba(216,90,48,0.3)'}`,
        padding: '8px 16px', borderRadius: 8, cursor: 'pointer', flexShrink: 0,
        transition: 'all 0.15s ease',
      }}
    >
      {children}
    </button>
  )
}

/* ─── toggle ─── */
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!on)}
      style={{
        width: 40, height: 22, background: on ? T.lime : '#E0DFD9',
        borderRadius: 11, position: 'relative', cursor: 'pointer',
        transition: 'background 0.2s ease', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', width: 18, height: 18, background: T.white,
        borderRadius: '50%', top: 2, left: 2,
        transform: on ? 'translateX(18px)' : 'none',
        transition: 'transform 0.2s ease',
        boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
      }} />
    </div>
  )
}

/* ─── modal shell ─── */
function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(23,52,4,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: T.white, borderRadius: 14, padding: '28px 32px', width: '100%', maxWidth: 420, boxShadow: '0 8px 40px rgba(0,0,0,0.15)' }}>
        {children}
      </div>
    </div>
  )
}

function ModalTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 17, color: T.textPrimary, marginBottom: 6 }}>{children}</div>
}
function ModalDesc({ children }: { children: React.ReactNode }) {
  return <p style={{ fontFamily: BODY, fontSize: 13.5, color: T.textSecondary, marginBottom: 22, lineHeight: 1.6 }}>{children}</p>
}
function ModalLabel({ children }: { children: React.ReactNode }) {
  return <label style={{ fontFamily: UI, fontWeight: 500, fontSize: 13, color: T.textSecondary, display: 'block', marginBottom: 6 }}>{children}</label>
}
function ModalInput({ type = 'text', value, onChange, placeholder }: { type?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ width: '100%', fontFamily: BODY, fontSize: 14, border: `1px solid ${T.borderStrong}`, borderRadius: 8, padding: '9px 12px', outline: 'none', color: T.textPrimary, marginBottom: 14 }}
    />
  )
}
function ModalError({ msg }: { msg: string }) {
  return msg ? <p style={{ fontFamily: BODY, fontSize: 13, color: T.coralStrong, marginBottom: 14 }}>{msg}</p> : null
}
function ModalActions({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>{children}</div>
}
function SaveBtn({ onClick, disabled, label = 'Save' }: { onClick: () => void; disabled?: boolean; label?: string }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ fontFamily: UI, fontWeight: 500, fontSize: 14, background: T.lime, color: T.white, border: 'none', borderRadius: 8, padding: '9px 20px', cursor: disabled ? 'default' : 'pointer' }}>
      {label}
    </button>
  )
}

/* ─── name edit row ─── */
function NameRow({ initialName, onSave }: { initialName: string; onSave: (n: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(initialName)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])
  useEffect(() => { setVal(initialName) }, [initialName])

  async function save() {
    if (!val.trim()) return
    setSaving(true)
    await onSave(val.trim())
    setSaving(false)
    setEditing(false)
  }

  return (
    <Row
      label="Name"
      action={!editing ? <InlineLink onClick={() => setEditing(true)}>Edit</InlineLink> : undefined}
    >
      {editing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            ref={inputRef}
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setVal(initialName) } }}
            style={{ fontFamily: BODY, fontSize: 14, color: T.textPrimary, border: `1px solid ${T.borderStrong}`, borderRadius: 8, padding: '7px 11px', outline: 'none', background: T.white, width: '100%', maxWidth: 260 }}
          />
          <button onClick={save} disabled={saving} style={{ background: T.lime, border: 'none', borderRadius: 8, cursor: 'pointer', padding: '7px 9px', display: 'flex', alignItems: 'center' }}>
            <Check size={14} color={T.white} strokeWidth={2.5} />
          </button>
          <button onClick={() => { setEditing(false); setVal(initialName) }} style={{ background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 8, cursor: 'pointer', padding: '7px 9px', display: 'flex', alignItems: 'center' }}>
            <X size={14} color={T.textSecondary} />
          </button>
        </div>
      ) : (
        <Val>{initialName || <span style={{ color: T.textTertiary }}>Not set</span>}</Val>
      )}
    </Row>
  )
}

/* ─── email change modal ─── */
function EmailModal({ currentEmail, onClose, onSaved }: { currentEmail: string; onClose: () => void; onSaved: (e: string) => void }) {
  const [newEmail, setNewEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handle() {
    setError('')
    if (!newEmail.trim() || !newEmail.includes('@')) { setError('Please enter a valid email address.'); return }
    if (newEmail.trim().toLowerCase() === currentEmail.toLowerCase()) { setError('That is already your current email.'); return }
    setSaving(true)
    const supabase = createClient()
    const { error: err } = await supabase.auth.updateUser({ email: newEmail.trim() })
    setSaving(false)
    if (err) { setError(err.message); return }
    setDone(true)
    onSaved(newEmail.trim())
  }

  return (
    <Modal onClose={onClose}>
      {done ? (
        <>
          <ModalTitle>Check your inbox</ModalTitle>
          <ModalDesc>A confirmation link has been sent to <strong>{newEmail}</strong>. Click it to complete the change. Your current email stays active until then.</ModalDesc>
          <ModalActions><SaveBtn onClick={onClose} label="Done" /></ModalActions>
        </>
      ) : (
        <>
          <ModalTitle>Change email address</ModalTitle>
          <ModalDesc>We'll send a confirmation link to your new address. Your current email stays active until you confirm.</ModalDesc>
          <ModalLabel>New email address</ModalLabel>
          <ModalInput type="email" value={newEmail} onChange={setNewEmail} placeholder="you@example.com" />
          <ModalError msg={error} />
          <ModalActions>
            <InlineLink onClick={onClose}>Cancel</InlineLink>
            <SaveBtn onClick={handle} disabled={saving} label={saving ? 'Sending…' : 'Send confirmation'} />
          </ModalActions>
        </>
      )}
    </Modal>
  )
}

/* ─── 2FA enroll modal ─── */
function TwoFAEnrollModal({ onClose, onEnrolled }: { onClose: () => void; onEnrolled: (factorId: string) => void }) {
  const [step, setStep]     = useState<'qr' | 'verify' | 'done'>('qr')
  const [qrUrl, setQrUrl]   = useState('')
  const [secret, setSecret] = useState('')
  const [factorId, setFactorId] = useState('')
  const [code, setCode]     = useState('')
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function enroll() {
      const supabase = createClient()
      const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: brand.name })
      if (err || !data) { setError(err?.message ?? 'Failed to start setup.'); setLoading(false); return }
      setQrUrl(data.totp.qr_code)
      setSecret(data.totp.secret)
      setFactorId(data.id)
      setLoading(false)
    }
    enroll()
  }, [])

  async function verify() {
    setError('')
    if (code.length < 6) { setError('Enter the 6-digit code from your authenticator app.'); return }
    const supabase = createClient()
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
    if (err) { setError('Code incorrect or expired. Try again.'); return }
    setStep('done')
    onEnrolled(factorId)
  }

  return (
    <Modal onClose={onClose}>
      {loading && <p style={{ fontFamily: BODY, fontSize: 14, color: T.textTertiary }}>Setting up…</p>}

      {!loading && step === 'qr' && (
        <>
          <ModalTitle>Set up two-factor authentication</ModalTitle>
          <ModalDesc>Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.), then enter the 6-digit code it shows.</ModalDesc>
          {qrUrl && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <img src={qrUrl} alt="2FA QR code" style={{ width: 180, height: 180, borderRadius: 8, border: `1px solid ${T.border}` }} />
            </div>
          )}
          <details style={{ marginBottom: 18 }}>
            <summary style={{ fontFamily: UI, fontWeight: 500, fontSize: 12.5, color: T.textTertiary, cursor: 'pointer', userSelect: 'none' }}>Can't scan? Enter key manually</summary>
            <div style={{ fontFamily: 'monospace', fontSize: 13, color: T.textPrimary, background: T.pageBg, border: `1px solid ${T.border}`, borderRadius: 6, padding: '8px 12px', marginTop: 8, wordBreak: 'break-all' }}>{secret}</div>
          </details>
          <ModalError msg={error} />
          <ModalActions>
            <InlineLink onClick={onClose}>Cancel</InlineLink>
            <SaveBtn onClick={() => setStep('verify')} label="Next →" />
          </ModalActions>
        </>
      )}

      {!loading && step === 'verify' && (
        <>
          <ModalTitle>Enter the code</ModalTitle>
          <ModalDesc>Enter the 6-digit code shown in your authenticator app to confirm setup.</ModalDesc>
          <ModalLabel>6-digit code</ModalLabel>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={e => { if (e.key === 'Enter') verify() }}
            placeholder="000000"
            style={{ width: '100%', fontFamily: 'monospace', fontSize: 22, letterSpacing: '0.2em', textAlign: 'center', border: `1px solid ${T.borderStrong}`, borderRadius: 8, padding: '12px', outline: 'none', color: T.textPrimary, marginBottom: 14 }}
          />
          <ModalError msg={error} />
          <ModalActions>
            <InlineLink onClick={() => setStep('qr')}>← Back</InlineLink>
            <SaveBtn onClick={verify} label="Verify & enable" />
          </ModalActions>
        </>
      )}

      {step === 'done' && (
        <>
          <ModalTitle>Two-factor authentication enabled</ModalTitle>
          <ModalDesc>Your account is now protected with a second sign-in step. Keep your authenticator app accessible.</ModalDesc>
          <ModalActions><SaveBtn onClick={onClose} label="Done" /></ModalActions>
        </>
      )}
    </Modal>
  )
}

/* ─── 2FA unenroll modal ─── */
function TwoFADisableModal({ factorId, onClose, onDisabled }: { factorId: string; onClose: () => void; onDisabled: () => void }) {
  const [removing, setRemoving] = useState(false)
  const [error, setError]       = useState('')

  async function handle() {
    setRemoving(true)
    const supabase = createClient()
    const { error: err } = await supabase.auth.mfa.unenroll({ factorId })
    setRemoving(false)
    if (err) { setError(err.message); return }
    onDisabled()
    onClose()
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: T.coralBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <AlertTriangle size={18} color={T.coralStrong} />
        </div>
        <ModalTitle>Disable two-factor authentication?</ModalTitle>
      </div>
      <ModalDesc>Removing 2FA makes your account less secure. You can re-enable it at any time.</ModalDesc>
      <ModalError msg={error} />
      <ModalActions>
        <InlineLink onClick={onClose}>Keep 2FA on</InlineLink>
        <button onClick={handle} disabled={removing}
          style={{ fontFamily: UI, fontWeight: 500, fontSize: 14, background: removing ? '#E0DFD9' : T.coralStrong, color: T.white, border: 'none', borderRadius: 8, padding: '9px 20px', cursor: removing ? 'default' : 'pointer' }}>
          {removing ? 'Removing…' : 'Disable 2FA'}
        </button>
      </ModalActions>
    </Modal>
  )
}

/* ─── delete modal ─── */
function DeleteModal({ email, onClose, onConfirm }: { email: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [typed, setTyped]     = useState('')
  const [deleting, setDeleting] = useState(false)
  const match = typed.trim().toLowerCase() === email.toLowerCase()

  async function handleDelete() {
    if (!match) return
    setDeleting(true)
    await onConfirm()
    setDeleting(false)
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: T.coralBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <AlertTriangle size={18} color={T.coralStrong} />
        </div>
        <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 17, color: T.textPrimary }}>Delete your account?</div>
      </div>
      <ModalDesc>
        This will permanently remove your account, all linked organisations, and every profile, match, and pipeline record. <strong style={{ color: T.textPrimary }}>This cannot be undone.</strong>
      </ModalDesc>
      <ModalLabel>Type your email to confirm: <span style={{ color: T.textPrimary }}>{email}</span></ModalLabel>
      <ModalInput type="email" value={typed} onChange={setTyped} placeholder={email} />
      <ModalActions>
        <InlineLink onClick={onClose}>Cancel</InlineLink>
        <button
          onClick={handleDelete}
          disabled={!match || deleting}
          style={{
            fontFamily: UI, fontWeight: 500, fontSize: 14,
            background: match ? T.coralStrong : '#E0DFD9',
            color: match ? T.white : T.textTertiary,
            border: 'none', borderRadius: 8, padding: '9px 20px',
            cursor: match ? 'pointer' : 'default',
            transition: 'all 0.2s ease',
          }}
        >
          {deleting ? 'Deleting…' : 'Delete my account'}
        </button>
      </ModalActions>
    </Modal>
  )
}

/* ═══════════════════════════════════════════════
   Main page
   ═══════════════════════════════════════════════ */
export default function AccountPage() {
  const isMobile = useIsMobile()
  const supabase = createClient()
  const [userId, setUserId]         = useState<string | null>(null)
  const [email, setEmail]           = useState('')
  const [displayName, setDisplayName] = useState('')
  const [org, setOrg]               = useState<Organisation | null>(null)
  const [loading, setLoading]       = useState(true)

  // 2FA state
  const [twoFA, setTwoFA]           = useState(false)
  const [twoFAFactorId, setTwoFAFactorId] = useState<string | null>(null)

  // modals
  const [showEmailModal, setShowEmailModal]   = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [showTwoFAEnroll, setShowTwoFAEnroll] = useState(false)
  const [showTwoFADisable, setShowTwoFADisable] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      setEmail(user.email ?? '')
      setDisplayName(user.user_metadata?.full_name ?? user.user_metadata?.name ?? '')

      // Check 2FA factors
      const { data: mfaData } = await supabase.auth.mfa.listFactors()
      const verified = mfaData?.totp?.find((f: { status: string }) => f.status === 'verified')
      if (verified) { setTwoFA(true); setTwoFAFactorId(verified.id) }

      const orgs = await getOrganisationsByOwner(user.id)
      setOrg(orgs[0] ?? null)
      setLoading(false)
    }
    load()
  }, [])

  async function saveName(name: string) {
    await supabase.auth.updateUser({ data: { full_name: name } })
    setDisplayName(name)
  }

  function handleToggle2FA(on: boolean) {
    if (on) { setShowTwoFAEnroll(true) }
    else     { setShowTwoFADisable(true) }
  }

  async function handleDelete() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ fontFamily: BODY, fontSize: 14, color: T.textTertiary }}>Loading…</div>
      </div>
    )
  }

  const legalStr  = legalLabel(org?.legal_structure ?? null)
  const location  = org?.primary_location ?? null
  const linkedDate = org?.created_at
    ? new Date(org.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null
  const orgMeta = [legalStr, location, linkedDate ? `Linked ${linkedDate}` : null].filter(Boolean).join(' · ')

  return (
    <div style={{ padding: isMobile ? '24px 16px 60px' : '40px 48px 80px', maxWidth: 760, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ marginBottom: 36 }}>
        <h1 style={{ fontFamily: UI, fontWeight: 600, fontSize: 28, letterSpacing: '-0.02em', color: T.textPrimary, marginBottom: 6 }}>Account</h1>
        <p style={{ fontFamily: BODY, fontSize: 15, color: T.textSecondary, margin: 0 }}>Your login, your organisation, and your plan.</p>
      </div>

      {/* ── Your details ── */}
      <section style={{ marginBottom: 36 }}>
        <SectionHeader title="Your details" desc={`How you sign in to ${brand.name}.`} />
        <Card>
          <NameRow initialName={displayName} onSave={saveName} />
          <Row
            label="Email"
            action={<InlineLink onClick={() => setShowEmailModal(true)}>Change</InlineLink>}
          >
            <Val>{email}</Val>
            <Sub>Used for sign-in and account notifications</Sub>
          </Row>
          <Row
            last
            label="Password"
            action={<InlineLink onClick={() => setShowPasswordModal(true)}>Change</InlineLink>}
          >
            <Val>••••••••••••</Val>
          </Row>
        </Card>
      </section>

      {/* ── Your organisation ── */}
      <section style={{ marginBottom: 36 }}>
        <SectionHeader title="Your organisation" desc="The organisation this account is linked to. Update details via your profile." />
        <Card>
          {org ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px' }}>
              <div style={{ width: 40, height: 40, background: T.cream, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: UI, fontWeight: 600, fontSize: 14, color: T.greenDeep, flexShrink: 0 }}>
                {orgInitials(org.name ?? '')}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 14.5, color: T.textPrimary, marginBottom: 2 }}>{org.name}</div>
                {orgMeta && <div style={{ fontFamily: BODY, fontSize: 12.5, color: T.textTertiary }}>{orgMeta}</div>}
              </div>
              <Link href="/dashboard/profile" style={{ fontFamily: UI, fontWeight: 500, fontSize: 13, color: T.textSecondary, textDecoration: 'none', padding: '6px 10px', borderRadius: 6, whiteSpace: 'nowrap' }}>
                Go to profile →
              </Link>
            </div>
          ) : (
            <div style={{ padding: '16px 22px', fontFamily: BODY, fontSize: 14, color: T.textTertiary }}>
              No organisation linked.{' '}
              <Link href="/dashboard/profile" style={{ color: T.greenMid, textDecoration: 'none', fontWeight: 500 }}>Set up your profile →</Link>
            </div>
          )}
        </Card>
      </section>

      {/* ── Security ── */}
      <section style={{ marginBottom: 36 }}>
        <SectionHeader title="Security" desc="Extra protection for your account." />
        <Card>
          <Row
            label={
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap', rowGap: 4 }}>
                <span>Two-factor auth</span>
                <span style={{ display: 'inline-block', marginLeft: 8, fontFamily: UI, fontWeight: 500, fontSize: 11, color: T.amberText, background: T.amberBg, border: '1px solid rgba(133,79,11,0.2)', padding: '2px 8px', borderRadius: 10 }}>Recommended</span>
              </div>
            }
            action={<Toggle on={twoFA} onChange={handleToggle2FA} />}
          >
            <Val muted={!twoFA}>{twoFA ? 'On' : 'Off'}</Val>
            <Sub>Add a second step using an authenticator app</Sub>
          </Row>
          <Row last label="Active sessions" action={<InlineLink>View all</InlineLink>}>
            <Val>This device</Val>
            <Sub>Signed in on this browser session</Sub>
          </Row>
        </Card>
      </section>

      {/* ── Billing ── */}
      <section style={{ marginBottom: 36 }}>
        <SectionHeader title="Billing" desc="Your plan and payment details." />
        <div style={{ background: T.cream, border: '1px solid rgba(23,52,4,0.10)', borderRadius: 12, padding: '22px 26px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ width: 40, height: 40, background: T.white, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.greenDeep, flexShrink: 0 }}>
            <Star size={18} strokeWidth={2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 15, color: T.textPrimary, marginBottom: 4 }}>You're in the founding cohort</div>
            <div style={{ fontFamily: BODY, fontSize: 13.5, color: T.textSecondary, lineHeight: 1.55 }}>
              {brand.name} is free for you for six months. After that, cohort members lock in a permanent <strong style={{ color: T.textPrimary, fontWeight: 600 }}>founding rate</strong>, meaningfully below the standard price, for as long as you stay active. We&apos;ll email you ahead of any changes, so there are no surprises.
            </div>
          </div>
        </div>
      </section>

      {/* ── Your data ── */}
      <section style={{ marginBottom: 36 }}>
        <SectionHeader title="Your data" desc="What you build here is yours to keep." />
        <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: isMobile ? '16px 18px' : '20px 22px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', gap: isMobile ? 12 : 20 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 14.5, color: T.textPrimary, marginBottom: 2 }}>Export your data</div>
            <div style={{ fontFamily: BODY, fontSize: 13, color: T.textSecondary, lineHeight: 1.5 }}>
              Everything you do here builds your organisation&apos;s profile. It&apos;s yours, it persists beyond beta, and you can export it any time. Downloads your profile, pipeline, and saved opportunities as JSON.
            </div>
          </div>
          <a
            href="/api/export"
            download
            style={{ fontFamily: UI, fontWeight: 600, fontSize: 13, color: '#173404', background: '#fff', border: '1px solid #2C2C2A', padding: '8px 16px', borderRadius: 8, textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            Download JSON
          </a>
        </div>
      </section>

      {/* ── Danger zone ── */}
      <section style={{ marginTop: 48, paddingTop: 32, borderTop: `1px solid ${T.border}` }}>
        <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 13, color: T.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 14 }}>
          Danger zone
        </div>
        <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: isMobile ? '16px 18px' : '20px 22px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', gap: isMobile ? 12 : 20 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 14.5, color: T.textPrimary, marginBottom: 2 }}>Delete your account</div>
            <div style={{ fontFamily: BODY, fontSize: 13, color: T.textSecondary, lineHeight: 1.5 }}>Permanently removes your account, all your organisations, and every associated profile, match, and pipeline record. This can&apos;t be undone.</div>
          </div>
          <DangerButton onClick={() => setShowDeleteModal(true)}>Delete account</DangerButton>
        </div>
      </section>

      {/* ── Modals ── */}
      {showEmailModal && (
        <EmailModal
          currentEmail={email}
          onClose={() => setShowEmailModal(false)}
          onSaved={newE => { setEmail(newE); setShowEmailModal(false) }}
        />
      )}
      {showPasswordModal && <PasswordModal onClose={() => setShowPasswordModal(false)} />}
      {showTwoFAEnroll && (
        <TwoFAEnrollModal
          onClose={() => setShowTwoFAEnroll(false)}
          onEnrolled={id => { setTwoFA(true); setTwoFAFactorId(id); setShowTwoFAEnroll(false) }}
        />
      )}
      {showTwoFADisable && twoFAFactorId && (
        <TwoFADisableModal
          factorId={twoFAFactorId}
          onClose={() => setShowTwoFADisable(false)}
          onDisabled={() => { setTwoFA(false); setTwoFAFactorId(null) }}
        />
      )}
      {showDeleteModal && (
        <DeleteModal
          email={email}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}

/* ─── password change modal ─── */
function PasswordModal({ onClose }: { onClose: () => void }) {
  const [next, setNext]       = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw]   = useState(false)
  const [error, setError]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [done, setDone]       = useState(false)

  async function handleSave() {
    setError('')
    if (next.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (next !== confirm) { setError('Passwords do not match.'); return }
    setSaving(true)
    const supabase = createClient()
    const { error: err } = await supabase.auth.updateUser({ password: next })
    setSaving(false)
    if (err) { setError(err.message); return }
    setDone(true)
  }

  return (
    <Modal onClose={onClose}>
      {done ? (
        <>
          <ModalTitle>Password updated</ModalTitle>
          <ModalDesc>Your password has been changed successfully.</ModalDesc>
          <ModalActions><SaveBtn onClick={onClose} label="Done" /></ModalActions>
        </>
      ) : (
        <>
          <ModalTitle>Change password</ModalTitle>
          <ModalDesc>Choose a strong password of at least 8 characters.</ModalDesc>
          <ModalLabel>New password</ModalLabel>
          <ModalInput type={showPw ? 'text' : 'password'} value={next} onChange={setNext} />
          <ModalLabel>Confirm new password</ModalLabel>
          <ModalInput type={showPw ? 'text' : 'password'} value={confirm} onChange={setConfirm} />
          <div style={{ marginTop: -4, marginBottom: 12 }}>
            <InlineLink onClick={() => setShowPw(v => !v)}>{showPw ? 'Hide' : 'Show'} passwords</InlineLink>
          </div>
          <ModalError msg={error} />
          <ModalActions>
            <InlineLink onClick={onClose}>Cancel</InlineLink>
            <SaveBtn onClick={handleSave} disabled={saving} label={saving ? 'Saving…' : 'Save password'} />
          </ModalActions>
        </>
      )}
    </Modal>
  )
}
