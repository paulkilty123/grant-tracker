// Weave a short answer into an organisation description (Paul, 14 Sept 2026:
// blanks to fill were fiddly; a question with a few words typed under it is
// not). Takes the current text, the question the reader was asked and their
// answer, and returns the whole description rewritten so the answer sits in
// it naturally. Uses only what is in the text and the answer: nothing is
// invented, nothing already there is dropped. One Haiku call, about a tenth
// of a penny. PROFILE_REVIEW=off answers with the text unchanged.
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { enforceInferenceRateLimit } from '@/lib/mcp-rate-limit'

export const dynamic = 'force-dynamic'

const MODEL = 'claude-haiku-4-5-20251001'

const SYSTEM = `You edit a UK charity or social enterprise's short description of what it does. British spelling. No dashes. Plain words. Two to four sentences.

You are given the current description, a question the writer was asked, and their answer in a few words. Rewrite the description so the answer is part of it, in the writer's voice, reading as one piece rather than a bolted-on sentence.

Rules:
- Use only facts that are in the description or the answer. Add nothing else. Do not embellish, estimate, or generalise.
- Keep every fact that is already in the description unless the answer corrects it.
- If the description opens with a slogan or a vision, you may fold it into a plainer sentence, but keep its meaning.
- Return only the rewritten description as plain text. No preamble, no quotes, no bullet points.`

export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })

  let body: { mission?: string; question?: string; answer?: string; name?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
  const mission = (body.mission ?? '').trim().slice(0, 2000)
  const question = (body.question ?? '').trim().slice(0, 200)
  const answer = (body.answer ?? '').trim().slice(0, 400)
  if (!answer) return NextResponse.json({ mission })
  if (process.env.PROFILE_REVIEW === 'off' || !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ mission: mission ? `${mission} ${answer}` : answer, skipped: true })
  }
  const rl = await enforceInferenceRateLimit({ scope: 'missionweave', identifier: `user:${user.id}`, perHour: 40, perDay: 120 })
  if (!rl.allowed) return NextResponse.json({ mission: mission ? `${mission} ${answer}` : answer, limited: true })

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const res = await client.messages.create({
      model: MODEL, max_tokens: 500, system: SYSTEM,
      messages: [{ role: 'user', content: `Organisation: ${(body.name ?? '').slice(0, 120)}\nCurrent description:\n${mission || '(empty)'}\n\nQuestion asked: ${question}\nWriter's answer: ${answer}` }],
    })
    const text = res.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim()
    return NextResponse.json({ mission: text || `${mission} ${answer}`.trim(), usage: { in: res.usage.input_tokens, out: res.usage.output_tokens } })
  } catch (err) {
    console.error('[profile/mission-weave]', err instanceof Error ? err.message : err)
    return NextResponse.json({ mission: mission ? `${mission} ${answer}` : answer, failed: true })
  }
}
