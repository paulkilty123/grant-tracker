/**
 * The application allowance, as words.
 *
 * The NUMBERS live in the database: `application_allowance(org)` in migration
 * 079 decides how many applications an organisation may start and how many it
 * has, and the insert trigger on `applications` enforces it. This file only
 * turns that answer into sentences, so the route's refusal and the page's
 * "3 of 5 left" cannot disagree with each other or with the guard.
 *
 * Pure. No session, no database, so it is safe in a client component.
 */

export interface ApplicationAllowance {
  /** 'trial' | 'apply' | 'team' | 'granted' | 'none' */
  basis: string
  /** null = unlimited */
  limit_count: number | null
  used: number
  period_start: string
  /** null = does not reset (the trial) */
  resets_at: string | null
}

const SPELLED = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const spell = (n: number) => (n >= 0 && n < SPELLED.length ? SPELLED[n] : String(n))

/** "1 October", in the reader's own calendar. */
function resetDay(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })
}

export function allowanceRemaining(a: ApplicationAllowance): number | null {
  if (a.limit_count === null) return null
  return Math.max(0, a.limit_count - a.used)
}

export function allowanceExhausted(a: ApplicationAllowance): boolean {
  const left = allowanceRemaining(a)
  return left !== null && left <= 0
}

/**
 * The line under the "create" button. Says what is left and when it resets,
 * in the reader's terms. Null when there is nothing worth saying (unlimited).
 */
export function allowanceStatusLine(a: ApplicationAllowance): string | null {
  const left = allowanceRemaining(a)
  if (left === null) return null
  if (a.basis === 'trial') {
    return left === 0
      ? 'Both of your trial applications are used.'
      : `${left === 1 ? 'One' : 'Two'} of your two trial applications left.`
  }
  const when = resetDay(a.resets_at)
  return `${left === 0 ? 'No' : spell(left).replace(/^./, c => c.toUpperCase())} of your ${spell(a.limit_count ?? 0)} applications left this month${when ? `, resets on ${when}` : ''}.`
}

/**
 * The refusal. Returned by the route with a 403 and shown in place of the
 * create button. Says what happened and what to do, nothing else.
 */
export function allowanceRefusalMessage(a: ApplicationAllowance): string {
  if (a.basis === 'trial') {
    return 'Your trial includes two applications, and both are started. Choose a plan to keep going.'
  }
  if (a.basis === 'none') {
    return 'Applications are not switched on for this organisation.'
  }
  const when = resetDay(a.resets_at)
  return `You have started ${spell(a.limit_count ?? 0)} applications this month, which is the limit on your plan${when ? `. It resets on ${when}` : ''}. If you need more before then, reply to any Shoots email and say so.`
}
