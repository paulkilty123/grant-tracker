#!/usr/bin/env node
/**
 * CI check — flags rgb()/rgba()/hsl()/hsla() colour literals in .ts/.tsx that
 * are an exact shadow of an OLD hex value scripts/hex-token-map.ts already
 * resolved to a token (reusing that lookup, not a fresh reverse-parse of
 * tailwind.config.ts — see loadTokenLookup() below for why that distinction
 * matters). Companion to the no-restricted-syntax ESLint rule, which only
 * sees #hex — this is the same idea for functional notations, which can't be
 * caught by a plain AST/regex ESLint selector (see below).
 *
 * Why exact-match instead of "is this colour saturated": matching against
 * the known token registry, rather than a channel-spread heuristic, is what
 * keeps this from flooding on the ~90 legitimate neutral rgba(0,0,0,*)-style
 * shadow/overlay values already in the codebase — none of those match a
 * token's exact RGB, so they're silently ignored, without needing a
 * separate "is this neutral" judgement call. It also means a rule change
 * here can't be gamed by a slightly-off decorative colour; it only fires on
 * a literal duplicate of a colour you already have a name for.
 *
 * Why a script and not a custom ESLint rule: no-restricted-syntax can match
 * a string PATTERN, but "are these three numbers close to a value in this
 * lookup table" is arithmetic, not a static AST selector — it needs a real
 * rule module. This repo's .eslintrc.json is the legacy config format;
 * wiring in a local custom rule cleanly wants either a real local plugin
 * package or a move to flat config (eslint.config.js), both bigger than this
 * warrants right now. A plain script sidesteps that entirely.
 *
 * Usage: node scripts/check-functional-colors.mjs
 * Exit code 1 if any matches are found (wire into CI as a blocking check
 * alongside `tsc --noEmit` / `next lint`).
 */

import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

// Same exemptions as the no-restricted-syntax hex rule in .eslintrc.json —
// token-source/data files, and render contexts that can't consume CSS custom
// properties (email HTML, Satori-rendered OG image), so a token reference
// there would silently break rendering rather than fix anything.
const EXEMPT_FILES = new Set([
  'tailwind.config.ts',
  'src/components/builder/tokens.ts',
  'scripts/hex-token-map.ts',
])
const EXEMPT_PREFIXES = ['src/app/api/']
const EXEMPT_EXACT_EXTRA = ['src/app/opengraph-image.tsx']

function isExempt(relPath) {
  if (EXEMPT_FILES.has(relPath)) return true
  if (EXEMPT_EXACT_EXTRA.includes(relPath)) return true
  return EXEMPT_PREFIXES.some(p => relPath.startsWith(p))
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

// ---- Build the token RGB lookup from scripts/hex-token-map.ts ----
//
// Deliberately NOT parsed from tailwind.config.ts's current colour list.
// Some old-hex -> token rows in hex-token-map.ts are a REBRAND repaint, not
// a value-preserving rename (e.g. #173404, the old dark-forest-green, maps
// to `deep`, whose current value is #1D3C3E, a different hue entirely — see
// that row's "risk: HIGH — the repaint" note). tailwind.config.ts also still
// carries the old value under its legacy alias names (green-deep, forest)
// for the transition period, so a fresh reverse-lookup off the live config
// would suggest the wrong, pre-rebrand token. hex-token-map.ts's mapping
// already encodes the intended (possibly value-changing) destination.
function loadTokenLookup() {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/hex-token-map.ts'), 'utf8')

  function section(startMarker, endMarker) {
    const s = src.indexOf(startMarker)
    const e = endMarker ? src.indexOf(endMarker, s) : src.length
    return src.slice(s, e === -1 ? undefined : e)
  }

  const hexToTokens = new Map() // lowercase hex (no #) -> Set(tokenNames)
  function add(hex, token) {
    if (!hex || !token) return
    if (token.includes('RETIRED') || token.includes('/') || token === 'EXCLUDE-needs-triage') return
    let key = hex.replace('#', '').toLowerCase()
    if (key.length === 3) key = [...key].map(c => c + c).join('') // expand #abc -> #aabbcc so it matches rgb()'s always-6-digit output
    if (key.length !== 6) return
    if (!hexToTokens.has(key)) hexToTokens.set(key, new Set())
    hexToTokens.get(key).add(token)
  }

  // Value-keyed tiers: each row has `hex: '#X'` ... `token: 'Y'` nearby.
  for (const [start, end] of [
    ['export const DOC_MAPPING', 'export const POLYSEMOUS_VALUES'],
    ['export const DECIDED_MAPPING', 'export const ONE_OFFS'],
    ['export const NEAREST_TOKEN_MAPPING', 'export const THREE_DIGIT_MAPPING'],
    ['export const THREE_DIGIT_MAPPING', 'export const ORPHANS'],
  ]) {
    const body = section(start, end)
    const re = /hex:\s*'([^']+)'/g
    let m
    while ((m = re.exec(body))) {
      const windowStr = body.slice(m.index, m.index + 400)
      const tokenMatch = windowStr.match(/token:\s*'([^']+)'/)
      if (tokenMatch) add(m[1], tokenMatch[1])
    }
  }

  // Occurrence-keyed tier: each polysemous value's individual targets.
  const polyBody = section('export const POLYSEMOUS_VALUES', 'export const DECIDED_MAPPING')
  const valueBlocks = polyBody.split(/\{\s*\n\s*hex:/).slice(1)
  for (const block of valueBlocks) {
    const hexMatch = block.match(/^\s*'([^']+)'/)
    const hex = hexMatch[1]
    const occRe = /target: '([^']+)'/g
    let m
    while ((m = occRe.exec(block))) add(hex, m[1])
  }

  // hex-token-map.ts's own dual-named DOC_MAPPING rows resolve to the token
  // that's actually built (see that file's header note on gold-pale/
  // sky-pale/terra-pale never having been instantiated separately).
  add('#faece7', 'state-error-pale')
  add('#e6f1fb', 'state-info-pale')
  add('#faeeda', 'state-warning-pale')

  const result = new Map()
  for (const [hex, tokens] of hexToTokens) result.set(hex, [...tokens])
  return result
}

function toHex2(n) {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
}

// HSL (0-360, 0-100, 0-100) -> lowercase hex, no '#'
function hslToHex(h, s, l) {
  s /= 100; l /= 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return toHex2((r + m) * 255) + toHex2((g + m) * 255) + toHex2((b + m) * 255)
}

const FUNCTIONAL_COLOR_RE = /\b(rgba?|hsla?)\(([^)]*)\)/g

function findMatches(line, hexToTokens) {
  const results = []
  FUNCTIONAL_COLOR_RE.lastIndex = 0
  let m
  while ((m = FUNCTIONAL_COLOR_RE.exec(line))) {
    const [full, fn, argsRaw] = m
    const args = argsRaw.split(',').map(s => parseFloat(s.trim()))
    if (args.some(Number.isNaN)) continue
    let hex
    if (fn === 'rgb' || fn === 'rgba') {
      const [r, g, b] = args
      if (r > 255 || g > 255 || b > 255) continue // not an rgb() triple (e.g. a % form we don't parse)
      hex = toHex2(r) + toHex2(g) + toHex2(b)
    } else {
      const [h, s, l] = args
      hex = hslToHex(h, s, l)
    }
    const tokens = hexToTokens.get(hex)
    if (tokens) results.push({ raw: full, hex, tokens, index: m.index })
  }
  return results
}

function main() {
  const hexToTokens = loadTokenLookup()
  const files = walk(path.join(ROOT, 'src'), [])
    .map(f => path.relative(ROOT, f))
    .filter(f => !isExempt(f))

  const findings = []
  for (const relFile of files) {
    const lines = fs.readFileSync(path.join(ROOT, relFile), 'utf8').split('\n')
    lines.forEach((line, i) => {
      for (const match of findMatches(line, hexToTokens)) {
        findings.push({ file: relFile, line: i + 1, ...match })
      }
    })
  }

  if (findings.length === 0) {
    console.log('check-functional-colors: no raw shadows of known tokens found.')
    return 0
  }

  console.log(`check-functional-colors: ${findings.length} functional-notation colour(s) match a known design token exactly.\n`)
  for (const f of findings) {
    const suggestion = f.tokens.length === 1
      ? `var(--${f.tokens[0]})`
      : `var(--${f.tokens[0]})` + ` (also matches: ${f.tokens.slice(1).join(', ')})`
    console.log(`${f.file}:${f.line}  ${f.raw}  ->  this is #${f.hex} at some alpha, i.e. ${suggestion}`)
    console.log(`  suggest: color-mix(in srgb, ${suggestion.split(' ')[0]} <alpha%>, transparent)`)
  }
  console.log(`\n${findings.length} finding(s). These duplicate a value you already have a token name for — reference the token via color-mix() instead of the raw literal.`)
  return 1
}

process.exit(main())
