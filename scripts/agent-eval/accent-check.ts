// Accent-count render check (briefing/plan redesign §1, §5; amendment §3). The
// grammar allows AT MOST two lime accents per page: the single most important
// card and the adviser entrance. Lime is a 2px lime border (COLOR.lime /
// #8ECB3C). A page shows view(≤1) + one entrance(1) = 2 at runtime; the
// entrances are mutually exclusive (the rail on wide, the ask bar on narrow, the
// launcher elsewhere), so each carries exactly one accent and only one renders.
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

// Views: at most one accented card each.
const VIEWS = [
  { name: 'briefing', file: 'src/components/briefing/BriefingView.tsx' },
  { name: 'plan', file: 'src/components/briefing/PlanView.tsx' },
]
// Entrances: exactly one accent each (mutually exclusive at runtime — the ask
// bar / rail on the briefing, the launcher's lime ring on every other page).
const ENTRANCES = [
  'src/components/briefing/CompanionAskBar.tsx',
  'src/components/briefing/AdviserRail.tsx',
  'src/components/briefing/AdviserLauncher.tsx',
]

let fail = 0
for (const e of ENTRANCES) {
  const n = limeAccents(e)
  const ok = n === 1
  console.log(`${ok ? '✓' : '✗'} entrance ${e.split('/').pop()}: ${n} lime accent (expect 1)`)
  if (!ok) fail++
}
for (const v of VIEWS) {
  const n = limeAccents(v.file)
  const ok = n <= 1
  console.log(`${ok ? '✓' : '✗'} view ${v.name}: ${n} accented card(s) (max 1; + one entrance = ≤2 on screen)`)
  if (!ok) fail++
}

console.log(fail === 0 ? '\n✓ ACCENT DISCIPLINE HELD' : `\n✗ ${fail} accent violation(s)`)
process.exit(fail === 0 ? 0 : 1)
