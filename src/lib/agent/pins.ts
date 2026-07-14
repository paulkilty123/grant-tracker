// Client-side CRUD for agent_thread_pins (research agent v1, design spec §3).
// Same pattern as src/lib/interactions.ts: pins are user-curated, so the
// browser client under org-scoped RLS is the direct write path — no API
// route needed, matching how "saved"/"dismissed" grant interactions work.

import { createClient } from '@/lib/supabase/client'

export type PinSourceKind = 'catalogue' | 'researched' | 'adviser_judgment'
// v1.1 §5: orthogonal to source_kind -- source_kind is WHERE the content came
// from, pin_type is WHAT KIND OF ARTEFACT this pin is. 'decision' is schema-
// ready, not yet wired to any write path (see migration 042).
export type PinType = 'profile' | 'finding' | 'decision'

export interface Pin {
  id: string
  thread_id: string
  title: string
  body: string | null
  source_kind: PinSourceKind
  opportunity_ref: string | null
  pin_type: PinType
  brief_id: string | null
  created_at: string
}

export async function getPins(threadId: string): Promise<Pin[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('agent_thread_pins')
    .select('id, thread_id, title, body, source_kind, opportunity_ref, pin_type, brief_id, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Pin[]
}

export async function createPin(
  orgId: string,
  threadId: string,
  pin: { title: string; body?: string | null; source_kind: PinSourceKind; opportunity_ref?: string | null; pin_type: PinType; brief_id?: string | null },
): Promise<Pin> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('agent_thread_pins')
    .insert({
      org_id: orgId,
      thread_id: threadId,
      title: pin.title,
      body: pin.body ?? null,
      source_kind: pin.source_kind,
      opportunity_ref: pin.opportunity_ref ?? null,
      pin_type: pin.pin_type,
      brief_id: pin.brief_id ?? null,
    })
    .select('id, thread_id, title, body, source_kind, opportunity_ref, pin_type, brief_id, created_at')
    .single()
  if (error) throw error
  return data as Pin
}

export async function deletePin(pinId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('agent_thread_pins').delete().eq('id', pinId)
  if (error) throw error
}
