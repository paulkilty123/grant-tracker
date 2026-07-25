'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react'

type ToastKind = 'success' | 'error' | 'info'

type ToastEntry = {
  id: number
  kind: ToastKind
  message: string
}

type ToastApi = {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const KIND_STYLE: Record<ToastKind, { bg: string; border: string; text: string }> = {
  success: { bg: '#F1F7E4', border: '#8ECB3C', text: '#173404' },
  error:   { bg: '#FAECE7', border: '#D85A30', text: '#993C1D' },
  info:    { bg: '#F5F1E8', border: '#5F5E5A', text: '#2C2C2A' },
}

const DURATION_MS = 4000

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, kind, message }])
    setTimeout(() => dismiss(id), DURATION_MS)
  }, [dismiss])

  // Memoised so the context value has a stable identity. Without this, `api` was
  // rebuilt on every ToastProvider render — and the provider re-renders whenever
  // a toast is shown or dismissed — so useToast() returned a new object each
  // time. Any consumer that (correctly) listed `toast` in a useCallback /
  // useEffect dependency array would then see its dependency change on every
  // toast, and a callback that shows a toast on failure could drive an infinite
  // loop: load fails → toast → provider re-renders → new api identity → effect
  // refires → load fails → …
  //
  // push/dismiss are already stable useCallbacks, so this is permanently stable.
  const api: ToastApi = useMemo(() => ({
    success: (msg: string) => push('success', msg),
    error:   (msg: string) => push('error',   msg),
    info:    (msg: string) => push('info',    msg),
  }), [push])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2 max-w-sm pointer-events-none"
        style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}
      >
        {toasts.map(t => {
          const s = KIND_STYLE[t.kind]
          return (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto flex items-start gap-2.5 rounded-xl border px-4 py-3 shadow-md"
              style={{ background: s.bg, borderColor: s.border, color: s.text }}
            >
              {t.kind === 'success' && <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
              {t.kind === 'error'   && <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
              {t.kind === 'info'    && <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />}
              <span className="text-sm leading-snug flex-1">{t.message}</span>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="opacity-60 hover:opacity-100 transition-opacity flex-shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    return {
      success: msg => { if (typeof window !== 'undefined') console.warn('[toast.success]', msg) },
      error:   msg => { if (typeof window !== 'undefined') console.error('[toast.error]', msg) },
      info:    msg => { if (typeof window !== 'undefined') console.info('[toast.info]', msg) },
    }
  }
  return ctx
}
