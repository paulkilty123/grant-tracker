/**
 * Structured outcomes for pipeline items.
 *
 * A decline reason from a short list, and an awarded amount on a win. This is
 * the signal the central brain learns from, so the list is deliberately short
 * and in the words a fundraiser would use when reading a decline letter.
 */
export const DECLINE_REASONS = [
  { value: 'not_eligible',      label: 'Not eligible',                 help: 'Structure, location, income or beneficiaries did not fit' },
  { value: 'oversubscribed',    label: 'Oversubscribed',               help: 'A good fit, but the round had far more applicants than money' },
  { value: 'weak_fit',          label: 'Not a priority for them',      help: 'The funder said the work was outside their current focus' },
  { value: 'amount_too_high',   label: 'Asked for too much',           help: 'The request was above what they usually give' },
  { value: 'application_weak',  label: 'Application not strong enough', help: 'Feedback pointed at the case, the budget or the evidence' },
  { value: 'no_reason_given',   label: 'No reason given',              help: 'The funder did not say' },
  { value: 'withdrawn',         label: 'We withdrew',                  help: 'The organisation pulled out before a decision' },
  { value: 'other',             label: 'Something else',               help: 'Say what in the note' },
] as const

export type DeclineReason = typeof DECLINE_REASONS[number]['value']

export function declineReasonLabel(value: string | null | undefined): string | null {
  if (!value) return null
  return DECLINE_REASONS.find(r => r.value === value)?.label ?? null
}
