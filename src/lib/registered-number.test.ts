import { describe, it, expect } from 'vitest'
import { detectRegister, columnFor, normaliseNumber, isRecognisedNumber } from './registered-number'

describe('detectRegister', () => {
  it('reads Charity Commission E&W numbers, including linked-charity suffixes', () => {
    expect(detectRegister('1104458')).toBe('charity_ew')
    expect(detectRegister('292508')).toBe('charity_ew')
    expect(detectRegister('1104458-1')).toBe('charity_ew')
  })

  it('reads Northern Ireland charity numbers', () => {
    expect(detectRegister('NIC100123')).toBe('charity_ni')
  })

  it('reads an 8-digit Companies House number, zero-padded or not', () => {
    expect(detectRegister('07156518')).toBe('companies_house')
    expect(detectRegister('12345678')).toBe('companies_house')
  })

  it('reads mutuals-register numbers by their letter suffix', () => {
    expect(detectRegister('31088R')).toBe('mutuals')
    expect(detectRegister('7890RS')).toBe('mutuals')
  })

  it('refuses to guess on the SC collision', () => {
    // SC123456 is a valid OSCR charity number AND a valid Scottish company
    // number. Anything that picks one from the string alone is guessing.
    expect(detectRegister('SC046869')).toBe('sc_ambiguous')
    expect(detectRegister('SC123456')).toBe('sc_ambiguous')
  })

  it('normalises spacing and case before deciding', () => {
    expect(detectRegister(' nic100123 ')).toBe('charity_ni')
    expect(detectRegister('sc 046869')).toBe('sc_ambiguous')
    expect(normaliseNumber(' sc 046869 ')).toBe('SC046869')
  })

  it('says unknown rather than forcing a match', () => {
    expect(detectRegister('hello')).toBe('unknown')
    expect(detectRegister('')).toBe('unknown')
    expect(detectRegister(null)).toBe('unknown')
    expect(detectRegister('123')).toBe('unknown')
    expect(isRecognisedNumber('123')).toBe(false)
  })
})

describe('columnFor', () => {
  it('files charity numbers in charity_number whatever the user declared', () => {
    // A mis-selected structure must not misfile a number whose shape is clear.
    expect(columnFor('1104458', 'cic_guarantee')).toBe('charity_number')
    expect(columnFor('NIC100123', 'ltd_shares')).toBe('charity_number')
  })

  it('files company and mutuals numbers in the company column', () => {
    expect(columnFor('07156518', 'cic_guarantee')).toBe('cic_number')
    expect(columnFor('31088R', 'cooperative')).toBe('cic_number')
  })

  it('breaks the SC tie on the declared structure, the only signal available', () => {
    expect(columnFor('SC046869', 'scio')).toBe('charity_number')
    expect(columnFor('SC046869', 'registered_charity')).toBe('charity_number')
    expect(columnFor('SC123456', 'cic_shares')).toBe('cic_number')
    expect(columnFor('SC123456', '')).toBe('cic_number')
  })

  it('files nothing when the shape is not recognised', () => {
    expect(columnFor('hello', 'registered_charity')).toBeNull()
    expect(columnFor(null, 'registered_charity')).toBeNull()
  })
})
