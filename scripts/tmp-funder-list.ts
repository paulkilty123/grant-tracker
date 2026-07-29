import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import path from 'path'
for (const l of readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
;(async () => {
  const names = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from('scraped_grants').select('funder').range(from, from + 999)
    for (const r of data ?? []) if (r.funder) names.add(String(r.funder).trim())
    if (!data || data.length < 1000) break
  }
  console.log(Array.from(names).sort().join(' | '))
  console.error(`${names.size} distinct funders`)
})()
