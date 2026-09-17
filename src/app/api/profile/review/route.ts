// The model half of the profile check (src/lib/profile-check.ts): one short
// read of the mission against the tags, for the case rules cannot see, a
// mission that contradicts its tags in words the tag labels never use
// ("doggy daycare" tagged mental health and supported employment).
//
// Called from the wizard's check step after the rules have rendered; the step
// never waits on this and never fails because of it. Returns findings in the
// same shape as the rules so the step can fold them in. One Haiku call on a
// few hundred tokens: about a penny per signup. PROFILE_REVIEW=off makes the
// route answer empty, for local runs that must not spend.
//
// Authenticated: the caller must be signed in. The mission is the caller's
// own text, so nothing here reads another organisation.
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import type { ProfileFinding } from '@/lib/profile-check'

export const dynamic = 'force-dynamic'

const MODEL = 'claude-haiku-4-5-20251001'

interface Body {
  name?: string
  mission?: string
  impact_sectors?: string[]
  niche_tags?: string[]
  niche_labels?: Record<string, string>
  beneficiary_groups?: string[]
}

const SYSTEM = `You read a UK charity or social enterprise's profile the way a grant funder would, and say in one or two plain sentences whether the tags match the mission. British spelling. No dashes. Sentence case.

Answer only with JSON of this shape, nothing else:
{"findings":[{"id":"model_mismatch","title":"...","body":"...","remove_niche":["tag_value"],"remove_beneficiaries":["group_value"]}]}

Rules:
- Return an empty findings list when the tags are a fair description of the mission. That is the usual answer.
- Return at most one finding, and only when a tag or beneficiary group describes work the mission does not do at all. A tag the mission implies is fine.
- The title is one short sentence addressed to the reader, naming the tag in question. The body is one or two sentences saying what a funder would see and what to change. If the mission may simply be missing a line (for example a business whose social purpose is employment), say that rather than assuming the tag is wrong.
- remove_niche and remove_beneficiaries hold the values you would take off. Leave them empty if the fix is to expand the mission.`

export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })

  if (process.env.PROFILE_REVIEW === 'off' || !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ findings: [], skipped: true })
  }

  let body: Body
  try { body = await req.json() as Body } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
  const mission = (body.mission ?? '').trim()
  const niche = (body.niche_tags ?? []).filter(t => typeof t === 'string').slice(0, 20)
  const bens = (body.beneficiary_groups ?? []).filter(t => typeof t === 'string').slice(0, 10)
  if (mission.length < 40 || (!niche.length && !bens.length)) return NextResponse.json({ findings: [] })

  const labels = body.niche_labels ?? {}
  const profile = [
    `Organisation: ${(body.name ?? '').slice(0, 120)}`,
    `Mission: ${mission.slice(0, 1500)}`,
    `Sectors: ${(body.impact_sectors ?? []).join(', ') || 'none'}`,
    `Specialism tags (value = label): ${niche.map(t => `${t} = ${labels[t] ?? t}`).join('; ') || 'none'}`,
    `Beneficiary groups: ${bens.join(', ') || 'none'}`,
  ].join('\n')

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const res = await client.messages.create({
      model: MODEL, max_tokens: 400, system: SYSTEM,
      messages: [{ role: 'user', content: profile }],
    })
    const text = res.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim()
    const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
    const parsed = JSON.parse(json) as { findings?: { title?: string; body?: string; remove_niche?: string[]; remove_beneficiaries?: string[] }[] }
    const findings: ProfileFinding[] = []
    for (const f of (parsed.findings ?? []).slice(0, 1)) {
      if (!f.title || !f.body) continue
      const rn = (f.remove_niche ?? []).filter(t => niche.includes(t))
      const rb = (f.remove_beneficiaries ?? []).filter(t => bens.includes(t))
      findings.push({
        id: 'niche_unmentioned',
        severity: rn.length || rb.length ? 'fix' : 'consider',
        title: String(f.title).slice(0, 160),
        body: String(f.body).slice(0, 400),
        action: rn.length ? { kind: 'remove_niche', values: rn }
          : rb.length ? { kind: 'remove_beneficiaries', values: rb as ProfileFinding['action'] extends { values: infer V } ? V : never }
          : { kind: 'edit_mission' },
      })
    }
    return NextResponse.json({ findings, usage: { in: res.usage.input_tokens, out: res.usage.output_tokens } })
  } catch (err) {
    console.error('[profile/review]', err instanceof Error ? err.message : err)
    return NextResponse.json({ findings: [], failed: true })
  }
}
