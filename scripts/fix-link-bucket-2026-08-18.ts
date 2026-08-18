// Link needs fixing — the dead-link half, worked 2026-08-18.
//
// Modelled on apply-paul-notes-2026-08-11.ts: every write goes through
// mergeGrantUpdate so the trust ladder judges it and a refusal comes back in
// `rejected` rather than looking like success. That matters here because this
// batch is the first written after the D5 finding — a field frozen at admin
// trust would otherwise no-op silently.
//
// Fifteen rows carried `link_dead`. Eleven were duplicates of rows that already
// carry the fund with a working link and were withdrawn separately. These are
// the remaining four, plus one row whose funder has no findable application
// route at all.
//
//   npx tsx --env-file=.env.local scripts/fix-link-bucket-2026-08-18.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-link-bucket-2026-08-18.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:link-fix-2026-08-18'

type Change = {
  id: string
  title: string
  snippet: string
  fields: Record<string, unknown>
}

const CHANGES: Change[] = [
  {
    id: '52492f76-0299-4c27-81d0-d2cd5dacddba',
    title: 'Big Issue Invest — moved, not closed',
    snippet:
      'bigissueinvest.com now redirects to bigissue.com/invest. We provide loans from £20,000 to £4 million, backing organisations at every stage of their growth. Submit an enquiry and one of our investment managers will be in touch.',
    fields: { apply_url: 'https://www.bigissue.com/invest/' },
  },
  {
    id: '1335abc5-ad75-43a3-9f29-c500cdf3e06f',
    title: 'CAST — /what-we-do is gone, the site root is live',
    snippet:
      'wearecast.org.uk/what-we-do returns dead; the funder site at wearecast.org.uk is live and is the URL the sibling CAST Accelerator Programme row already uses successfully.',
    fields: { apply_url: 'https://wearecast.org.uk/' },
  },
  {
    id: '8e5f63e4-85d9-47db-b278-56263c8ab4f7',
    title: 'Severn Trent Community Fund — trust domain dead, fund lives on the utility site',
    snippet:
      'severntrenttrust.org.uk is dead. The fund is published at stwater.co.uk under Severn Trent Community Fund, where the November window is stated: applications open Monday 2 November 2026 and close 23:59 Monday 30 November 2026.',
    fields: { apply_url: 'https://www.stwater.co.uk/about-us/severn-trent-community-fund/' },
  },
  {
    id: '7cbd2cd2-aa65-4843-9654-5f58e06d2bdc',
    title: 'Clifford Chance Foundation — withdrawn, no application route',
    snippet:
      'The stored page 404s. The live responsible-business page names the Foundation but publishes no application route, no eligibility and no contact for applicants: "often alongside grant funding from the Clifford Chance Foundation". Nothing on the funder site lets a fundraiser apply.',
    fields: {
      is_active: false,
      pipeline_state: 'rejected',
      rejection_reason:
        'dead_url: the stored page 404s and the funder publishes no application route anywhere on its own site. The Foundation still exists and is named on the responsible-business page, so this is re-discoverable if it ever opens a public route. Withdrawn 2026-08-18.',
    },
  },
  {
    id: '13ddd968-6fdd-44ae-86eb-edb640087113',
    title: 'Santander Discovery and Explorer Grants — withdrawn, domain gone',
    snippet:
      'santanderfoundationuk.org no longer resolves in DNS, and santandersustainability.co.uk/the-santander-foundation redirects to a 404. Third-party directories describe a successor Financial and Digital Empowerment Fund, but nothing on a Santander domain could be reached to confirm it.',
    fields: {
      is_active: false,
      pipeline_state: 'rejected',
      rejection_reason:
        'dead_url: santanderfoundationuk.org no longer resolves and the successor URL 404s. Third-party sources suggest the Foundation now runs a Financial and Digital Empowerment Fund, unconfirmed on any Santander page, so re-add it as a new row rather than reviving this one. Withdrawn 2026-08-18.',
    },
  },
]

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let applied = 0
  let refused = 0

  for (const c of CHANGES) {
    console.log(`\n── ${c.title}`)
    if (DRY) {
      console.log(`   ${JSON.stringify(c.fields)} (dry)`)
      continue
    }
    const citations = Object.fromEntries(
      Object.keys(c.fields).map(k => [k, { snippet: c.snippet, confidence: 'high' as const }]),
    )
    const r = await mergeGrantUpdate({ id: c.id, fields: c.fields, source: SOURCE, db, citations })
    console.log(`   applied:  ${JSON.stringify(r.applied)}`)
    applied += r.applied.length
    if (r.rejected?.length) {
      console.log(`   REJECTED: ${JSON.stringify(r.rejected)}`)
      refused += r.rejected.length
    }
  }

  // Report both halves. A run that says nothing about refusals is the failure
  // mode the enrich handlers used to have.
  if (!DRY) console.log(`\nfields applied: ${applied}   fields refused: ${refused}`)
}

main().catch(e => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
