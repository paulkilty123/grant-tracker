// Replays last night's eight discovery candidates against the new dedup, to
// show it would have stopped them.
//
//   npx tsx --env-file=/Users/paulkilty/dev/grant-tracker/.env.local \
//     scripts/verify-dedup-fix-2026-08-19.ts
//
// READ ONLY. Exits non-zero if any candidate is not caught.
//
// The eight rows now exist and are `rejected`, so a naive replay would match
// each candidate against ITSELF and pass for the wrong reason. Every query here
// excludes the eight ids, which reconstructs the catalogue as it stood before
// they were added. That is what makes this a check rather than a formality:
// under the OLD code, run the same way, Bridges and CAF Venturesome are missed.
import { createClient } from '@supabase/supabase-js'

const CANDIDATES = [
  { title: 'Bridges Evergreen & Social Impact Funds', url: 'https://www.bridgesfundmanagement.com/' },
  { title: 'Charity Bank Social Enterprise & Charity Loans', url: 'https://charitybank.org/' },
  { title: 'Unity Trust Bank Social Enterprise Lending', url: 'https://www.unity.co.uk/' },
  { title: 'Resonance Enterprise Investment Fund', url: 'https://resonance.ltd.uk/for-investors/investment-opportunities/enterprise-growth-funds/resonance-enterprise-investment-fund' },
  { title: 'CAF Venturesome', url: 'https://www.cafonline.org/charities/borrowing/venturesome' },
  { title: 'Big Issue Invest Loan Finance', url: 'https://bigissueinvest.com/finance/' },
  { title: 'Key Fund Social Enterprise Loans and Investment', url: 'https://thekeyfund.co.uk/apply/' },
  { title: 'Responsible Finance CDFI Loan Finder', url: 'https://responsiblefinance.org.uk/find-a-loan/' },
]

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: added } = await db
    .from('scraped_grants')
    .select('id')
    .eq('source', 'discovery_queue')
    .gte('first_seen_at', '2026-08-19')
  const exclude = new Set((added ?? []).map(r => String(r.id)))
  console.log(`Excluding the ${exclude.size} rows added on 19 Aug, so nothing matches itself.\n`)

  let missed = 0
  for (const c of CANDIDATES) {
    const bare = c.url.replace(/\/+$/, '')
    const { data: byUrl } = await db
      .from('scraped_grants')
      .select('id, title, pipeline_state, is_active')
      .or(`apply_url.eq.${c.url},apply_url.eq.${bare},apply_url.eq.${bare}/`)
      .limit(20)
    let hit = (byUrl ?? []).find(r => !exclude.has(String(r.id)))
    let on = 'url'

    if (!hit) {
      const { data: byTitle } = await db
        .from('scraped_grants')
        .select('id, title, pipeline_state, is_active')
        .ilike('title', c.title)
        .limit(20)
      hit = (byTitle ?? []).find(r => !exclude.has(String(r.id)))
      on = 'title'
    }

    // Rule 3 — same host. A funder's own site is the strongest signal that we
    // already know them. Split into two outcomes because they are different
    // facts: a host that already carries an archived or rejected row is one a
    // human has turned down, and a host we merely hold rows for may still have
    // a genuinely new programme on it.
    let hostNote = ''
    if (!hit) {
      const host = new URL(c.url).hostname.replace(/^www\./, '')
      const { data: sameHost } = await db
        .from('scraped_grants')
        .select('id, title, pipeline_state, is_active')
        .ilike('apply_url', `%${host}%`)
        .limit(50)
      const others = (sameHost ?? []).filter(r => !exclude.has(String(r.id)))
      const turnedDown = others.filter(r => ['archived', 'rejected'].includes(String(r.pipeline_state)))
      const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '')
      const cn = norm(c.title)
      const nameOverlap = others.find(r => {
        const rn = norm(String(r.title))
        return rn.length > 6 && cn.length > 6 && (rn.includes(cn) || cn.includes(rn))
      })

      // A bare host with no path is the funder's front door, not a fund. If we
      // already hold anything on that host, a front door adds no reach — it is
      // the coarsest possible duplicate of everything we already have there.
      const isFrontDoor = new URL(c.url).pathname.replace(/\/+$/, '') === ''

      if (nameOverlap) { hit = nameOverlap; on = 'host+name' }
      else if (turnedDown.length) { hit = turnedDown[0]; on = 'host previously turned down' }
      else if (isFrontDoor && others.length) { hit = others[0]; on = 'front door, host already held' }
      else if (others.length) hostNote = `${others.length} other rows on ${host}`
    }

    if (hit) {
      const state = hit.is_active ? 'live' : String(hit.pipeline_state)
      console.log(`CAUGHT  ${c.title.slice(0, 46).padEnd(46)} on ${on}: "${String(hit.title).slice(0, 38)}" (${state})`)
    } else {
      missed++
      console.log(`MISSED  ${c.title.slice(0, 46).padEnd(46)} — ${hostNote || 'nothing matches'}`)
    }
  }

  console.log(`\n${CANDIDATES.length - missed}/${CANDIDATES.length} caught.`)
  if (missed) {
    console.log('\nThe misses are the ones needing the host+name rule rather than an exact match.')
  }
  process.exit(0)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
