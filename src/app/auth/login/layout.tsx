import type { Metadata } from 'next'
import { MCP_BRAND_NAME } from '@/lib/mcp-brand'

/* Page title for the login route.
   ============================================================
   page.tsx is a client component and cannot export metadata, so the title
   lives here. Without it the tab inherits the root layout's app-wide title,
   which is the full "UK Funding for CICs, Social Enterprises, Charities &
   Impact Founders" line. Accurate, but not what a sign-in tab should say.

   The brand comes from MCP_BRAND_NAME rather than the literal "Shoots" for
   the reason the root layout records: hardcoding a second copy of the brand
   is exactly what left the authorize screen and /mcp reading "Grant Tracker"
   after the cutover. MCP_* env is Production-scoped, so this reads "Grant
   Tracker" in local dev and "Shoots" in production. That is expected, and a
   local tab saying Grant Tracker is not a brand bug.
   ============================================================ */

export const metadata: Metadata = {
  title: `Sign in to ${MCP_BRAND_NAME}`,
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
