/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js'
import { readStamp } from '../src/lib/field-evidence'
async function fetchAll(db: any) {
  const out: Record<string, unknown>[] = []
  for (let from = 0; ; from += 900) {
    const { data, error } = await db.from('scraped_grants').select('*').range(from, from + 899)
    if (error) throw new Error(error.message)
    out.push(...(data ?? [])); if (!data || data.length < 900) break
  }
  return out
}
async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const all = await fetchAll(db)
  const live = all.filter(r => r.is_active === true)

  console.log('── the 9 live rows the page CONTRADICTS on rolling')
  for (const r of live.filter(r => r.is_rolling === true)) {
    const s = readStamp(r.field_evidence as never, 'is_rolling')
    if (s?.agrees === false) {
      console.log(`   ${String(r.title).slice(0, 44).padEnd(46)} proposed=${JSON.stringify((s as any).proposed)}`)
      console.log(`      "${String(s.quote ?? '').slice(0, 150)}"`)
    }
  }

  console.log('\n── rows marked published but not live (the known desync)')
  const ph = all.filter(r => r.pipeline_state === 'published' && r.is_active !== true)
  console.log(`   count: ${ph.length}`)
  console.log(`   e.g. ${ph.slice(0, 5).map(r => String(r.title).slice(0, 40)).join(' · ')}`)

  console.log('\n── live rows whose deadline evidence CONTRADICTS what we show')
  let dc = 0
  for (const r of live) {
    const s = readStamp(r.field_evidence as never, 'deadline')
    if (s?.agrees === false) { dc++; if (dc <= 6) console.log(`   ${String(r.title).slice(0, 42).padEnd(44)} we show ${r.deadline} · page: ${JSON.stringify((s as any).proposed)}`) }
  }
  console.log(`   total: ${dc}`)
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
