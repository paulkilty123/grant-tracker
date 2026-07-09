// Accent-count render check (briefing/plan redesign §1, §5). The design grammar
// allows AT MOST two lime accents per page: the single most important card and
// the Companion ask bar. Lime is a 2px lime border (COLOR.lime / #8ECB3C). This
// scans each page's component set and fails if a page carries more than one
// accented card (the ask bar, shared, is the second permitted accent).
//
//   npx tsx scripts/agent-eval/accent-check.ts
//
// Not a full DOM render, but the accent is expressed exactly one way in code
// (a 2px lime border), so counting it in source is a faithful, CI-able guard.

import { readFileSync } from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '../..')
const LIME = /2px solid\s+(?:#8ECB3C|\$\{COLOR\.lime\}|['"]?#8ECB3C['"]?)/g

function limeAccents(rel: string): number {
  try { return (readFileSync(path.join(root, rel), 'utf8').match(LIME) ?? []).length }
  catch { return 0 }
}

// A "page" = its view component(s) + the shared ask bar (CompanionAskBar).
const ASK_BAR = 'src/components/briefing/CompanionAskBar.tsx'
const PAGES: Array<{ name: string; view: string }> = [
  { name: 'briefing', view: 'src/components/briefing/BriefingView.tsx' },
  { name: 'plan', view: 'src/components/briefing/PlanView.tsx' },
]

let fail = 0
const askBarAccents = limeAccents(ASK_BAR)
console.log(`ask bar (${ASK_BAR}): ${askBarAccents} lime accent (expect 1)`)
if (askBarAccents !== 1) { console.log('  ✗ the ask bar must carry exactly one lime accent'); fail++ }

for (const p of PAGES) {
  const cardAccents = limeAccents(p.view)
  const total = cardAccents + askBarAccents
  const ok = cardAccents <= 1 && total <= 2
  console.log(`${ok ? '✓' : '✗'} ${p.name}: ${cardAccents} accented card(s) + ask bar = ${total} lime accents (max 2)`)
  if (!ok) fail++
}

console.log(fail === 0 ? '\n✓ ACCENT DISCIPLINE HELD' : `\n✗ ${fail} accent violation(s)`)
process.exit(fail === 0 ? 0 : 1)
