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
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4,  may: 5,  jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

// Returns the next future deadline (ISO YYYY-MM-DD) parsed from a
// recurrence-style timeline string, or null if fewer than 2 distinct dates
// can be parsed (single-shot grants shouldn't silently roll forward).
function parseNextRoundDeadline(timelineText: string, todayISO: string): string | null {
  if (!timelineText) return null
  const text = timelineText.toLowerCase()
  const dayMonths: Array<{ day: number; month: number }> = []

  // Pattern A: "1 April" / "1st April 2026"
  for (const m of Array.from(text.matchAll(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi
  ))) {
    const day = parseInt(m[1], 10)
    const month = MONTHS[m[2].toLowerCase().slice(0, 3)]
    if (month && day >= 1 && day <= 31) dayMonths.push({ day, month })
  }
  // Pattern B: "April 1" / "April 1, 2026" (US-style)
  for (const m of Array.from(text.matchAll(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi
  ))) {
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

  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]  // YYYY-MM-DD

  // Find every grant whose deadline has passed
  const { data: candidates, error: fetchErr } = await supabase
    .from('scraped_grants')
    .select('id, external_id, title, deadline, funder_brief')
    .eq('is_active', true)
    .eq('is_rolling', false)
    .not('deadline', 'is', null)
    .lt('deadline', today)

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

  const rolled: Array<{ id: string; title: string; old: string; next: string }> = []
  const toExpireIds: string[] = []
  const expiredOut: Array<{ id: string; title: string; deadline: string }> = []

  for (const g of candidates ?? []) {
    const brief = g.funder_brief as Record<string, unknown> | null
    const tl = brief?.decision_timeline as string | undefined
    const nextDate = tl ? parseNextRoundDeadline(tl, today) : null

    if (nextDate && nextDate > today) {
      // Multi-round grant — advance the deadline instead of deactivating
      const { error: updErr } = await supabase
        .from('scraped_grants')
        .update({ deadline: nextDate })
        .eq('id', g.id)
      if (!updErr) {
        rolled.push({
          id: g.external_id as string,
          title: g.title as string,
          old: g.deadline as string,
          next: nextDate,
        })
      } else {
        toExpireIds.push(g.id as string)
      }
    } else {
      toExpireIds.push(g.id as string)
      expiredOut.push({
        id: g.external_id as string,
        title: g.title as string,
        deadline: g.deadline as string,
      })
    }
  }

  if (toExpireIds.length > 0) {
    await supabase.from('scraped_grants').update({ is_active: false }).in('id', toExpireIds)
  }

  return NextResponse.json({
    success:      true,
    expiredCount: expiredOut.length,
    rolledCount:  rolled.length,
    expired:      expiredOut,
    rolled,
  })
}
