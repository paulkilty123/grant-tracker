// Server-side authorization gate for EVERY page under /dashboard/admin.
//
// 2026-07-25: there was no admin layout at all. The only ancestor gate was
// dashboard/layout.tsx, which checks "is there a logged-in user" and nothing
// more, so each admin page had to gate itself — and an audit found 5 of 12 did
// not gate at all:
//
//   - admin/page.tsx           (Grant Health + Discovery / 360Giving / FillAmounts panels)
//   - admin/intelligence       (can PUBLISH grants)
//   - admin/quality
//   - admin/corporate          (writes corporate_partners direct from the browser)
//   - admin/users/[id]         (user PII)
//
// Any logged-in user could reach those by typing the URL.
//
// This layout is additive: it does not remove the per-page checks that do exist
// (requireAdmin() in urls / cohort-match-audit, client-side email comparisons in
// feedback / watchlist / users / application-review). Those remain as
// defence-in-depth. It also does not replace API-route authorization — every
// admin route must keep its own requireAdmin() / isAdminBearerToken() check,
// because routes are reachable without going through any page.
//
// Uses requireAdmin(), which reads the ADMIN_EMAILS env var (comma-separated,
// defaulting to paulkilty1@gmail.com). Note the known drift this does NOT fix:
// several files still hardcode the admin address instead of reading that env
// var, so a second admin added via ADMIN_EMAILS gets access through this gate
// but still sees no nav link (Sidebar.tsx) and hits client-side email checks on
// some pages. Consolidating those onto one source of truth is a follow-up.
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/require-admin'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const auth = await requireAdmin()

  if (!auth.ok) {
    // Not logged in at all -> send to login. Logged in but not an admin ->
    // send to the normal dashboard rather than the login page, so a signed-in
    // non-admin isn't bounced into a confusing re-auth loop.
    redirect(auth.reason === 'not_authenticated' ? '/auth/login' : '/dashboard')
  }

  return <>{children}</>
}
