// The rest of the homepage-linked programme rows, checked the Impact Hub way:
// follow the link, then CLICK INTO a programme and read its own status.
//
//   HATCH ENTERPRISE — relinked again. I had set /programmes/ off a search
//   result; the canonical index is /our-programmes/, and the individual
//   programmes live under it (/our-programmes/join-the-incubator/ and so on).
//   Clicking in, the Incubator page also says "Applications are now open!" — but
//   immediately offers a waiting list "to be the first to hear when our next
//   programmes launch", and names no deadline or cohort date. That reads like a
//   site-wide banner rather than a per-programme status. Unlike Impact Hub there
//   is no positive evidence of closure, so the row stays live and the ambiguity
//   is written into the brief rather than resolved by guessing.
//
//   SOCIAL BUSINESS TRUST — the homepage is not the wrong link; it is the only
//   link. Its own site publishes no eligibility criteria and no application
//   route beyond info@socialbusinesstrust.org. /who-we-work-with/ says only "We
//   back social enterprises with a compelling mission, inspiring leaders and the
//   ambition to grow", and /social-enterprises/ is a portfolio filter.
//
//   The £1,000,000 on our card is unsupported by anything SBT publishes. The only
//   figure on their site is "£8m worth of business expertise and targeted
//   funding" across 24 social enterprises in 2023/24 — roughly £333,000 each,
//   and mostly pro bono time rather than cash. Third-party listings state a
//   requirement of £1m+ annual revenue, which if right excludes most of this
//   catalogue's audience. That is attributed rather than asserted, because it is
//   not on the funder's page.
//
//   The £1m award figure and the £1m revenue threshold being the same number is
//   the likely explanation for both.
//
//   WCIT / AI4C — ai4c.org.uk is a single-purpose site and the right link. It is
//   a membership network offering workshops, a member platform and "pro bono
//   access to leading practitioners", joinable at any time. No change.
//
//   SPACEHIVE — 403 to every fetch. Left; the bot-wall pattern, not a link fault.
//
//   npx tsx --env-file=.env.local scripts/fix-homepage-programmes-2026-08-20.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-homepage-programmes-2026-08-20.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:homepage-programmes-2026-08-20'

const HATCH = 'acbff6c1-4f2f-47a7-8f98-58d0f2072410'
const SBT = '4e036244-6f5c-4c1b-b475-129eaf4e55de'

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // ── Hatch: canonical index, and the banner recorded as a banner ──
  {
    const { data } = await db.from('scraped_grants').select('funder_brief').eq('id', HATCH).limit(1)
    const brief = { ...((data?.[0]?.funder_brief ?? {}) as Record<string, unknown>) }
    brief.how_to_apply =
      'Apply through hatchenterprise.org/our-programmes/, which lists Launchpad, Incubator, Accelerator and the Greener '
      + 'Southwark Business Accelerator. Read the individual programme page before applying: "Applications are now open!" '
      + 'appears on the index AND on each programme page, alongside a waiting list "to be the first to hear when our next '
      + 'programmes launch" and no deadline or cohort date, so it may be a site-wide banner rather than a live status.'
    const quote = 'hatchenterprise.org/our-programmes/ and /our-programmes/join-the-incubator/, read 2026-08-20. '
      + 'Both carry "Applications are now open!"; the programme page also offers a waiting list for the next programmes and states no dates.'
    console.log('── Hatch Enterprise → /our-programmes/')
    if (!DRY) {
      const r = await mergeGrantUpdate({
        id: HATCH,
        fields: {
          apply_url: 'https://hatchenterprise.org/our-programmes/',
          funding_index_url: 'https://hatchenterprise.org/our-programmes/',
          funder_brief: brief,
        },
        source: SOURCE, db,
        citations: {
          apply_url: { snippet: quote, confidence: 'high' },
          funding_index_url: { snippet: quote, confidence: 'high' },
          funder_brief: { snippet: quote, confidence: 'high' },
        },
      })
      console.log(`   applied: ${r.applied.join(', ') || '(nothing)'}`)
    }
  }

  // ── Social Business Trust: an unsupported £1m comes off ──
  {
    const { data } = await db.from('scraped_grants').select('funder_brief').eq('id', SBT).limit(1)
    const brief = { ...((data?.[0]?.funder_brief ?? {}) as Record<string, unknown>) }
    brief.who_can_apply =
      'Social enterprises "with a compelling mission, inspiring leaders and the ambition to grow", working in education, '
      + 'employment or health and wellbeing. SBT publishes no eligibility criteria of its own and no application form: it '
      + 'asks interested organisations to email info@socialbusinesstrust.org, and works with a selected portfolio rather '
      + 'than an open round. Third-party listings state a requirement of annual revenue above £1m, or on track to reach it '
      + 'within 18 months, and an asset lock for a CIC. That figure is NOT on SBT\'s own site and is recorded here as '
      + 'reported, not confirmed. Check before spending time on an approach.'
    brief.amount_note =
      'The card previously showed up to £1,000,000, which appears nowhere SBT publishes. Their own impact page states '
      + '"£8m worth of business expertise and targeted funding" across 24 social enterprises in 2023/24 — roughly £333,000 '
      + 'each, and largely pro bono corporate time rather than cash. The £1m may be the £1m revenue threshold read as an '
      + 'award size. Removed rather than replaced with a figure the funder has not given.'
    const quote = 'socialbusinesstrust.org, /who-we-work-with/ and /social-enterprises/, read 2026-08-20: no eligibility '
      + 'criteria, no application route beyond info@socialbusinesstrust.org, and no award figure. The only number published '
      + 'is "£8m worth of business expertise and targeted funding" across 24 social enterprises in 2023/24.'
    console.log('\n── Social Business Trust → £1,000,000 removed as unsupported')
    if (!DRY) {
      const r = await mergeGrantUpdate({
        id: SBT,
        fields: { amount_max: null, funder_brief: brief },
        source: SOURCE, db,
        citations: {
          amount_max: { snippet: quote, confidence: 'high' },
          funder_brief: { snippet: quote, confidence: 'high' },
        },
      })
      console.log(`   applied: ${r.applied.join(', ') || '(nothing)'}`)
      if (r.rejected?.length) console.log(`   REFUSED: ${JSON.stringify(r.rejected)}`)
    }
  }

  if (DRY) { console.log('\nDRY RUN — nothing written.\n'); return }
  const { data: after } = await db.from('scraped_grants')
    .select('title, apply_url, amount_max, is_active').in('id', [HATCH, SBT])
  console.log('\nverified:')
  for (const a of (after ?? []) as { title: string; apply_url: string; amount_max: number | null; is_active: boolean }[]) {
    console.log(`   ${a.title.slice(0, 42).padEnd(44)} £${a.amount_max ?? '—'}  ${a.is_active ? 'live' : 'hidden'}`)
    console.log(`      ${a.apply_url}`)
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
