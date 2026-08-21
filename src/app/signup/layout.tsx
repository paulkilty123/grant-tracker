import type { Metadata } from 'next'
import { MCP_BRAND_NAME } from '@/lib/mcp-brand'

/* Page title and indexing rule for the signup route.
   ============================================================
   page.tsx is a client component and cannot export metadata, so both live
   here. Brand comes from MCP_BRAND_NAME, not a literal, for the same reason
   as the login layout: one flip point, not a second copy.

   noindex is deliberate and matches sequencing rule 3. This page is built but
   unlinked until launch, and the point of leaving it unlinked is that nobody
   arrives at it yet. A search engine that indexed it would be a public
   entry point by another route, which is the thing the rule is guarding
   against. The static landing page carries its own noindex on the same
   reasoning until the flip. Remove this when signup goes live.
   ============================================================ */

export const metadata: Metadata = {
  title: `Create your ${MCP_BRAND_NAME} account`,
  robots: { index: false, follow: false },
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children
}
