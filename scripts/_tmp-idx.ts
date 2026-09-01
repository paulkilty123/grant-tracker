import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
for (const l of readFileSync('.env.local','utf8').split('\n')) { const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if(m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g,'') }
async function main(){
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const rows: Record<string,unknown>[] = []
for (let f=0; f<6000; f+=500) {
  const { data } = await db.from('scraped_grants').select('id,external_id,title,funder,is_active,pipeline_state').order('id').range(f,f+499)
  rows.push(...(data??[])); if ((data??[]).length<500) break
}
const removed = rows.filter(r=>['rejected','archived'].includes(String(r.pipeline_state)))
const withheld = rows.filter(r=>r.is_active!==true && !['rejected','archived','published','between_rounds_scheduled'].includes(String(r.pipeline_state)))
const hiddenToday = ['043634a3','65961bc8','1f67aead','2506cc66','3da49c2b'].map(p=>rows.find(r=>String(r.id).startsWith(p))!).filter(Boolean)
console.log(`rejected/archived ${removed.length}   withheld-in-review ${withheld.length}   hidden today ${hiddenToday.length}`)

// What status does each class return NOW?
const sample = [
  ...removed.slice(0,2).map(r=>({kind:'rejected/archived', r})),
  ...withheld.slice(0,2).map(r=>({kind:'withheld', r})),
  ...hiddenToday.map(r=>({kind:'hidden today', r})),
  { kind:'CONTROL live', r: rows.find(r=>r.is_active===true && r.pipeline_state==='published')! },
]
console.log('\nSTATUS FROM PRODUCTION:')
for (const s of sample) {
  const key = String(s.r.external_id ?? s.r.id)
  const res = await fetch(`https://www.shootsfunding.co.uk/grants/${key}`, { redirect:'manual' })
  console.log(`  ${String(res.status).padEnd(4)} ${s.kind.padEnd(20)} ${String(s.r.funder??'').slice(0,26)}`)
}
}
main()
