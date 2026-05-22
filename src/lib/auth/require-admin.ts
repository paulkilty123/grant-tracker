import { createClient } from '@/lib/supabase/server'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? 'paulkilty1@gmail.com')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean)

export type AdminAuthResult =
  | { ok: true; user: { id: string; email: string } }
  | { ok: false; status: 401 | 403; reason: 'not_authenticated' | 'not_admin' }

export async function requireAdmin(): Promise<AdminAuthResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) {
    return { ok: false, status: 401, reason: 'not_authenticated' }
  }
  if (!ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return { ok: false, status: 403, reason: 'not_admin' }
  }
  return { ok: true, user: { id: user.id, email: user.email } }
}

export function isAdminBearerToken(authHeader: string | null | undefined): boolean {
  if (!authHeader || !process.env.ADMIN_SECRET) return false
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  return token.length > 0 && token === process.env.ADMIN_SECRET
}
