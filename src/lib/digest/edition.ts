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
}

export const EDITIONS: Edition[] = [
  {
    from: '2026-09-14',
    until: '2026-09-16',
    subject: 'Your Shoots Funding update',
    intro: 'Every Tuesday, one email: what is closing in your pipeline, the applications that have gone quiet, and the funding that fits your profile and is open now. It follows what you save and add in Shoots, so the more you use it, the sharper it gets.',
    updates: [
      'Matches are now ranked by how well they fit you. A newer, weaker match no longer pushes a stronger one down the list.',
      'The Match and Apply plans are live, at the launch price until 31 October. Your trial carries on as it is.',
    ],
  },
]

export function activeEdition(now: Date, editions: Edition[] = EDITIONS): Edition | null {
  const day = now.toISOString().slice(0, 10)
  return editions.find(e => e.from <= day && day <= e.until) ?? null
}
