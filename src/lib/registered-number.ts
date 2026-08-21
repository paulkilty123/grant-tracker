import type { LegalStructure } from '@/types'

/**
 * Which register a number belongs to, from its shape alone.
 *
 * Capture is deliberately permissive across all five UK registers the audience
 * actually uses. Requiring a Charity Commission number, as some competitors do,
 * quietly fails CICs, co-ops, Scottish and Northern Irish charities and
 * unregistered groups — which between them are most of this product's users.
 *
 * THE SC COLLISION. `SC123456` is a valid OSCR charity number AND a valid
 * Companies House number for a Scottish company. There is no way to tell them
 * apart from the string, and any rule based on the digits ("OSCR starts SC0")
 * is folklore rather than specification. So this reports `sc_ambiguous` and the
 * caller resolves it with something it actually knows — the org's declared
 * legal structure. Guessing silently here would put a Scottish company's number
 * in the charity column and make the eligibility gate wrong in a way nobody
 * would ever see.
 */
export type Register =
  | 'charity_ew'      // Charity Commission for England and Wales
  | 'charity_scot'    // OSCR
  | 'charity_ni'      // CCNI
  | 'companies_house'
  | 'mutuals'         // FCA mutuals register: co-ops, community benefit societies
  | 'sc_ambiguous'    // OSCR or a Scottish company. Caller decides.
  | 'unknown'

/** Trim, uppercase, drop spaces. Registers print their numbers inconsistently. */
export function normaliseNumber(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '')
}

export function detectRegister(raw: string | null | undefined): Register {
  if (!raw) return 'unknown'
  const n = normaliseNumber(raw)

  if (/^NIC\d{6}$/.test(n)) return 'charity_ni'
  // Both OSCR and Scottish Companies House use SC + 6.
  if (/^SC\d{6}$/.test(n)) return 'sc_ambiguous'
  // Other national company prefixes are unambiguous: NI, and the older R/OC/LP forms.
  if (/^(NI|R|OC|LP|SO|SL|NC|NL|NP)\d{6}$/.test(n)) return 'companies_house'
  // Mutuals carry a letter suffix: 1234R, 12345RS, 7890C.
  if (/^\d{1,6}(R|RS|C|CUS|COOP)$/.test(n)) return 'mutuals'
  // Companies House is 8 digits, commonly zero-padded.
  if (/^\d{8}$/.test(n)) return 'companies_house'
  // Charity Commission E&W is 6 or 7 digits, optionally with a linked-charity suffix.
  if (/^\d{6,7}(-\d{1,2})?$/.test(n)) return 'charity_ew'

  return 'unknown'
}

/** Is this a shape we recognise at all? Used to warn, never to block. */
export function isRecognisedNumber(raw: string | null | undefined): boolean {
  return detectRegister(raw) !== 'unknown'
}

const CHARITY_STRUCTURES: ReadonlySet<string> = new Set([
  'registered_charity', 'cio', 'scio',
])

/**
 * Which organisations column this number belongs in.
 *
 * The schema has exactly two: `charity_number` and `cic_number`. `cic_number`
 * is misnamed — it holds a Companies House number, which CICs, CLGs, LLPs and
 * co-ops all have and only one of which is a CIC. Renaming it is a migration
 * on live data and is not worth doing in launch month, so the name is wrong and
 * the behaviour is right. Flagged rather than fixed.
 *
 * `declaredStructure` only breaks the SC tie. Everything else is decided by the
 * number's own shape, so a user who mis-selects their structure does not end up
 * with a misfiled number.
 */
export function columnFor(
  raw: string | null | undefined,
  declaredStructure: LegalStructure | '' | null | undefined,
): 'charity_number' | 'cic_number' | null {
  const reg = detectRegister(raw)
  switch (reg) {
    case 'charity_ew':
    case 'charity_scot':
    case 'charity_ni':
      return 'charity_number'
    case 'companies_house':
    case 'mutuals':
      return 'cic_number'
    case 'sc_ambiguous':
      // A Scottish charity is far likelier to be typing its OSCR number, but
      // only the declared structure gives us anything to go on.
      return CHARITY_STRUCTURES.has(declaredStructure ?? '') ? 'charity_number' : 'cic_number'
    default:
      return null
  }
}

/** Human label, for the confirm row and for error copy. */
export function registerLabel(reg: Register): string {
  switch (reg) {
    case 'charity_ew':      return 'Charity Commission'
    case 'charity_scot':    return 'OSCR'
    case 'charity_ni':      return 'Charity Commission Northern Ireland'
    case 'companies_house': return 'Companies House'
    case 'mutuals':         return 'FCA mutuals register'
    case 'sc_ambiguous':    return 'OSCR or Companies House'
    default:                return 'Not recognised'
  }
}
