// Vercel Cron handler — called nightly at 02:00
// Marks grants whose deadline has passed as inactive so they stop
// appearing in search results. Rolling grants are never expired.
//
// Multi-round grants (e.g. "Deadlines are 1 April and 1 October each year")
// auto-roll forward instead of expiring: the cron parses decision_timeline
// for 2+ DD Month patterns and advances `deadline` to the next future
// occurrence, so the grant stays in the catalogue between rounds without
// admin intervention.
import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/admin/admin-db'
import { mergeGrantUpdate } from '@/lib/grant-merge'
import { recordRun } from '@/lib/admin/cron-runs'
import { nextCycleDeadline, type CycleEntry } from '@/lib/deadline-cycle'

export const dynamic = 'force-dynamic'

// Service-role client. MUST NOT be the cookie-based `@/lib/supabase/server`
// helper: a cron request carries no session cookie, so that client runs as
// `anon`, and `scraped_grants` RLS exposes only a public SELECT policy with no
// UPDATE policy. PostgREST accepts the request, RLS matches zero rows, and
// **no error is returned** — so every write here silently did nothing while
// the handler reported non-zero counts. Diagnosed 2026-07-25: provenance
// source `system:expire_grants:*` appeared on 0 of 1,729 rows.
function getAdminClient() {
  return getAdminDb()
}

// Bump if the roll-forward parser or between-rounds behaviour changes materially.
// v2 (2026-05-27): prefer structured deadline_cycle column when populated;
// fall back to prose parser only for legacy rows without deadline_cycle.
const EXPIRE_VERSION    = 'v2'
const PROVENANCE_SOURCE = `system:expire_grants:${EXPIRE_VERSION}`

// ── Cycle math — Pipeline v1 ──────────────────────────────────────────────────
// Moved to src/lib/deadline-cycle.ts, shared with admin/sweep. It lived here and
// there byte-identical, with a "mirrors" comment holding the two in step by
// hope; both carried the same opening-date bug, and fixing one would have left
// the sweep proposing a different date from the cron that acts on it.

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4,  may: 5,  jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

// Negative-context cues — when any phrase below appears in the ~60 chars
// before a date, that date is NOT an application deadline (it's a
// project-completion, report-due, panel/decision, announcement, or
// grant-period date). Mirrors NON_APP_DATE_CUES in the admin Detect
// button (src/app/dashboard/admin/urls/page.tsx) — keep the two in sync.
//
// Without this, rolling cron over a brief like "Application deadline is
// 11 May 2026. Funding decisions will be announced week commencing
// 8 June 2026. All funded activities must be completed by 31 March
// 2028." would pull all three dates as candidates and roll the deadline
// to 8 June (the announcement) instead of correctly expiring or rolling
// to next year's 11 May.
const NON_APP_DATE_CUES = /\b(?:complet(?:ed?|ion|ing)\b|report(?:s|ing)?\s+(?:due|submitted|by|deadline)|submitted\s+(?:by|on)\b|panel\s+(?:meets?|takes?\s+place|sits?|review|date|decision)|decision\s+(?:by|on|date|made|announced|expected)|announce[a-z]*\b|results?\s+(?:by|on|announced|in|available)|paid\s+(?:out|by)\b|awarded\s+(?:by|on|in)\b|projects?\s+(?:should\s+|must\s+|will\s+|need\s+to\s+|are\s+expected\s+to\s+)?(?:begin|start|commence|run\s+(?:from|until))|delivery\s+(?:by|begins?|ends?|period)|grant\s+period|funding\s+(?:ends?|begins?|period)|notified\s+(?:by|on)|(?:event|final|finals?|ceremony|conference|summit|launch\s+event|gala|celebration|reception|showcase|presentation|workshop|symposium)\s+(?:on|at|in|date|takes?\s+place)?\b|pitch(?:es|ed|ing)?\s+(?:at|on|in|to)\b|finalists?\s+(?:pitch|present|attend|notified|interview|meet)|shortlist(?:ed|ing)?\s+(?:by|on|in|candidates?)|interview(?:s|ed|ing)?\s+(?:on|in|held|by)|winners?\s+(?:announced|notified|selected|named))/i

// Returns the next future deadline (ISO YYYY-MM-DD) parsed from a
// recurrence-style timeline string, or null if fewer than 2 distinct dates
// can be parsed (single-shot grants shouldn't silently roll forward).
function parseNextRoundDeadline(timelineText: string, todayISO: string): string | null {
  if (!timelineText) return null
  const text = timelineText.toLowerCase()
  const dayMonths: Array<{ day: number; month: number }> = []

  const isNonAppDate = (idx: number) => {
    const leftCtx = text.slice(Math.max(0, idx - 60), idx)
    return NON_APP_DATE_CUES.test(leftCtx)
  }

  // Pattern A: "1 April" / "1st April 2026"
  for (const m of Array.from(text.matchAll(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi
  ))) {
    if (isNonAppDate(m.index ?? 0)) continue
    const day = parseInt(m[1], 10)
    const month = MONTHS[m[2].toLowerCase().slice(0, 3)]
    if (month && day >= 1 && day <= 31) dayMonths.push({ day, month })
  }
  // Pattern B: "April 1" / "April 1, 2026" (US-style)
  for (const m of Array.from(text.matchAll(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi
  ))) {
    if (isNonAppDate(m.index ?? 0)) continue
    const month = MONTHS[m[1].toLowerCase().slice(0, 3)]
    const day = parseInt(m[2], 10)
    if (month && day >= 1 && day <= 31) dayMonths.push({ day, month })
  }

  // Dedupe to distinct day-month combos
  const uniq = new Map<string, { day: number; month: number }>()
  for (const d of dayMonths) uniq.set(`${d.month}-${d.day}`, d)
  if (uniq.size < 2) return null  // single date — don't auto-roll

  // Compute next future occurrence per (day, month); take the earliest
  const today = new Date(`${todayISO}T00:00:00Z`)
  const currentYear = today.getUTCFullYear()
  let earliest: Date | null = null
  for (const { day, month } of Array.from(uniq.values())) {
    let candidate = new Date(Date.UTC(currentYear, month - 1, day))
    if (candidate < today) candidate = new Date(Date.UTC(currentYear + 1, month - 1, day))
    if (!earliest || candidate < earliest) earliest = candidate
  }
  return earliest ? earliest.toISOString().slice(0, 10) : null
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let httpStatus = 200
  const payload = await recordRun('expire-grants', async () => {
    const supabase = getAdminClient()
    const today = new Date().toISOString().split('T')[0]  // YYYY-MM-DD

    // Find every grant whose deadline has passed
    const { data: candidates, error: fetchErr } = await supabase
      .from('scraped_grants')
      .select('id, external_id, title, deadline, next_open_date, funder_brief, deadline_cycle')
      .eq('is_active', true)
      .not('is_rolling', 'is', true)
      .not('deadline', 'is', null)
      .lt('deadline', today)

    if (fetchErr) { httpStatus = 500; return { error: fetchErr.message } }

    const rolled: Array<{ id: string; title: string; old: string; next: string }> = []
    const betweenRoundsOut: Array<{ id: string; title: string; deadline: string }> = []

    for (const g of candidates ?? []) {
      const brief = g.funder_brief as Record<string, unknown> | null
      const tl    = brief?.decision_timeline as string | undefined
      // v2: prefer structured deadline_cycle column when populated.
      // Falls back to the legacy prose parser only when the column is null
      // (existing un-backfilled rows). Once Phase 4 auto-chain has run across
      // the catalogue, every row with a cycle should have the column set.
      const cycleFromColumn = g.deadline_cycle as CycleEntry[] | null | undefined
      const nextDate = cycleFromColumn && cycleFromColumn.length > 0
        ? nextCycleDeadline(cycleFromColumn, today)
        : (tl ? parseNextRoundDeadline(tl, today) : null)

      if (nextDate && nextDate > today) {
        // Multi-round grant — advance the deadline instead of deactivating.
        try {
          const r = await mergeGrantUpdate({
            id:     g.id as string,
            fields: { deadline: nextDate },
            source: PROVENANCE_SOURCE,
            pinned: false,
            db:     supabase,
          })
          if (r.applied.includes('deadline')) {
            rolled.push({
              id: g.external_id as string,
              title: g.title as string,
              old: g.deadline as string,
              next: nextDate,
            })
            continue
          }
          // Rejected (admin pin or higher trust held the deadline) — leave as-is.
          // The next scraper run will refresh content; admin's pinned deadline wins.
          continue
        } catch {
          // fallthrough to between-rounds on write error
        }
      }

      // No clean roll possible. What happens next turns on whether we know when
      // it reopens, because those are two different things to tell a user.
      //
      //   KNOWN reopen date  → stay visible. "Opens 1 September" is useful, and
      //                        check-coming-soon will pick the row up on the day.
      //   NO reopen date     → hide. The row previously stayed live carrying a
      //                        'Closed — next round TBC' placeholder, on the
      //                        reasoning that vanishing was worse than a
      //                        placeholder. That reasoning does not survive
      //                        contact with the surfaces: every user-facing
      //                        query accepts a null deadline, so the row sat in
      //                        results indistinguishable from an open fund, and
      //                        the placeholder only appeared once a user opened
      //                        the detail page. A closed round with no known
      //                        return is not a lead, and showing it spends the
      //                        user's attention on an application they cannot
      //                        make.
      //
      // is_active:false with next_open_date set transitions the row to
      // between_rounds_scheduled (see transitionPipelineState), which is the
      // state that exists for exactly this and which the admin "Between rounds"
      // tab reads. It does NOT go to Needs Review.
      const existingNextOpen = (g.next_open_date as string | null) ?? null
      try {
        const r = await mergeGrantUpdate({
          id:     g.id as string,
          fields: {
            deadline:       null,
            next_open_date: existingNextOpen ?? 'Closed — next round TBC',
            ...(existingNextOpen ? {} : { is_active: false }),
          },
          source: PROVENANCE_SOURCE,
          pinned: false,
          db:     supabase,
        })
        if (r.applied.length > 0) {
          betweenRoundsOut.push({
            id: g.external_id as string,
            title: g.title as string,
            deadline: g.deadline as string,
          })
        }
      } catch (err) {
        console.error('[expire-grants] write failed:', err)
      }
    }

    return {
      success:           true,
      betweenRoundsCount: betweenRoundsOut.length,
      rolledCount:       rolled.length,
      betweenRounds:     betweenRoundsOut,
      rolled,
    }
  })
  return NextResponse.json(payload, { status: httpStatus })
}
