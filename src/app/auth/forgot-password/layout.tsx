import type { Metadata } from 'next'
import { MCP_BRAND_NAME } from '@/lib/mcp-brand'

/* page.tsx is a client component and cannot export metadata, so the tab title
   lives here. Brand comes from MCP_BRAND_NAME, not a literal, so it flips with
   the rest of the app; that env is Production-scoped, so this reads "Grant
   Tracker" in local dev and "Shoots" in production. */

export const metadata: Metadata = {
  title: `Reset your ${MCP_BRAND_NAME} password`,
}

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children
}
