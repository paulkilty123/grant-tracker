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

/**
 * What number does THIS structure actually have?
 *
 * "No company number" is the normal state for a large part of this audience,
 * not a gap to chase. A CIO or SCIO is fully incorporated and has no Companies
 * House number at all — that is the entire point of the form. An unincorporated
 * association may have a charity number or nothing. A co-op has an FCA mutuals
 * number. Asking all of them for a "company number" and then showing "we
 * couldn't find this" tells most of them something is wrong when nothing is.
 *
 * So the field names the register their structure uses, and when a number is
 * not expected it says so plainly instead of implying an omission.
 */
export interface NumberExpectation {
  /** Field label: what to call it for this structure. */
  label: string
  /** Why we ask, in their terms. */
  hint: string
  /** Whether leaving it blank is unremarkable. */
  expected: boolean
  /** Empty-state copy when nothing is entered. */
  emptyText: string
}

export function expectedRegisterFor(structure: LegalStructure | '' | null | undefined): NumberExpectation {
  const askWhy = 'We use it to check eligibility, so your matches are right.'
  switch (structure) {
    case 'cio':
    case 'scio':
      return {
        label: 'Charity number',
        // Worth saying out loud: CIO founders are regularly asked for a company
        // number they have never had, and assume they have done something wrong.
        hint: `A CIO is registered with the charity regulator, not Companies House, so there is no company number. ${askWhy}`,
        expected: true,
        emptyText: 'Add your charity number',
      }
    case 'registered_charity':
      return {
        label: 'Charity number',
        hint: `If you are also a company limited by guarantee you can add that number too. ${askWhy}`,
        expected: true,
        emptyText: 'Add your charity number',
      }
    case 'cic_guarantee':
    case 'cic_shares':
    case 'ltd_guarantee':
    case 'ltd_shares':
    case 'llp':
      return {
        label: 'Company number',
        hint: `Your 8 digit Companies House number. ${askWhy}`,
        expected: true,
        emptyText: 'Add your company number',
      }
    case 'cooperative':
      return {
        label: 'Registered number',
        hint: `Your FCA mutuals register number, or Companies House if you are registered there. ${askWhy}`,
        expected: true,
        emptyText: 'Add your registered number',
      }
    case 'unincorporated':
      return {
        label: 'Charity number',
        hint: `Only if you are registered with a charity regulator. Plenty of community groups are not, and that is fine. ${askWhy}`,
        expected: false,
        emptyText: 'Not registered with a charity regulator',
      }
    case 'sole_trader':
      return {
        label: 'Registered number',
        hint: 'Sole traders do not have one. Leave this blank.',
        expected: false,
        emptyText: 'Not applicable to sole traders',
      }
    case 'not_registered':
      return {
        label: 'Registered number',
        hint: 'You will have one once you register. Leave it blank for now.',
        expected: false,
        emptyText: 'Nothing to add yet',
      }
    default:
      return {
        label: 'Registered number',
        hint: `Charity, company or mutuals number, whichever you have. ${askWhy}`,
        expected: false,
        emptyText: 'Add it if you have one',
      }
  }
}
