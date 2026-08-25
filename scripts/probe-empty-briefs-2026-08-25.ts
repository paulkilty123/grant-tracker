/* eslint-disable @typescript-eslint/no-explicit-any */
// The live rows whose funder_brief is a shell — every core field null.
//
// Fetches each one direct, falls back to the reader proxy on a block, and pulls
// out any linked guidance/criteria document. LNER's facts were all in a linked
// PDF rather than on the page, so the linked docs are collected here too.
//
// No API spend. HTTP only.
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'fs'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
const PROXY = (process.env.READER_PROXY_URL ?? '').replace(/\/$/, '')
const CORE = ['who_can_apply', 'what_they_fund', 'exclusions', 'typical_award', 'how_to_apply']

async function fetchAll(db: any) {
  const out: any[] = []
  for (let f = 0; ; f += 900) {
    const { data, error } = await db.from('scraped_grants').select('*').range(f, f + 899)
    if (error) throw new Error(error.message); out.push(...(data ?? [])); if (!data || data.length < 900) break
  }
  return out
}

function textOf(html: string) {
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#\d+;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
}

async function grab(url: string): Promise<{ via: string; text: string; raw: string }> {
  let raw = ''
  try {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 25000)
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow', signal: ac.signal })
    clearTimeout(t); raw = await r.text()
    const txt = textOf(raw)
    if (r.ok && txt.length > 900) return { via: `direct-${r.status}`, text: txt, raw }
  } catch { /* fall through to proxy */ }
  if (PROXY) {
    try {
      const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 45000)
      const p = await fetch(`${PROXY}/${url}`, { headers: { Accept: 'text/plain' }, signal: ac.signal })
      clearTimeout(t)
      if (p.ok) { const txt = await p.text(); if (txt.length > 500) return { via: 'proxy', text: txt, raw: txt } }
    } catch { /* nothing more to try */ }
  }
  return { via: 'unreadable', text: textOf(raw), raw }
}

async function main() {
  const db = (await import('@supabase/supabase-js')).createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const live = (await fetchAll(db)).filter(r => r.is_active === true)
  const empty = live.filter(r => {
    const b = (r.funder_brief ?? {}) as Record<string, unknown>
    return Object.keys(b).length > 0 && CORE.every(k => b[k] == null || String(b[k]).trim() === '')
  })
  console.log(`live rows with an empty brief: ${empty.length}\n`)
  mkdirSync('/tmp/briefs', { recursive: true })

  for (const r of empty) {
    const { via, text, raw } = await grab(String(r.apply_url))
    const slug = String(r.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 44)
    writeFileSync(`/tmp/briefs/${slug}.txt`, text)
    // Linked guidance / criteria documents — LNER's facts were only in one.
    const docs = Array.from(new Set(
      (raw.match(/https?:\/\/[^\s"'<>)]+\.(?:pdf|docx?)/gi) ?? [])
        .filter(u => /guid|criteri|applic|fund|grant|eligib|faq/i.test(u))
    )).slice(0, 4)
    console.log(`${String(r.title).slice(0, 44).padEnd(46)} ${via.padEnd(11)} ${String(text.length).padStart(6)} chars   /tmp/briefs/${slug}.txt`)
    console.log(`   ${String(r.apply_url).slice(0, 96)}`)
    if (docs.length) for (const d of docs) console.log(`   DOC: ${d.slice(0, 110)}`)
  }
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
