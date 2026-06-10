// GET /api/builder/access — does the session user have builder access?
// Keeps the cohort allowlist server-side (never shipped in the client bundle).

import { NextResponse } from 'next/server'
import { getBuilderUser } from '@/lib/builder/access'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getBuilderUser()
  return NextResponse.json({ allowed: !!user })
}
