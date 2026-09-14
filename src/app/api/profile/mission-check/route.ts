// Grade a mission against the three things the matcher needs from it: who
// benefits and the problem, what is done and what changes, where. Returns,
// per line, whether it is covered and a one-line suggestion in the reader's
// own terms. Paul, 14 Sept 2026: the word rules on the mission step passed
// "Fighting hunger and tackling food waste. FareShare South West works
// towards a future where no food is wasted and all people can thrive" on
// "people", "works" and "South West". A slogan is not a description; only
// something that reads meaning can tell the two apart.
//
// One Haiku call on a few hundred tokens, about a penny, debounced by the
// step so a typist does not fire it per keystroke. The rules stay as the
// instant fallback; this refines them when it answers. PROFILE_REVIEW=off
// makes it answer empty, for local runs that must not spend.
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { enforceInferenceRateLimit } from '@/lib/mcp-rate-limit'

export const dynamic = 'force-dynamic'

const MODEL = 'claude-haiku-4-5-20251001'

export type MissionCheckItem = { key: 'who' | 'what' | 'where'; covered: boolean; suggestion: string; sentence?: string }
export type MissionProposals = { sectors: string[]; beneficiaries: string[]; niche: string[]; reach: 'local' | 'regional' | 'national' | 'international' | null }
type Opt = { value: string; label: string; sector?: string }

const SYSTEM = `You help a UK charity or social enterprise write two or three sentences about what it does, for a funding matching tool. British spelling. No dashes. Sentence case. Plain words.

Judge the text on three things, and propose tags from the lists given, and answer only with JSON of this shape, nothing else:
{"items":[{"key":"who","covered":true,"suggestion":"","sentence":""},{"key":"what","covered":false,"suggestion":"...","sentence":"..."},{"key":"where","covered":false,"suggestion":"...","sentence":"..."}],"proposals":{"sectors":["value"],"beneficiaries":["value"],"niche":["value"],"reach":"local"}}

Be strict. A funder reads this to decide whether to spend an hour on the organisation, and a line that could describe a hundred organisations is not covered.
- who: covered only when it names a specific group AND the problem they face. "People", "communities", "those in need" or "people facing food insecurity" alone are not specific: say which people (families on low incomes, refugees, young people leaving care, food banks and community kitchens) and what they are up against. A vision ("all people can thrive") never counts.
- what: covered when it says the concrete activity AND what changes because of it. "Supporting people" or "working with communities" is not an activity; "we collect surplus food from supermarkets and deliver it to community groups so families get a hot meal" is covered. Numbers, frequency and scale are welcome but never required: do not ask for them. An aim on its own ("fighting hunger") never counts.
- where: covered when it names where the work happens at the level a funder would use (a town, county, region, nation, or overseas). This one may be a single word.

Proposals: sectors, 1 to 4 values from the SECTORS list, most central first. beneficiaries, 1 to 4 values from the BENEFICIARIES list, primary first; use general_public only when no group is named. niche, up to 5 values from the SPECIALISMS list, and only ones that belong to a sector you proposed. reach, where the people they help live: "local" for one town, borough or district; "regional" for a county or region; "national" for across the UK; "international" when some or all of the work is outside the UK; null when the text does not say. Propose only what the text supports; an empty list is right when it says nothing. Values must be copied exactly from the lists.

The test is whether a funder could tell this organisation apart from a hundred others doing similar work. If the text gives a real group, a real activity and a real change, it passes, however plainly it is written. Only a genuinely vague line is not covered.

When a line is not covered, also give "sentence": one sentence the writer can drop into their text, built from what the text already says, with the facts you do not know left as short bracketed blanks, for example "We collect surplus food and deliver it to [who receives it] across the South West so that [what changes for them]." Never fill a blank with a guess. At most 30 words, one to three blanks, each blank a few words inside square brackets. Empty when the line is covered.

When a line is covered, suggestion is an empty string. When it is not, suggestion is one sentence, at most 25 words, telling the writer what to add, using what the text already says so it reads as theirs: "Add who receives the food and what they are facing, for example community groups feeding families in poverty." Never invent facts about the organisation; say what to add, not what is true.`

export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  if (process.env.PROFILE_REVIEW === 'off' || !process.env.ANTHROPIC_API_KEY) return NextResponse.json({ items: null, skipped: true })

  const rl = await enforceInferenceRateLimit({ scope: 'missioncheck', identifier: `user:${user.id}`, perHour: 40, perDay: 120 })
  if (!rl.allowed) return NextResponse.json({ items: null, limited: true })

  let body: { mission?: string; name?: string; location?: string; taxonomy?: { sectors?: Opt[]; beneficiaries?: Opt[]; niche?: Opt[] } }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
  const mission = (body.mission ?? '').trim().slice(0, 2000)
  if (mission.length < 20) return NextResponse.json({ items: null })

  const clean = (xs?: Opt[]) => (xs ?? []).filter(o => o && typeof o.value === 'string' && typeof o.label === 'string').slice(0, 200)
  const sectors = clean(body.taxonomy?.sectors), bens = clean(body.taxonomy?.beneficiaries), niche = clean(body.taxonomy?.niche)
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const res = await client.messages.create({
      model: MODEL, max_tokens: 800, system: SYSTEM,
      messages: [{ role: 'user', content: [
        `Organisation: ${(body.name ?? '').slice(0, 120)}`,
        `Stated location: ${(body.location ?? '').slice(0, 120)}`,
        `SECTORS: ${sectors.map(o => `${o.value} (${o.label})`).join(', ')}`,
        `BENEFICIARIES: ${bens.map(o => `${o.value} (${o.label})`).join(', ')}`,
        `SPECIALISMS: ${niche.map(o => `${o.value} (${o.label}, sector ${o.sector ?? '?'})`).join(', ')}`,
        `Text:\n${mission}`,
      ].join('\n') }],
    })
    const text = res.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim()
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as { items?: MissionCheckItem[]; proposals?: Partial<MissionProposals> }
    const keys = new Set(['who', 'what', 'where'])
    const items = (parsed.items ?? []).filter(i => keys.has(i.key)).map(i => ({
      key: i.key, covered: Boolean(i.covered),
      suggestion: i.covered ? '' : String(i.suggestion ?? '').slice(0, 220),
      sentence: i.covered ? '' : String(i.sentence ?? '').slice(0, 260),
    }))
    // Only values from the lists sent, in the order the model gave them.
    const only = (vals: unknown, opts: Opt[], cap: number) => {
      const ok = new Set(opts.map(o => o.value))
      return (Array.isArray(vals) ? vals : []).filter((v): v is string => typeof v === 'string' && ok.has(v)).slice(0, cap)
    }
    const pSectors = only(parsed.proposals?.sectors, sectors, 4)
    const allowedNiche = niche.filter(o => !o.sector || pSectors.includes(o.sector))
    const reachRaw = parsed.proposals?.reach
    const reach = reachRaw === 'local' || reachRaw === 'regional' || reachRaw === 'national' || reachRaw === 'international' ? reachRaw : null
    const proposals: MissionProposals = {
      sectors: pSectors,
      beneficiaries: only(parsed.proposals?.beneficiaries, bens, 4),
      niche: only(parsed.proposals?.niche, allowedNiche, 5),
      reach,
    }
    return NextResponse.json({ items: items.length === 3 ? items : null, proposals, usage: { in: res.usage.input_tokens, out: res.usage.output_tokens } })
  } catch (err) {
    console.error('[profile/mission-check]', err instanceof Error ? err.message : err)
    return NextResponse.json({ items: null, failed: true })
  }
}
