// Turning a funder's HTML into the text that page actually shows.
//
// WHY THIS EXISTS
//
// Every reader in this repo did the same thing: delete <script> and <style>,
// then delete every tag with /<[^>]+>/g. That last step also deletes everything
// held INSIDE an attribute, and a large family of modern sites keeps its copy
// exactly there — a JSON blob on the element (tabs="[{...}]", cards="[{...}]",
// description="...") that the front end hydrates into the page.
//
// Bernard Sunley, 2026-08-28. bernardsunley.org/how-to-apply/ is 34,000
// characters of HTML and a full page to a human: grant levels, the £10,000 to
// £5m project range, the £10m income ceiling, three trustee meetings a year,
// and the whole exclusion list. Our reader returned 496 characters — the
// postal address, the phone number and the charity number, all from the footer.
//
// Nothing failed. HTTP 200, url_status ok, fetchedFromUrl true, the brief came
// back reading `"source": "live_fetch"`, and it was fluent, because a model
// handed an empty page fills the gap from its own knowledge. This is
// docs/lessons "a passing check is not the same as the thing being right" in
// its purest form: every signal we had was about the FETCH, and the fetch was
// fine. None of them was about the TEXT.
//
// A sweep of the 609 live rows found 28 pages reading under 1,500 characters
// from over 15,000 bytes of HTML. Seven are this exact pattern; four more hide
// their content in <script> JSON instead. See
// scripts/find-js-rendered-pages-2026-08-28.ts, which is the detector.
//
// WHAT THIS DOES NOT FIX
//
// The other seventeen. A page whose text really is a nav bar and a footer is
// not repaired by reading it harder — either the apply_url points at a thin
// homepage and should point deeper, or the content is inside an embedded form
// that is not in the HTML at all. Recovering hidden text and correcting a bad
// URL are different jobs and this module only does the first.

/**
 * Named entities worth decoding.
 *
 * `&pound;` is the one that matters and the reason this map exists. Every
 * reader in this repo decoded exactly four entities — nbsp, amp, lt, gt — so a
 * page writing its figures as `&pound;20,000` reached the amount extractor, the
 * MONEY test in this file, and the model itself with no £ in it at all. Found
 * 2026-08-29 on South Lanarkshire's renewable energy fund, whose two schemes
 * are split at &pound;20,000; a £ search over the page text returned nothing.
 */
const NAMED_ENTITIES: Record<string, string> = {
  pound: '£', euro: '€', cent: '¢', yen: '¥', dollar: '$',
  mdash: '—', ndash: '–', hellip: '…', middot: '·', bull: '•',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d',
  deg: '°', times: '×', frac12: '½', frac14: '¼', reg: '®', copy: '©',
}

/** Decode the entity forms that actually appear in funder markup. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]{1,10});/g, (whole, name: string) => {
      const named = NAMED_ENTITIES[name.toLowerCase()]
      if (named) return named
      // Leave anything unrecognised alone rather than eating it; the four
      // below are handled after this pass so double-encoding still resolves.
      return whole
    })
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')   // last: an entity may itself be double-encoded
}

function safeChar(code: number): string {
  return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
}

/** Flatten a fragment of HTML held inside JSON to readable text. */
function fragmentToText(s: string): string {
  return decodeEntities(
    s.replace(/<li[^>]*>/gi, '\n- ')
     .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
     .replace(/<br\s*\/?>/gi, '\n')
     .replace(/<[^>]+>/g, ' ')
  ).replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

// Strings worth keeping out of a JSON payload. A hydration blob is mostly
// machine noise — ids, class names, image filenames, hex colours, MIME types —
// and appending that to the page would trade one bad read for a noisier one.
const NOISE_KEYS = new Set([
  'id', 'ID', 'key', 'slug', 'name', 'filename', 'mime_type', 'type', 'icon',
  'class', 'className', 'style', 'sizes', 'width', 'height', 'target', 'rel',
  'src', 'srcset', 'href', 'url', 'link', 'image', 'thumbnail', 'alt',
  'date', 'modified', 'status', 'author', 'uploaded_to', 'filesize',
  // schema.org boilerplate: '@type' yields "WebPage", 'inLanguage' yields "en-US"
  '@type', '@context', '@id', '@graph', 'inLanguage', 'potentialAction',
])

// Attributes whose long values are never page copy. Checked by name so a
// stylesheet or a srcset cannot reach the prose test at all.
const NOISE_ATTRS = /^(style|class|srcset|sizes|src|href|data-src|data-srcset|integrity|nonce|content|navlinks|breadcrumbs|menu|on\w+)$/i

/** A money figure — the one shape worth keeping even when it is very short. */
const MONEY = /£\s?[\d,]/

/**
 * Is this string something the page says to a reader?
 *
 * MEASURED, NOT GUESSED. Two earlier versions of this test were wrong in
 * opposite directions and both looked fine on a character count.
 *
 * The first required 20+ characters and more than half letters. That threw away
 * "£25,000 and above" — Bernard Sunley's large-grant band, and precisely the
 * kind of fact the catalogue exists to hold.
 *
 * The second let any single plain word through. On the Wix sites (John James
 * Bristol, Charterpath) that recovered 2,500 characters of framework module
 * names — thunderbolt, siteMembers, componentsRegistry — and the row LOOKED
 * fixed, because the only thing being measured was how much text came back.
 * Junk in the prompt is worse than nothing: it costs tokens on every enrich and
 * it dilutes the real page.
 *
 * So the rule is: a money figure gets in on its own, and everything else has to
 * be a sentence. A framework identifier is never three words with spaces.
 */
function looksLikeCopy(s: string): boolean {
  if (s.length < 4 || s.length > 4000) return false
  if (!/[A-Za-z]/.test(s)) return false              // digits alone carry no claim
  if (/^https?:\/\//i.test(s)) return false
  if (/^[{[]/.test(s) || /"\s*:\s*"/.test(s)) return false   // raw JSON
  if (/^[\w./-]+\.(jpe?g|png|gif|svg|webp|pdf|css|js|woff2?)$/i.test(s)) return false
  if (/^[A-Za-z0-9+/=]{60,}$/.test(s)) return false  // base64
  if (/^#?[0-9a-f]{6,8}$/i.test(s)) return false     // hex colour
  if (/^\d+x\d+$/.test(s)) return false              // image dimensions
  if (/[{;]\s*[a-z-]+\s*:/.test(s) && /[};]/.test(s)) return false  // inline CSS
  if (/[.#][A-Za-z][\w-]*\s*[,{]/.test(s)) return false             // CSS selector list

  if (MONEY.test(s)) return true

  // Everything else must read as a sentence: three words or more. This is the
  // line that keeps thunderbolt/wixui/componentsLoader out, and it is the
  // reason the recovered text is worth putting in a prompt at all.
  const words = s.trim().split(/\s+/).filter(w => /[A-Za-z]/.test(w))
  if (words.length < 3) return false
  if (s.length < 15) return false
  // camelCase or snake_case in every word is a symbol table, not a sentence.
  const identifiers = words.filter(w => /[a-z][A-Z]/.test(w) || /_/.test(w)).length
  if (identifiers >= words.length / 2) return false

  return isEnglish(s)
}

// Function words. A sentence of English contains at least one; a tag list, a
// CMS item title, and a sentence of Maltese do not.
const STOPWORDS = new Set([
  'the', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'at', 'by', 'with', 'from',
  'a', 'an', 'is', 'are', 'be', 'been', 'was', 'were', 'not', 'no', 'can',
  'will', 'must', 'may', 'should', 'we', 'you', 'your', 'our', 'they', 'their',
  'this', 'that', 'these', 'those', 'if', 'up', 'all', 'any', 'as', 'it', 'who',
  'which', 'what', 'when', 'how', 'do', 'does', 'have', 'has', 'more', 'than',
  'per', 'each', 'between', 'under', 'over', 'about', 'into', 'out',
])

/**
 * Is this English?
 *
 * The EU research portal ships every UI string in 24 languages inside its page
 * data. Recovering them added 7,080 characters of "this page is not available
 * in your language" to one catalogue row — grammatical, three words or more,
 * and completely useless to a fundraiser or to the model reading the page.
 *
 * The catalogue is UK funders, so an English gate is safe, and a Welsh page
 * that also carries English (all of them do) keeps its English half.
 */
function isEnglish(s: string): boolean {
  const words = s.toLowerCase().match(/[a-z']+/g) ?? []
  return words.some(w => STOPWORDS.has(w))
}

/** Walk a parsed JSON payload and collect the human-readable strings in it. */
function collectStrings(node: unknown, out: string[], depth = 0): void {
  if (depth > 12 || out.length > 400) return
  if (typeof node === 'string') {
    const t = fragmentToText(node)
    if (looksLikeCopy(t)) out.push(t)
    return
  }
  if (Array.isArray(node)) {
    for (const v of node) collectStrings(v, out, depth + 1)
    return
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (NOISE_KEYS.has(k)) continue
      collectStrings(v, out, depth + 1)
    }
  }
}

function parseLoose(raw: string): unknown {
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch { return null }
}

/**
 * Copy held in long attribute values — the Bernard Sunley pattern.
 *
 * Two shapes, both live on that one site: a JSON blob the front end hydrates
 * (`tabs="[{...}]"`), and a plain HTML fragment passed as a prop
 * (`description="<p>What we fund</p><ul>..."`). The second is not JSON and an
 * earlier version parsed only the first, which lost the £10,000 to £5m project
 * range on the very page this module was written for.
 */
function harvestAttributes(html: string): string[] {
  const out: string[] = []
  // Both quote styles. A JSON blob has double quotes inside it, so a site
  // either entity-encodes them and uses ="..." (Bernard Sunley) or delimits
  // with apostrophes and uses ='...' (Vue, Alpine, Stimulus). Matching only the
  // first missed the second entirely, which a test caught and a character count
  // never would have.
  //
  // 120 chars is short enough to catch a single-paragraph `description` and
  // long enough that ordinary attributes (alt text, aria labels) do not reach it.
  const attrs = /\s([a-zA-Z_][\w-]*)=(?:"([^"]{120,})"|'([^']{120,})')/g
  for (const m of Array.from(html.matchAll(attrs))) {
    const attr = m[1]
    const rawValue = m[2] ?? m[3]
    if (NOISE_ATTRS.test(attr)) continue
    const decoded = decodeEntities(rawValue)
    const parsed = parseLoose(decoded)
    if (parsed) { collectStrings(parsed, out); continue }
    // Not JSON. An HTML fragment still counts; anything else is left alone.
    if (/<\/?[a-z][^>]*>/i.test(decoded)) {
      for (const line of fragmentToText(decoded).split('\n')) {
        const t = line.trim()
        if (looksLikeCopy(t)) out.push(t)
      }
    }
  }
  return out
}

/** Copy held in <script> JSON — Next.js payloads, ld+json, hydration state. */
function harvestScripts(html: string): string[] {
  const out: string[] = []
  const re = /<script[^>]*\btype="application\/(?:ld\+)?json"[^>]*>([\s\S]*?)<\/script>/gi
  for (const m of Array.from(html.matchAll(re))) {
    const parsed = parseLoose(m[1].trim())
    if (parsed) collectStrings(parsed, out)
  }
  const nextData = /<script[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i.exec(html)
  if (nextData) {
    const parsed = parseLoose(nextData[1].trim())
    if (parsed) collectStrings(parsed, out)
  }
  return out
}

/** The visible-text strip every reader here used to do on its own. */
function stripToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s{2,}/g, ' ').trim()
}

/**
 * Cap on recovered text, so a large hydration blob cannot swamp the page.
 *
 * 8,000 rather than 20,000: Bernard Sunley, the page this module was written
 * for, recovers about 2,500. A recovery several times that size has stopped
 * being the page's copy and started being its plumbing.
 */
const HIDDEN_CAP = 8000

/**
 * HTML to the text a reader of that page would see, including copy the markup
 * keeps in attributes or script JSON.
 *
 * Recovered text is appended under a labelled heading rather than spliced into
 * position: we know these strings belong to the page, but not where on it, and
 * inventing an order would let a quote be stitched across two unrelated
 * sections. Anything already present in the visible text is dropped, so a page
 * that strips cleanly comes back essentially unchanged.
 */
export function htmlToText(html: string): string {
  const visible = stripToText(html)

  const hidden = [...harvestAttributes(html), ...harvestScripts(html)]
  if (hidden.length === 0) return visible

  // Compare on a normalised form so whitespace differences do not defeat the
  // duplicate check — most of a hydration payload is the visible page.
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
  const seen = new Set<string>()
  const visibleNorm = norm(visible)

  // How much recovery this page is allowed.
  //
  // The stopword gate below catches most foreign UI chrome, but not all of it:
  // "Deze pagina is niet beschikbaar in het Nederlands" contains "is" and "in",
  // and chasing every language is not what this module is for. A budget does
  // the job the language test cannot. On a page that already reads fine,
  // recovered text is a supplement and is held to a quarter of the visible
  // page; on a page that reads as empty — the case this exists to fix — the
  // full budget applies, because there is nothing else to go on.
  //
  // Measured on the EU research portal: 3,017 characters of translated chrome
  // against 3,048 characters of visible page, cut to 762.
  const budgetCap = visible.length >= 1500
    ? Math.min(HIDDEN_CAP, Math.round(visible.length * 0.25))
    : HIDDEN_CAP

  const fresh: string[] = []
  let budget = budgetCap
  for (const s of hidden) {
    const n = norm(s)
    if (!n || seen.has(n)) continue
    seen.add(n)
    if (visibleNorm.includes(n)) continue
    if (n.length > budget) continue
    budget -= n.length
    fresh.push(s)
  }
  if (fresh.length === 0) return visible

  return visible
    + '\n\n--- Text held in the page markup (rendered by the site, not visible to a plain tag strip) ---\n'
    + fresh.join('\n')
}

/** True when a page's visible text is trivial next to its markup. */
export function readsAsEmpty(html: string, text: string): boolean {
  return html.length > 15000 && text.length < 1500
}
