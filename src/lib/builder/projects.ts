// Project entity helpers (project-first phase 2). The completeness model is
// deterministic and informative: every gap names what completing it buys,
// and "ready to match" is a checkpoint, not a 100% demand.

import { createClient } from '@/lib/supabase/client'

export interface Project {
  id: string
  org_id: string
  name: string
  type_label: 'project' | 'campaign' | 'programme'
  status: 'active' | 'funded' | 'archived'
  description_raw: string | null
  what_it_will_do: string | null
  who_benefits: string | null
  difference_it_makes: string | null
  duration: string | null
  outreach: string | null
  learning: string | null
  budget_amount: number | null
  sectors: string[]
  beneficiary_groups: string[]
  created_at: string
  updated_at: string
}

export interface ProjectFieldMeta {
  key: keyof Project
  label: string
  weight: number
  /** Why a funder asks for it, in one sentence: shown beside a missing field. */
  benefit: string
  kind: 'text' | 'amount' | 'tags'
  placeholder?: string
}

export const PROJECT_FIELDS: ProjectFieldMeta[] = [
  { key: 'what_it_will_do', label: 'What it will do', weight: 20, kind: 'text',
    benefit: 'Every answer starts from this, and matching cannot run without it.',
    placeholder: 'The activity: what happens, where, how often.' },
  { key: 'who_benefits', label: 'Who benefits, and the need', weight: 15, kind: 'text',
    benefit: 'Funders ask who it is for and how you know they need it. It also narrows the matches.',
    placeholder: 'Who it serves and how you know they need it.' },
  { key: 'budget_amount', label: 'Rough budget', weight: 15, kind: 'amount',
    benefit: 'Lets us drop funders whose grants are far too small or far too large for what you need.' },
  { key: 'sectors', label: 'Sectors', weight: 15, kind: 'tags',
    benefit: 'The main thing we match on. Without a sector the list is everything.' },
  { key: 'beneficiary_groups', label: 'Beneficiary groups', weight: 10, kind: 'tags',
    benefit: 'Narrows the matches to funders who name the people you work with.' },
  { key: 'difference_it_makes', label: 'The difference it makes', weight: 10, kind: 'text',
    benefit: 'Most forms ask what changes as a result. It also sharpens which funders we show you.',
    placeholder: 'The change you expect to see, and how you would know.' },
  { key: 'duration', label: 'Duration', weight: 5, kind: 'text',
    benefit: 'Every funder asks this, and some rule out anything under a year.',
    placeholder: 'e.g. 12 months' },
  { key: 'outreach', label: 'How people will find out', weight: 5, kind: 'text',
    benefit: 'Forms usually ask how you reach the people you are trying to help.',
    placeholder: 'How participants will hear about it.' },
  { key: 'learning', label: 'Learning and evaluation', weight: 5, kind: 'text',
    benefit: 'Funders ask how you will know it worked. It also strengthens the outcomes you can claim.',
    placeholder: 'How you will learn from it and shape what comes next.' },
]
// weights sum to 100

export function fieldFilled(p: Project, meta: ProjectFieldMeta): boolean {
  const v = p[meta.key]
  if (meta.kind === 'amount') return typeof v === 'number' && v > 0
  if (meta.kind === 'tags') return Array.isArray(v) && v.length > 0
  return typeof v === 'string' && v.trim().length > 0
}

export function projectCompleteness(p: Project): number {
  return PROJECT_FIELDS.reduce((n, f) => n + (fieldFilled(p, f) ? f.weight : 0), 0)
}

/** The checkpoint where matching is worth running: the core relevance signals. */
export function readyToMatch(p: Project): boolean {
  return !!p.what_it_will_do?.trim() && p.sectors.length > 0 && (p.budget_amount ?? 0) > 0
}

/** Formats a project's filled sections as prompt material for the builder
 *  (generation + draft routes). Pure; safe to import server-side. */
export function projectMaterialBlock(p: Project): string {
  const parts: string[] = [
    `Project: ${p.name}${p.budget_amount ? ` (rough budget £${p.budget_amount.toLocaleString('en-GB')})` : ''}`,
  ]
  const add = (label: string, v: string | null) => { if (v?.trim()) parts.push(`${label}: ${v.trim()}`) }
  add('What it will do', p.what_it_will_do)
  add('Who benefits, and the need', p.who_benefits)
  add('The difference it makes', p.difference_it_makes)
  add('Duration', p.duration)
  add('How people will find out', p.outreach)
  add('Learning and evaluation', p.learning)
  return parts.join('\n')
}

export async function getProjects(orgId: string): Promise<Project[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Project[]
}

export async function updateProject(
  id: string,
  updates: Partial<Omit<Project, 'id' | 'org_id' | 'created_at'>>,
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('projects')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteProject(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) throw error
}
