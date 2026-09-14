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

export type MissionCheckItem = { key: 'who' | 'what' | 'where'; covered: boolean; suggestion: string }

const SYSTEM = `You help a UK charity or social enterprise write two or three sentences about what it does, for a funding matching tool. British spelling. No dashes. Sentence case. Plain words.

Judge the text on three things, and answer only with JSON of this shape, nothing else:
{"items":[{"key":"who","covered":true,"suggestion":""},{"key":"what","covered":false,"suggestion":"..."},{"key":"where","covered":false,"suggestion":"..."}]}

- who: does it name the people or organisations that benefit, and the problem they face? A vision ("all people can thrive") does not count; a named group with a need does.
- what: does it say what the organisation actually does, concretely, and what changes as a result? An aim ("fighting hunger") does not count; an activity ("we collect surplus food and deliver it to community groups") does.
- where: does it say where the work happens, at the level a funder would use (a town, county, region, nation, or overseas)?

When a line is covered, suggestion is an empty string. When it is not, suggestion is one sentence, at most 25 words, telling the writer what to add, using what the text already says so it reads as theirs: "Add who receives the food and what they are facing, for example community groups feeding families in poverty." Never invent facts about the organisation; say what to add, not what is true.`

export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  if (process.env.PROFILE_REVIEW === 'off' || !process.env.ANTHROPIC_API_KEY) return NextResponse.json({ items: null, skipped: true })

  const rl = await enforceInferenceRateLimit({ scope: 'missioncheck', identifier: `user:${user.id}`, perHour: 40, perDay: 120 })
  if (!rl.allowed) return NextResponse.json({ items: null, limited: true })

  let body: { mission?: string; name?: string; location?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
  const mission = (body.mission ?? '').trim().slice(0, 2000)
  if (mission.length < 20) return NextResponse.json({ items: null })

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const res = await client.messages.create({
      model: MODEL, max_tokens: 400, system: SYSTEM,
      messages: [{ role: 'user', content: `Organisation: ${(body.name ?? '').slice(0, 120)}\nStated location: ${(body.location ?? '').slice(0, 120)}\nText:\n${mission}` }],
    })
    const text = res.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim()
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as { items?: MissionCheckItem[] }
    const keys = new Set(['who', 'what', 'where'])
    const items = (parsed.items ?? []).filter(i => keys.has(i.key)).map(i => ({
      key: i.key, covered: Boolean(i.covered), suggestion: i.covered ? '' : String(i.suggestion ?? '').slice(0, 220),
    }))
    return NextResponse.json({ items: items.length === 3 ? items : null, usage: { in: res.usage.input_tokens, out: res.usage.output_tokens } })
  } catch (err) {
    console.error('[profile/mission-check]', err instanceof Error ? err.message : err)
    return NextResponse.json({ items: null, failed: true })
  }
}
