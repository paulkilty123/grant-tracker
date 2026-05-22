'use client'

import { useEffect } from 'react'

type Props = {
  open: boolean
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel  = 'Cancel',
  destructive  = false,
  busy         = false,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onCancel()
      if (e.key === 'Enter' && !busy) onConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel, onConfirm])

  if (!open) return null

  const confirmStyle = destructive
    ? { background: '#D85A30', color: '#FFFFFF' }
    : { background: '#8ECB3C', color: '#173404' }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={busy ? undefined : onCancel}
      />
      <div
        className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6"
        style={{ borderRadius: 12 }}
      >
        {title && (
          <h3 className="text-lg font-bold text-charcoal mb-2" style={{ color: '#2C2C2A' }}>
            {title}
          </h3>
        )}
        <p className="text-sm leading-relaxed" style={{ color: '#2C2C2A' }}>
          {message}
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
            style={{ border: '1px solid #2C2C2A', background: '#FFFFFF', color: '#2C2C2A' }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-lg px-4 py-2 text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={confirmStyle}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

type StripProps = {
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmStrip({
  message,
  confirmLabel = 'Confirm',
  cancelLabel  = 'Cancel',
  destructive  = false,
  busy         = false,
  onConfirm,
  onCancel,
}: StripProps) {
  const confirmStyle = destructive
    ? { background: '#D85A30', color: '#FFFFFF' }
    : { background: '#8ECB3C', color: '#173404' }

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3"
      style={{ background: '#F5F1E8', borderColor: '#2C2C2A33', fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}
    >
      <span className="text-sm flex-1 min-w-[200px]" style={{ color: '#2C2C2A' }}>{message}</span>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
        style={{ border: '1px solid #2C2C2A', background: '#FFFFFF', color: '#2C2C2A' }}
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy}
        className="rounded-lg px-4 py-1.5 text-sm font-bold disabled:opacity-50"
        style={confirmStyle}
      >
        {busy ? 'Working…' : confirmLabel}
      </button>
    </div>
  )
}
