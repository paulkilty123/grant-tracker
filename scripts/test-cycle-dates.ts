// Regression tests for deriveCycleDates().
//
//   npx tsx scripts/test-cycle-dates.ts
//
// The case that matters most is #4: a label saying a round OPENS must never
// become a deadline. Gannochy Trust was recorded with a deadline of 3 August
// 2026, which is the date its portal opens; the real deadline is 2 October.
// That error tells an applicant they have weeks less than they do, and tells the
// expiry cron to retire a fund that has only just started accepting.

import { deriveCycleDates } from '../src/lib/grant-deadlines'

const TODAY = new Date(Date.UTC(2026, 6, 26)) // 26 July 2026
let pass = 0, fail = 0

function t(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`)
}

// 1. The live Aviva case: round one passed, round two ahead.
t('Aviva — picks Round Two, not the closed Round One',
  deriveCycleDates([
    { day: 15, label: 'Round One', month: 4 },
    { day: 7,  label: 'Round Two', month: 10 },
  ], TODAY),
  { deadline: '2026-10-07', nextOpenDate: null, ambiguous: 0 })

// 2. Every round already gone this year → roll to next year, do not return null.
t('all rounds passed roll into next year',
  deriveCycleDates([
    { day: 15, label: 'Round One', month: 4 },
    { day: 1,  label: 'Round Two', month: 6 },
  ], TODAY),
  { deadline: '2027-04-15', nextOpenDate: null, ambiguous: 0 })

// 3. Month with no day names a window, not a date. Inventing one would fabricate
//    precision the funder never gave.
t('month without a day is ambiguous, not a guess',
  deriveCycleDates([{ month: 5, label: 'May application round' }], TODAY),
  { deadline: null, nextOpenDate: null, ambiguous: 1 })

// 4. THE ONE THAT MATTERS — an opening date must not become a deadline.
t('Gannochy — "portal opens" is an open date, not a deadline',
  deriveCycleDates([
    { day: 3, label: 'Application portal opens', month: 8 },
    { day: 2, label: 'Application deadline',     month: 10 },
  ], TODAY),
  { deadline: '2026-10-02', nextOpenDate: '2026-08-03', ambiguous: 0 })

// 5. Only an opening date: there is no deadline to state, and claiming one
//    would be worse than leaving it blank.
t('opens-only cycle yields no deadline',
  deriveCycleDates([{ day: 1, label: '2027 round opens', month: 7 }], TODAY),
  { deadline: null, nextOpenDate: '2027-07-01', ambiguous: 0 })

// 6. Impossible dates are dropped rather than coerced.
t('31 February is rejected',
  deriveCycleDates([{ day: 31, month: 2, label: 'Deadline' }], TODAY),
  { deadline: null, nextOpenDate: null, ambiguous: 0 })

// 7. Earliest future close wins when several are ahead.
t('earliest upcoming close wins',
  deriveCycleDates([
    { day: 30, label: 'Round 3', month: 11 },
    { day: 12, label: 'Round 2', month: 9 },
  ], TODAY),
  { deadline: '2026-09-12', nextOpenDate: null, ambiguous: 0 })

// 8. Junk in, nothing out — never throw on real-world data.
t('empty / malformed input is safe',
  deriveCycleDates(null, TODAY),
  { deadline: null, nextOpenDate: null, ambiguous: 0 })

// 9. Caught by a live dry run: "cycle begins" is a start date for a rolling
//    programme, and treating it as a close invents a deadline AND strips a
//    correct is_rolling flag.
t('Suffolk Giving — "cycle begins" is not a deadline',
  deriveCycleDates([{ day: 1, month: 6, label: 'Suffolk Giving Fund cycle begins (4 decisions per year)' }], TODAY),
  { deadline: null, nextOpenDate: '2027-06-01', ambiguous: 0 })

// 10. Same for the other common start-date phrasings.
t('"starts" and "commences" are start dates too',
  deriveCycleDates([
    { day: 5, month: 9, label: 'Programme commences' },
    { day: 20, month: 11, label: 'Final deadline' },
  ], TODAY),
  { deadline: '2026-11-20', nextOpenDate: '2026-09-05', ambiguous: 0 })

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
