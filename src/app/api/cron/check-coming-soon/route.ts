// Vercel Cron handler — called daily at 07:00
// Checks for grants whose next_open_date_parsed has arrived (i.e. the grant
// should now be open). Clears the "Opens …" badge and routes the grant into the
// review queue so its real deadline can be re-established.
//
// 2026-08-11: it no longer deactivates the row. Hiding a fund on the day it
// reopens is backwards, and it made a reopening look identical to a fresh
// scrape. Visibility is now left untouched and only pipeline_state moves. See
// the long note at the write site.
//
// 2026-07-25: this used to be a single bulk `.update()` that bypassed
// mergeGrantUpdate. Two bugs followed from that:
//
//   1. It set is_active=false without touching pipeline_state, so the row kept
//      pipeline_state='published'. Every admin queue keys off pipeline_state
//      and every triage tab also filters is_active=true, so the row landed in
//      *no* queue at all — invisible to users AND to the admin. The comment
//      above ("moves the grant into Needs Review") had been false since the
//      queue became pipeline_state-driven. This was the primary generator of
//      the dead zone: 101 of the 112 published+inactive rows found on
//      2026-07-25 carry this fingerprint (both open-date columns nulled).
//   2. It nulled next_open_date, which is a TRACKED field, outside the trust
//      ladder — silently clobbering admin-pinned values.
//
// Both were fixed by routing through mergeGrantUpdate. The computed transition
// that fix relied on (`is_active=false` + current='published' → 'captured') is
// no longer used here, because is_active is no longer written: the row is sent
// to 'tagged_awaiting_review' explicitly instead. Bug 2 stays fixed, since
// next_open_date still goes through the trust ladder.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '@/lib/grant-merge'
import { recordRun } from '@/lib/admin/cron-runs'
import { detectReopening } from '@/lib/verification/reopening'

export const dynamic = 'force-dynamic'

const PROVENANCE_SOURCE = 'system:check_coming_soon:v2'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(req: NextRequest) {
  // Auth — same pattern as expire-grants
  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let httpStatus = 200
  const payload = await recordRun('check-coming-soon', async () => {
    const db = getAdminClient()
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

    // Find grants whose "opens" date has arrived or passed
    const { data: dueGrants, error: fetchErr } = await db
      .from('scraped_grants')
      .select('id, title, funder, next_open_date')
      .not('next_open_date', 'is', null)
      .not('next_open_date_parsed', 'is', null)
      .lte('next_open_date_parsed', today)

    if (fetchErr) {
      console.error('check-coming-soon fetch error:', fetchErr)
      httpStatus = 500
      return { error: fetchErr.message }
    }

    // NO EARLY RETURN. This used to bail out when no coming-soon row was due,
    // which is most days — and the reopening pass below would then never run at
    // all. A second job wired behind another job's early exit is a job that does
    // not exist.
    const dueList = dueGrants ?? []

    // Clear the "Opens …" badge and route to review, one row at a time so each
    // write goes through the trust ladder and the state machine.
    //
    // next_open_date is tracked (trust-checked); next_open_date_parsed and
    // pipeline_state are untracked and pass straight through. If the tracked
    // write is rejected because an admin pinned next_open_date, we leave the
    // parsed column alone too — nulling only half the pair would leave the row
    // internally inconsistent (badge text present, parsed date gone).
    const processed: string[] = []
    const skippedPinned: string[] = []
    const failed: { id: string; error: string }[] = []

    for (const g of dueList) {
      const label = `${g.title} (${g.funder}) — was "${g.next_open_date}"`
      try {
        const probe = await mergeGrantUpdate({
          id:     g.id,
          fields: { next_open_date: null },
          source: PROVENANCE_SOURCE,
          db,
        })

        if (probe.rejected.some(r => r.field === 'next_open_date')) {
          // Admin pinned the badge. Respect it, and don't desync the pair.
          skippedPinned.push(label)
          continue
        }

        // Now the untracked half, plus an explicit route into the review queue.
        //
        // THIS USED TO SET is_active:false, WHICH HID THE FUND ON THE DAY IT
        // REOPENED. The reopen date arriving is the single most positive event
        // in a grant's life, and the response to it was to remove the row from
        // every user-facing surface until a human noticed and republished it.
        // The row also landed in `captured`, which is where genuinely new
        // arrivals go, so a reopening was indistinguishable from a fresh scrape.
        //
        // What the date arriving actually means is "our information is now out
        // of date, in a specific and checkable way". That is a review trigger,
        // not a retraction, so visibility is left exactly as it was and the row
        // is routed to tagged_awaiting_review:
        //
        //   already live      → stays live, and the gate treats a blocking
        //                       reason as `attention` rather than pulling it
        //   between rounds    → stays hidden, but is now IN the gate's queue,
        //                       so a clean row publishes itself at 09:00
        //
        // Passing pipeline_state explicitly overrides the computed transition
        // (see transitionPipelineState), which is what keeps is_active out of it.
        //
        // Until the verification engine has a home this is a re-read request
        // aimed at a human or at auto-publish. Once it does, this is the event
        // that should enqueue a verify: the page either says the round is open,
        // in which case publish, or it names a new date, in which case push the
        // reopen date out and go back to waiting.
        await mergeGrantUpdate({
          id:     g.id,
          fields: { next_open_date_parsed: null, pipeline_state: 'tagged_awaiting_review' },
          source: PROVENANCE_SOURCE,
          db,
        })

        processed.push(label)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[check-coming-soon] failed for ${g.id}:`, msg)
        failed.push({ id: g.id, error: msg })
      }
    }

    // ── SECOND PASS: hidden funds whose page already says they are open ──
    //
    // The pass above can only fire on `next_open_date_parsed`, a date somebody
    // parsed in advance. 79 of the 94 rows in `between_rounds_scheduled` have no
    // such date and 36 say only "Closed — next round TBC", so for those this job
    // could never fire at all — however many times verify-rows re-read them.
    //
    // And it does re-read them: `select_verify_batch` takes any row that is not
    // rejected or archived, so all 75 readable ones were read between 16 and 19
    // August 2026. What the page said went into `field_evidence` and nothing ever
    // looked at it again. On 20 August that store held "This programme is
    // currently open for applications, and will close on Monday 21 September at
    // 12 noon" for a fund hidden from users since the day it was read.
    //
    // The comment on the first pass anticipated this: "Once it does, this is the
    // event that should enqueue a verify: the page either says the round is open,
    // in which case publish, or it names a new date." This is that, working off
    // evidence already bought rather than a fresh fetch.
    //
    // A REVIEW, NEVER A PUBLICATION. `is_active` is untouched, exactly as in the
    // pass above: the row joins the queue and a human — or auto-publish, on a
    // clean gate — decides what users see.
    const reopened: string[] = []
    const { data: hidden, error: hiddenErr } = await db
      .from('scraped_grants')
      .select('id, title, funder, deadline, field_evidence')
      .eq('pipeline_state', 'between_rounds_scheduled')
      .limit(1000)

    if (hiddenErr) {
      console.error('[check-coming-soon] hidden-row fetch failed:', hiddenErr.message)
      failed.push({ id: '(hidden batch)', error: hiddenErr.message })
    } else {
      for (const g of (hidden ?? []) as { id: string; title: string; funder: string | null; deadline: string | null; field_evidence: Record<string, unknown> | null }[]) {
        const hit = detectReopening(g, today)
        if (!hit) continue
        try {
          await mergeGrantUpdate({
            id: g.id,
            fields: { pipeline_state: 'tagged_awaiting_review' },
            source: PROVENANCE_SOURCE,
            db,
          })
          reopened.push(`${g.title} (${g.funder}) — ${hit.reason}`)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`[check-coming-soon] reopening write failed for ${g.id}:`, msg)
          failed.push({ id: g.id, error: msg })
        }
      }
    }

    console.log(
      `[check-coming-soon] ${today} — moved ${processed.length} to review, ` +
      `${reopened.length} reopened by evidence, ` +
      `skipped ${skippedPinned.length} (admin-pinned), failed ${failed.length}`
    )

    return {
      ok: failed.length === 0,
      processed: processed.length,
      reopened: reopened.length,
      skippedPinned: skippedPinned.length,
      failed: failed.length,
      grants: processed,
      reopenedGrants: reopened,
      skippedGrants: skippedPinned,
      failures: failed,
    }
  })
  return NextResponse.json(payload, { status: httpStatus })
}
