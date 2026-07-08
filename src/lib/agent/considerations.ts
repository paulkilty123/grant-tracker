// Deterministic "moves" engine for the briefing page (redesign §2/§4).
//
// Every card the briefing accents is chosen and worded HERE, from tool data —
// no model prose reaches the page. Each move carries an adviser-voice sentence
// (a template over the numbers) and an action that either opens the Companion
// drawer with a prefilled prompt or deep-links into the app. The single
// lowest-rank move is the accented "your next move"; the rest are "also worth a
// look". House copy: sentence case, no em dashes, British English.

export type MoveKind =
  | 'deadline_pressure' | 'opportunity' | 'add_amounts' | 'unrestricted_track' | 'match_funding'

export interface MoveAction {
  label: string
  mode: 'drawer' | 'link'
  prompt?: string // drawer: prefilled Companion prompt
  href?: string   // link: deep-link
}

export interface Move {
  kind: MoveKind
  rank: number            // lower = more important; 0 is most urgent
  headline: string
  sentence: string        // adviser voice, deterministic template
  action: MoveAction
  secondary?: MoveAction
  /** amber = needs user action; lime accent is applied to the single top move
   *  by the renderer, never here. */
  tone?: 'amber' | 'plain'
  /** short hero-chip text (deadline_pressure only). */
  chip?: string
  meta?: Record<string, unknown>
}

// Stage-typical run-up a live application still needs. Deadline pressure fires
// when the days remaining fall inside this window (identified needs the most
// lead; a submitted bid needs none). Tunable — flagged in the brief.
export const STAGE_LEAD_DAYS: Record<string, number> = {
  identified: 21, applying: 10, submitted: 0,
}
const STAGE_WORD: Record<string, string> = {
  identified: 'identified', applying: 'applying', submitted: 'submitted',
}

const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`
const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((new Date(`${toIso.slice(0, 10)}T00:00:00Z`).getTime() - new Date(`${fromIso.slice(0, 10)}T00:00:00Z`).getTime()) / 86_400_000)
const monthName = (iso: string) => {
  const [y, m] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m) return 'your deadline'
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

export interface PipelineItemLite {
  pipeline_item_id: string
  grant_name: string
  stage: string
  amount_requested: number | null
  deadline: string | null
}

export interface ConsiderationsInput {
  asOf: string
  goalEndDate: string
  mixTarget: Record<string, number> | null
  arithmetic: { gap: number; inPipelineWeighted: number; target: number }
  pipelineItems: PipelineItemLite[]
  recentWin: boolean
}

// ── deadline_pressure (§4) ────────────────────────────────────────────────────
// Fires on a pipeline item whose FIXED deadline is inside its stage danger
// window. Rolling funds (no deadline) are excluded by construction. Nearest
// deadline ranks most urgent.
export function deadlinePressureMoves(input: ConsiderationsInput): Move[] {
  const out: Move[] = []
  for (const it of input.pipelineItems) {
    if (it.stage === 'declined' || it.stage === 'won' || !it.deadline) continue
    const lead = STAGE_LEAD_DAYS[it.stage] ?? 0
    const days = daysBetween(input.asOf, it.deadline)
    if (days > lead) continue // still outside the danger window
    const stageWord = STAGE_WORD[it.stage] ?? it.stage
    const valueClause = it.amount_requested ? ` It is worth ${gbp(it.amount_requested)}.` : ''
    const dateLabel = new Date(`${it.deadline.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    const sentence = days < 0
      ? `This closed ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago and is still open in your pipeline.${valueClause} Decide whether to push or let it go.`
      : `You are at the ${stageWord} stage with ${days} day${days === 1 ? '' : 's'} left, and the usual run up from here is about ${lead} days. This is tight.${valueClause}`
    out.push({
      kind: 'deadline_pressure',
      rank: 0 + Math.max(0, days), // nearest / most overdue first
      headline: days < 0 ? `${it.grant_name} has closed` : `${it.grant_name} closes in ${days} day${days === 1 ? '' : 's'}`,
      sentence,
      chip: days < 0 ? `${it.grant_name}: overdue` : `${it.grant_name}: ${days}d left`,
      tone: 'amber',
      action: { label: 'Plan the push', mode: 'drawer', prompt: `Help me get ${it.grant_name} submitted before ${dateLabel}. What is the fastest credible path from the ${stageWord} stage?` },
      secondary: { label: 'Let it go, tell me why', mode: 'drawer', prompt: `I want to drop ${it.grant_name} from the pipeline. The reason is: ` },
      meta: { pipeline_item_id: it.pipeline_item_id },
    })
  }
  return out.sort((a, b) => a.rank - b.rank)
}

// ── the full ranked move set ──────────────────────────────────────────────────
export function buildConsiderations(input: ConsiderationsInput): Move[] {
  const moves: Move[] = [...deadlinePressureMoves(input)]

  // add_amounts — the gap arithmetic is silently wrong while items lack amounts.
  const missing = input.pipelineItems.filter(i => i.stage !== 'declined' && i.amount_requested == null).length
  if (missing > 0) {
    moves.push({
      kind: 'add_amounts', rank: 400, tone: 'amber',
      headline: `Add amounts to ${missing} pipeline item${missing === 1 ? '' : 's'}`,
      sentence: `Your gap leaves out ${missing} pipeline item${missing === 1 ? '' : 's'} with no amount set, so the real number is better or worse than it looks. Two minutes fixes it.`,
      action: { label: 'Add amounts', mode: 'link', href: '/dashboard/pipeline' },
    })
  }

  // unrestricted_track — the hardest, slowest slice; start it early.
  const unrestricted = input.mixTarget?.unrestricted ?? 0
  const early = input.arithmetic.inPipelineWeighted < input.arithmetic.target * 0.25
  if (unrestricted >= 30 && early) {
    moves.push({
      kind: 'unrestricted_track', rank: 200,
      headline: 'Start the unrestricted track',
      sentence: `Unrestricted is your biggest and hardest slice to win, and the slowest to land. Starting it now is what makes ${monthName(input.goalEndDate)} realistic.`,
      action: { label: 'Where do we start?', mode: 'drawer', prompt: `Where do we start on unrestricted funding? It is our biggest slice and I am not sure who backs core costs for an organisation like ours.` },
    })
  }

  // match_funding — leverage a recent win.
  if (input.recentWin) {
    moves.push({
      kind: 'match_funding', rank: 300,
      headline: 'Turn your win into match funding',
      sentence: `A recent win is leverage. Other funders match against money already secured, so naming that award can expand what a project delivers.`,
      action: { label: 'How do I use it?', mode: 'drawer', prompt: `How do I use our recent win to unlock match funding?` },
    })
  }

  return moves.sort((a, b) => a.rank - b.rank)
}

/** The single most urgent deadline, for the hero chip (null when none fires). */
export function topDeadlineChip(input: ConsiderationsInput): string | null {
  return deadlinePressureMoves(input)[0]?.chip ?? null
}
