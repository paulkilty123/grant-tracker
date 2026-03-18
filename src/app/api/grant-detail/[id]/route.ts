import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const externalId = decodeURIComponent(id)

  const supabase = await createClient()

  // Try external_id first, fall back to DB id
  let { data: grant } = await supabase
    .from('scraped_grants')
    .select('*')
    .eq('external_id', externalId)
    .maybeSingle()

  if (!grant) {
    const { data: byId } = await supabase
      .from('scraped_grants')
      .select('*')
      .eq('id', externalId)
      .maybeSingle()
    grant = byId
  }

  if (!grant) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(grant)
}
