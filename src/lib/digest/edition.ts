// A dated edition: hand-written copy that sits at the top of every digest sent
// in its window. Paul, 13 Sept: the first send to the launch signups should be
// called "Your Shoots Funding update", open by saying what the weekly email
// offers, and list what changed that week (rows added, matching improvements).
//
// Dated rather than flagged so it cannot be left on by accident: outside the
// window the digest is exactly what it was. The catalogue line is computed by
// the builder from the same rows it ranks; only the platform lines are typed.
// The next edition replaces the object; an empty window means no edition.

export interface Edition {
  /** Inclusive ISO dates. The window is compared on the calendar day, UTC. */
  from: string
  until: string
  subject: string
  /** What the weekly email is, for a reader who has never had one. */
  intro: string
  /** Platform changes this week. The catalogue count is added by the builder. */
  updates: string[]
  /**
   * Hand-written profile notes for named organisations, used in place of the
   * computed prompt while the edition runs. For the cases no rule can see:
   * a tag the mission contradicts, a description that is not true. Written
   * from a read of the organisation's own site, never from the tags alone.
   */
  profileNotes?: Record<string, { title: string; body: string; cta: string }>
}

export const EDITIONS: Edition[] = [
  {
    from: '2026-09-14',
    until: '2026-09-16',
    subject: 'Your Shoots Funding update',
    intro: 'This lands every Tuesday. It shows what is closing in your pipeline, which applications have stalled, and new funding that fits your profile. Save and add opportunities in Shoots and it gets more useful each week.',
    updates: [
      'You should see better matches now. We improved scoring.',
      'Match and Apply plans are live. Launch price until 31 October.',
    ],
    profileNotes: {
      // The Bank of Dreams and Nightmares (Paul, 14 Sept): a writing charity
      // whose profile carries film and media and youth mental health tags,
      // which put a photography grant and a clinical mental health fund at
      // the top of its list. No grant range set.
      '9340fced-68e9-4aaf-a4b4-8b40754e9c7e': {
        title: 'Two tags are pulling your matches off course',
        body: 'Your profile lists film and media, and youth mental health, as specialisms. Your work is writing, so those two are bringing in photography and clinical mental health funders above the literacy ones. Untick them, and add the grant range you would apply for, and the list will lead with the funders that fit.',
        cta: 'Update your profile',
      },
    },
  },
]

export function activeEdition(now: Date, editions: Edition[] = EDITIONS): Edition | null {
  const day = now.toISOString().slice(0, 10)
  return editions.find(e => e.from <= day && day <= e.until) ?? null
}
