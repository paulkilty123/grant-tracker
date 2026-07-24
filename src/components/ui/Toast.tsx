'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
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
  success: { bg: 'var(--state-success-pale)', border: '#8ECB3C', text: 'var(--deep)' },
  error:   { bg: 'var(--state-error-pale)', border: 'var(--terra)', text: 'var(--state-error)' },
  info:    { bg: 'var(--surface-sunken)', border: 'var(--text-muted)', text: 'var(--text-body)' },
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

  const api: ToastApi = {
    success: msg => push('success', msg),
    error:   msg => push('error',   msg),
    info:    msg => push('info',    msg),
  }

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
