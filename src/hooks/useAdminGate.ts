'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? 'paulkilty1@gmail.com')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean)

export type AdminGateState = 'loading' | 'ok' | 'denied'

export function useAdminGate(opts: { redirectOnDeny?: boolean } = {}) {
  const router = useRouter()
  const [state, setState] = useState<AdminGateState>('loading')
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    createClient().auth.getUser().then(({ data }) => {
      if (cancelled) return
      const e = data.user?.email?.toLowerCase() ?? null
      setEmail(e)
      if (!e) {
        setState('denied')
        if (opts.redirectOnDeny) router.push('/auth/login')
        return
      }
      setState(ADMIN_EMAILS.includes(e) ? 'ok' : 'denied')
    })
    return () => { cancelled = true }
  }, [router, opts.redirectOnDeny])

  return { state, email }
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.toLowerCase())
}
