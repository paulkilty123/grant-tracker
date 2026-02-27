import { createClient } from '@/lib/supabase/client'
import type { Organisation } from '@/types'

export async function getOrganisation(orgId: string): Promise<Organisation | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('organisations')
    .select('*')
    .eq('id', orgId)
    .single()

  if (error) return null
  return data
}

export async function getOrganisationByOwner(userId: string): Promise<Organisation | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('organisations')
    .select('*')
    .eq('owner_id', userId)
    .single()

  if (error) return null
  return data
}

export async function createOrganisation(
  org: Omit<Organisation, 'id' | 'created_at'>
): Promise<Organisation> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('organisations')
    .insert(org)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateOrganisation(
  id: string,
  updates: Partial<Omit<Organisation, 'id' | 'created_at' | 'owner_id'>>
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('organisations')
    .update(updates)
    .eq('id', id)

  if (error) throw error
}
