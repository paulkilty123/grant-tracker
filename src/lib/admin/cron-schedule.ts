// Read the real schedules, and work out when each job is next due.
//
// Schedules come from vercel.json, which is checked into the repo and is what
// Vercel actually reads — so the displayed schedule cannot drift from the live
// one. Header comments in the route files already disagree with it in three
// places (validate-urls says "every Monday", the cron is Sun+Wed), which is
// exactly why this reads the config rather than any documentation of it.

import vercelConfig from '../../../vercel.json'

export type CronEntry = { job: string; path: string; schedule: string }

/** Strip the query string so `crawl-grants?batch=1` and `?batch=2` share a job
 *  name. Nine batch entries are nine schedules of ONE job; showing them as nine
 *  rows would bury every other job on the page. */
function jobName(path: string): string {
  return path.replace(/^\/api\/(cron|admin)\//, '').split('?')[0]
}

export function cronEntries(): CronEntry[] {
  const crons = (vercelConfig as { crons?: { path: string; schedule: string }[] }).crons ?? []
  return crons.map(c => ({ job: jobName(c.path), path: c.path, schedule: c.schedule }))
}

/** One row per job, carrying every schedule it runs on. */
export function jobSchedules(): { job: string; schedules: string[] }[] {
  const m = new Map<string, string[]>()
  for (const e of cronEntries()) {
    const list = m.get(e.job) ?? []
    list.push(e.schedule)
    m.set(e.job, list)
  }
  return Array.from(m.entries()).map(([job, schedules]) => ({ job, schedules }))
}

/**
 * Next fire time for a 5-field cron, searched forward minute by minute.
 *
 * A brute scan rather than a library: every entry in vercel.json is daily or
 * weekly, so the answer is always within 7 days and the loop is trivially
 * correct. It handles wildcards, step values (star-slash-N), comma lists and
 * plain numbers. Step values matter because the team moved to Pro on 4 August
 * and sub-daily schedules are now permitted, though nothing has been
 * re-cadenced yet.
 *
 * Returns null if nothing matches inside 8 days, which means the expression is
 * one this parser does not understand — better surfaced as "unknown" on the page
 * than silently rendered as a confident wrong date.
 */
export function nextDue(schedule: string, from: Date = new Date()): Date | null {
  const parts = schedule.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [min, hr, dom, mon, dow] = parts

  const hit = (field: string, value: number): boolean => {
    if (field === '*') return true
    for (const chunk of field.split(',')) {
      if (chunk.startsWith('*/')) {
        const step = Number(chunk.slice(2))
        if (Number.isFinite(step) && step > 0 && value % step === 0) return true
      } else if (Number(chunk) === value) return true
    }
    return false
  }

  const d = new Date(from)
  d.setUTCSeconds(0, 0)
  d.setUTCMinutes(d.getUTCMinutes() + 1)
  for (let i = 0; i < 8 * 24 * 60; i++) {
    if (
      hit(min, d.getUTCMinutes()) && hit(hr, d.getUTCHours()) &&
      hit(dom, d.getUTCDate()) && hit(mon, d.getUTCMonth() + 1) &&
      hit(dow, d.getUTCDay())
    ) return new Date(d)
    d.setUTCMinutes(d.getUTCMinutes() + 1)
  }
  return null
}

/** The soonest next-due across all of a job's schedules. */
export function nextDueForJob(schedules: string[], from: Date = new Date()): Date | null {
  const times = schedules.map(s => nextDue(s, from)).filter(Boolean) as Date[]
  if (!times.length) return null
  return times.reduce((a, b) => (a < b ? a : b))
}

/**
 * Longest gap the job's own schedule implies, plus slack. Used to judge overdue.
 *
 * Derived from the schedule rather than hard-coded, so a re-cadenced job does
 * not need this file edited too.
 *
 * The slack is 90 minutes and is not padding for its own sake: Vercel fires
 * crons approximately, and the 2 August auto-publish run landed 34 minutes late
 * while being entirely healthy. A page that shows red on a healthy job is a page
 * people stop reading.
 */
export function overdueAfter(schedules: string[], lastRun: Date): Date {
  const probe = new Date(lastRun)
  const next = nextDueForJob(schedules, probe)
  const due = next ?? new Date(probe.getTime() + 24 * 3600_000)
  return new Date(due.getTime() + 90 * 60_000)
}

/** Per-million-token prices. Derived at RENDER time, never stored — prices move,
 *  and a stored figure goes quietly wrong while a token count stays true. */
const PRICES: Record<string, { in: number; out: number }> = {
  'claude-haiku-4-5-20251001': { in: 1,  out: 5  },
  'claude-haiku-4-5':          { in: 1,  out: 5  },
  'claude-sonnet-5':           { in: 3,  out: 15 },
  'claude-sonnet-4-5-20250929':{ in: 3,  out: 15 },
  'claude-opus-4-8':           { in: 5,  out: 25 },
}

export type UsageEntry = { model: string; input_tokens: number; output_tokens: number; calls: number }

/** Returns null when no usage was recorded — which means "this job does not call
 *  a model", not "it was free". The page must not render £0.00 for the former. */
export function runCostGBP(usage: UsageEntry[] | null | undefined): number | null {
  if (!usage?.length) return null
  let usd = 0
  for (const u of usage) {
    const p = PRICES[u.model]
    if (!p) continue
    usd += (u.input_tokens / 1e6) * p.in + (u.output_tokens / 1e6) * p.out
  }
  return usd * 0.79   // rough USD→GBP; the token counts are the durable record
}
