/**
 * A fingerprint of the funder's page, so an unchanged page costs a fetch and
 * not a model call.
 *
 * Measured over the seven nights to 2026-09-11: 389 reads, 355 of which found
 * nothing new. Every one paid the model to confirm what the row already held.
 * Fetching is free; reading is not. This hashes the WHOLE page text, not the
 * excerpt the model sees, so a change below the excerpt cap still registers
 * (the cap-equals-threshold trap: the excerpt was 12,000 characters and so was
 * the readability floor, and every readable page read as too short).
 *
 * The decision fails safe in one direction only. A hash that churns because of
 * a cookie banner or a printed date costs a read we did not need. A hash that
 * matches when the page changed cannot happen without a collision. What CAN be
 * missed is a change the page does not show, such as a round that quietly
 * stays open past its printed date; that is why a dated checkpoint always
 * forces a real read whatever the hash says.
 */
import { createHash } from 'crypto'

/** Whitespace-normalised SHA-256 of the page text. */
export function pageHash(text: string): string {
  const normalised = text.replace(/\s+/g, ' ').trim()
  return createHash('sha256').update(normalised).digest('hex')
}

export type UnchangedInput = {
  /** Hash stored on the row's last `_page_read` stamp, if any. */
  previousHash:  string | null | undefined
  /** Hash of the page just fetched. */
  currentHash:   string
  /** Cadence shape the last read decided: dated, always_open or silent. */
  previousShape: string | null | undefined
  /** Whether the last read passed its gate. A failed read left no facts, so a
   *  matching hash would only re-certify a failure. */
  previousPassed: boolean
  /** An outside signal (watchlist, admin) has flagged the row for a look. */
  flagged:       boolean
}

export type UnchangedDecision =
  | { skip: true;  reason: string }
  | { skip: false; reason: string }

/**
 * May the model be skipped because the page has not changed?
 *
 * Only when: we hold a hash, it matches, the last read passed its gate, the
 * row is not flagged, and the last cadence was not a dated checkpoint. A dated
 * row is being read BECAUSE a date arrived, and the question is whether the
 * page still says what it said, not whether the bytes moved.
 */
export function unchangedDecision(input: UnchangedInput): UnchangedDecision {
  if (!input.previousHash)                       return { skip: false, reason: 'no previous hash' }
  if (input.flagged)                             return { skip: false, reason: 'flagged for a look' }
  if (!input.previousPassed)                     return { skip: false, reason: 'last read did not pass its gate' }
  if (input.previousShape === 'dated')           return { skip: false, reason: 'dated checkpoint: read regardless' }
  if (input.previousHash !== input.currentHash)  return { skip: false, reason: 'page changed' }
  return { skip: true, reason: 'page text matches the last read' }
}
