import { readFileSync } from 'node:fs'
for (const l of readFileSync('.env.local','utf8').split('\n')) { const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if(m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g,'') }
import { isGone, grantKeyFromPath } from '../src/lib/gone-grants'
async function main(){
  console.log('path match:', grantKeyFromPath('/grants/abc-123'))
  const { createClient } = await import('@supabase/supabase-js')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await db.from('scraped_grants').select('id,external_id,funder').eq('pipeline_state','rejected').limit(3)
  for (const r of data ?? []) {
    const key = String(r.external_id ?? r.id)
    console.log(`  ${key}  ->  isGone = ${await isGone(key)}   (${r.funder})`)
  }
  console.log('  a live uuid -> isGone =', await isGone('00000000-0000-4000-8000-000000000000'))
}
main()
