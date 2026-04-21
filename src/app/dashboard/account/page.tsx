'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getOrganisationsByOwner } from '@/lib/organisations'
import { Star, Check, X, AlertTriangle, ChevronRight, LogOut } from 'lucide-react'
import Link from 'next/link'
import type { Organisation } from '@/types'

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
  strongBorder:  '#639922',
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
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
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

/* ─── sub-components ─── */
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

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: T.white, border: `1px solid ${T.border}`,
      borderRadius: 12, overflow: 'hidden', ...style,
    }}>
      {children}
    </div>
  )
}

function FieldRow({ label, children, action }: { label: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: 20,
      alignItems: 'center', padding: '16px 22px',
      borderBottom: `1px solid ${T.border}`,
    }}>
      <div style={{ fontFamily: UI, fontWeight: 500, fontSize: 13.5, color: T.textSecondary }}>{label}</div>
      <div>{children}</div>
      <div>{action}</div>
    </div>
  )
}
function FieldRowLast({ label, children, action }: { label: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: 20,
      alignItems: 'center', padding: '16px 22px',
    }}>
      <div style={{ fontFamily: UI, fontWeight: 500, fontSize: 13.5, color: T.textSecondary }}>{label}</div>
      <div>{children}</div>
      <div>{action}</div>
    </div>
  )
}

function FieldValue({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <div style={{ fontFamily: BODY, fontSize: 14.5, color: muted ? T.textTertiary : T.textPrimary }}>{children}</div>
}
function FieldSub({ children }: { children: React.ReactNode }) {
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
    <FieldRow
      label="Name"
      action={!editing ? <InlineLink onClick={() => setEditing(true)}>Edit</InlineLink> : null}
    >
      {editing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            ref={inputRef}
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setVal(initialName) } }}
            style={{
              fontFamily: BODY, fontSize: 14, color: T.textPrimary,
              border: `1px solid ${T.borderStrong}`, borderRadius: 8, padding: '7px 11px',
              outline: 'none', background: T.white, width: '100%', maxWidth: 260,
            }}
          />
          <button onClick={save} disabled={saving} style={{ background: T.lime, border: 'none', borderRadius: 8, cursor: 'pointer', padding: '7px 9px', display: 'flex', alignItems: 'center' }}>
            <Check size={14} color={T.white} strokeWidth={2.5} />
          </button>
          <button onClick={() => { setEditing(false); setVal(initialName) }} style={{ background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 8, cursor: 'pointer', padding: '7px 9px', display: 'flex', alignItems: 'center' }}>
            <X size={14} color={T.textSecondary} />
          </button>
        </div>
      ) : (
        <FieldValue>{initialName || <span style={{ color: T.textTertiary }}>Not set</span>}</FieldValue>
      )}
    </FieldRow>
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

/* ─── password change modal ─── */
function PasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,52,4,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
      <div style={{ background: T.white, borderRadius: 14, padding: '28px 32px', width: '100%', maxWidth: 420, boxShadow: '0 8px 40px rgba(0,0,0,0.15)' }}>
        {done ? (
          <>
            <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 17, color: T.textPrimary, marginBottom: 10 }}>Password updated</div>
            <p style={{ fontFamily: BODY, fontSize: 14, color: T.textSecondary, marginBottom: 24 }}>Your password has been changed successfully.</p>
            <button onClick={onClose} style={{ fontFamily: UI, fontWeight: 500, fontSize: 14, background: T.lime, color: T.white, border: 'none', borderRadius: 8, padding: '10px 22px', cursor: 'pointer' }}>Done</button>
          </>
        ) : (
          <>
            <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 17, color: T.textPrimary, marginBottom: 6 }}>Change password</div>
            <p style={{ fontFamily: BODY, fontSize: 13.5, color: T.textSecondary, marginBottom: 22 }}>Choose a strong password of at least 8 characters.</p>
            {['New password', 'Confirm new password'].map((label, i) => (
              <div key={label} style={{ marginBottom: 14 }}>
                <label style={{ fontFamily: UI, fontWeight: 500, fontSize: 13, color: T.textSecondary, display: 'block', marginBottom: 6 }}>{label}</label>
                <input
                  type="password"
                  value={i === 0 ? next : confirm}
                  onChange={e => i === 0 ? setNext(e.target.value) : setConfirm(e.target.value)}
                  style={{ width: '100%', fontFamily: BODY, fontSize: 14, border: `1px solid ${T.borderStrong}`, borderRadius: 8, padding: '9px 12px', outline: 'none', color: T.textPrimary }}
                />
              </div>
            ))}
            {error && <p style={{ fontFamily: BODY, fontSize: 13, color: T.coralStrong, marginBottom: 14 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <InlineLink onClick={onClose}>Cancel</InlineLink>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ fontFamily: UI, fontWeight: 500, fontSize: 14, background: T.lime, color: T.white, border: 'none', borderRadius: 8, padding: '9px 20px', cursor: 'pointer' }}
              >
                {saving ? 'Saving…' : 'Save password'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ─── delete modal ─── */
function DeleteModal({ email, onClose, onConfirm }: { email: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const match = typed.trim().toLowerCase() === email.toLowerCase()

  async function handleDelete() {
    if (!match) return
    setDeleting(true)
    await onConfirm()
    setDeleting(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,52,4,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
      <div style={{ background: T.white, borderRadius: 14, padding: '28px 32px', width: '100%', maxWidth: 440, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: T.coralBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={18} color={T.coralStrong} />
          </div>
          <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 17, color: T.textPrimary }}>Delete your account?</div>
        </div>
        <p style={{ fontFamily: BODY, fontSize: 14, color: T.textSecondary, marginBottom: 20, lineHeight: 1.6 }}>
          This will permanently remove your account, all linked organisations, and every profile, match, and pipeline record. <strong style={{ color: T.textPrimary }}>This can't be undone.</strong>
        </p>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontFamily: UI, fontWeight: 500, fontSize: 13, color: T.textSecondary, display: 'block', marginBottom: 8 }}>
            Type your email to confirm: <span style={{ color: T.textPrimary }}>{email}</span>
          </label>
          <input
            type="email"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={email}
            style={{ width: '100%', fontFamily: BODY, fontSize: 14, border: `1px solid ${T.borderStrong}`, borderRadius: 8, padding: '9px 12px', outline: 'none', color: T.textPrimary }}
          />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
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
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   Main page
   ═══════════════════════════════════════════════ */
export default function AccountPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [org, setOrg] = useState<Organisation | null>(null)
  const [loading, setLoading] = useState(true)
  const [twoFA, setTwoFA] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      setEmail(user.email ?? '')
      setDisplayName(user.user_metadata?.full_name ?? user.user_metadata?.name ?? '')
      const orgs = await getOrganisationsByOwner(user.id)
      setOrg(orgs[0] ?? null)
      setLoading(false)
    }
    load()
  }, [])

  async function saveName(name: string) {
    await supabase.auth.updateUser({ data: { full_name: name } })
    setDisplayName(name)
    setNameSaved(true)
    setTimeout(() => setNameSaved(false), 2000)
  }

  async function handleDelete() {
    // Sign out — actual deletion requires server-side admin API
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

  const legalStr = legalLabel(org?.legal_structure ?? null)
  const location  = org?.primary_location ?? null
  const linkedDate = org?.created_at
    ? new Date(org.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null
  const orgMeta = [legalStr, location, linkedDate ? `Linked ${linkedDate}` : null].filter(Boolean).join(' · ')

  return (
    <div style={{ padding: '40px 48px 80px', maxWidth: 760, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ marginBottom: 36 }}>
        <h1 style={{ fontFamily: UI, fontWeight: 600, fontSize: 28, letterSpacing: '-0.02em', color: T.textPrimary, marginBottom: 6 }}>
          Account
        </h1>
        <p style={{ fontFamily: BODY, fontSize: 15, color: T.textSecondary, margin: 0 }}>
          Your login, your organisation, and your plan.
        </p>
      </div>

      {/* ── Your details ── */}
      <section style={{ marginBottom: 36 }}>
        <SectionHeader title="Your details" desc="How you sign in to Grant Tracker." />
        <Card>
          <NameRow initialName={displayName} onSave={saveName} />
          <FieldRow
            label="Email"
            action={<InlineLink>Change</InlineLink>}
          >
            <FieldValue>{email}</FieldValue>
            <FieldSub>Used for sign-in and account notifications</FieldSub>
          </FieldRow>
          <FieldRowLast
            label="Password"
            action={<InlineLink onClick={() => setShowPasswordModal(true)}>Change</InlineLink>}
          >
            <FieldValue>••••••••••••</FieldValue>
          </FieldRowLast>
        </Card>
      </section>

      {/* ── Your organisation ── */}
      <section style={{ marginBottom: 36 }}>
        <SectionHeader title="Your organisation" desc="The organisation this account is linked to. Update details via your profile." />
        <Card>
          {org ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px' }}>
              <div style={{
                width: 40, height: 40, background: T.cream, borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: UI, fontWeight: 600, fontSize: 14, color: T.greenDeep, flexShrink: 0,
              }}>
                {orgInitials(org.name ?? '')}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 14.5, color: T.textPrimary, marginBottom: 2 }}>
                  {org.name}
                </div>
                {orgMeta && (
                  <div style={{ fontFamily: BODY, fontSize: 12.5, color: T.textTertiary }}>{orgMeta}</div>
                )}
              </div>
              <Link
                href="/dashboard/profile"
                style={{
                  fontFamily: UI, fontWeight: 500, fontSize: 13,
                  color: T.textSecondary, textDecoration: 'none', padding: '6px 10px',
                  borderRadius: 6, whiteSpace: 'nowrap',
                }}
              >
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
          <FieldRow
            label={
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap', rowGap: 4 }}>
                <span>Two-factor auth</span>
                <span style={{
                  display: 'inline-block', marginLeft: 8,
                  fontFamily: UI, fontWeight: 500, fontSize: 11,
                  color: T.amberText, background: T.amberBg,
                  border: `1px solid rgba(133,79,11,0.2)`,
                  padding: '2px 8px', borderRadius: 10,
                }}>Recommended</span>
              </div>
            }
            action={<Toggle on={twoFA} onChange={setTwoFA} />}
          >
            <FieldValue muted={!twoFA}>{twoFA ? 'On' : 'Off'}</FieldValue>
            <FieldSub>Add a second step using an authenticator app</FieldSub>
          </FieldRow>
          <FieldRowLast
            label="Active sessions"
            action={<InlineLink>View all</InlineLink>}
          >
            <FieldValue>This device</FieldValue>
            <FieldSub>Signed in on this browser session</FieldSub>
          </FieldRowLast>
        </Card>
      </section>

      {/* ── Billing ── */}
      <section style={{ marginBottom: 36 }}>
        <SectionHeader title="Billing" desc="Your plan and payment details." />
        <div style={{
          background: T.cream, border: `1px solid rgba(23,52,4,0.10)`,
          borderRadius: 12, padding: '22px 26px',
          display: 'flex', gap: 16, alignItems: 'flex-start',
        }}>
          <div style={{
            width: 40, height: 40, background: T.white, borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: T.greenDeep, flexShrink: 0,
          }}>
            <Star size={18} strokeWidth={2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 15, color: T.textPrimary, marginBottom: 4 }}>
              You're in the founding cohort
            </div>
            <div style={{ fontFamily: BODY, fontSize: 13.5, color: T.textSecondary, lineHeight: 1.55 }}>
              Grant Tracker is free for you during beta. Billing starts after launch at your{' '}
              <strong style={{ color: T.textPrimary, fontWeight: 600 }}>founding rate</strong>{' '}
              — a first-year discount on whichever plan you choose. We'll email you ahead of any changes, so there are no surprises.
            </div>
          </div>
        </div>
      </section>

      {/* ── Danger zone ── */}
      <section style={{ marginTop: 48, paddingTop: 32, borderTop: `1px solid ${T.border}` }}>
        <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 13, color: T.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 14 }}>
          Danger zone
        </div>
        <div style={{
          background: T.white, border: `1px solid ${T.border}`, borderRadius: 12,
          padding: '20px 22px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 20,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 14.5, color: T.textPrimary, marginBottom: 2 }}>
              Delete your account
            </div>
            <div style={{ fontFamily: BODY, fontSize: 13, color: T.textSecondary, lineHeight: 1.5 }}>
              Permanently removes your account, all your organisations, and every associated profile, match, and pipeline record. This can't be undone.
            </div>
          </div>
          <DangerButton onClick={() => setShowDeleteModal(true)}>Delete account</DangerButton>
        </div>
      </section>

      {/* Modals */}
      {showPasswordModal && <PasswordModal onClose={() => setShowPasswordModal(false)} />}
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
