import type { Metadata } from 'next'
import { MCP_BRAND_NAME } from '@/lib/mcp-brand'

/* page.tsx is a client component and cannot export metadata, so both settings
   live here. Brand comes from MCP_BRAND_NAME, not a literal, so it flips with
   the rest of the app.

   noindex because this URL carries a single-use recovery token in its query
   string. Nothing here should end up in a search index or a referrer-followed
   crawl, and there is no version of this page worth finding from search. */

export const metadata: Metadata = {
  title: `Set a new ${MCP_BRAND_NAME} password`,
  robots: { index: false, follow: false },
}

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children
}
