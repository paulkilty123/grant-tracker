import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  describePipelineWriteError,
  isEntitlementError,
  ENTITLEMENT_MESSAGE,
} from './pipeline-errors'

/**
 * Charlotte (Mustard Tree) could not add anything to her pipeline. Postgres was
 * rejecting the insert with 42501 because her org has apply_access = false, but
 * every call site caught it bare and said "Failed to save — please try again".
 * Retrying could never have worked.
 *
 * Two things are pinned here: the real error always reaches the console, and an
 * entitlement rejection never reads as a transient blip.
 */

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  errorSpy.mockRestore()
})

const pgError = (code: string, message = 'boom') => ({ code, message })

describe('describePipelineWriteError', () => {
  it('explains an RLS rejection instead of inviting a pointless retry', () => {
    const msg = describePipelineWriteError(pgError('42501'), 'addToPipeline')
    expect(msg).toBe(ENTITLEMENT_MESSAGE)
    expect(msg).not.toMatch(/try again/i)
  })

  it('reports a duplicate as already saved', () => {
    expect(describePipelineWriteError(pgError('23505'), 'ctx')).toMatch(/already in your pipeline/i)
  })

  it('points at the profile for a missing-data rejection', () => {
    for (const code of ['23502', '23503', '23514']) {
      expect(describePipelineWriteError(pgError(code), 'ctx')).toMatch(/organisation profile/i)
    }
  })

  it('handles a bad enum value without blaming the user', () => {
    expect(describePipelineWriteError(pgError('22P02'), 'ctx')).toMatch(/let us know/i)
  })

  it('tells an expired session to sign in again', () => {
    expect(describePipelineWriteError(pgError('PGRST301'), 'ctx')).toMatch(/sign in again/i)
  })

  it('falls back for an unrecognised code', () => {
    expect(describePipelineWriteError(pgError('99999'), 'ctx')).toBe('Could not save that. Please try again.')
  })

  it('honours a caller-supplied fallback', () => {
    expect(describePipelineWriteError(pgError('99999'), 'ctx', 'Could not add that.')).toBe('Could not add that.')
  })

  it('survives a non-Postgres throw', () => {
    expect(describePipelineWriteError(new Error('network down'), 'ctx')).toBe('Could not save that. Please try again.')
    expect(describePipelineWriteError(null, 'ctx')).toBe('Could not save that. Please try again.')
    expect(describePipelineWriteError('a string', 'ctx')).toBe('Could not save that. Please try again.')
  })

  // The whole point of the change: the cause must be recoverable afterwards.
  it('always logs the underlying error with its code and context', () => {
    describePipelineWriteError(pgError('42501', 'new row violates row-level security policy'), 'markApplied')
    expect(errorSpy).toHaveBeenCalledOnce()
    const [label, payload] = errorSpy.mock.calls[0] as [string, Record<string, unknown>]
    expect(label).toContain('markApplied')
    expect(payload.code).toBe('42501')
    expect(payload.message).toMatch(/row-level security/)
  })

  it('logs even when it cannot interpret the error', () => {
    describePipelineWriteError(new Error('network down'), 'ctx')
    expect(errorSpy).toHaveBeenCalledOnce()
  })
})

describe('isEntitlementError', () => {
  it('recognises 42501 and nothing else', () => {
    expect(isEntitlementError(pgError('42501'))).toBe(true)
    expect(isEntitlementError(pgError('23505'))).toBe(false)
    expect(isEntitlementError(new Error('nope'))).toBe(false)
    expect(isEntitlementError(undefined)).toBe(false)
  })
})

describe('house copy', () => {
  it('uses no dashes in any user-facing message', () => {
    const messages = [
      ENTITLEMENT_MESSAGE,
      describePipelineWriteError(pgError('23505'), 'ctx'),
      describePipelineWriteError(pgError('23502'), 'ctx'),
      describePipelineWriteError(pgError('22P02'), 'ctx'),
      describePipelineWriteError(pgError('PGRST301'), 'ctx'),
      describePipelineWriteError(pgError('99999'), 'ctx'),
    ]
    for (const msg of messages) {
      expect(msg).not.toMatch(/[–—]|--/)
    }
  })
})
