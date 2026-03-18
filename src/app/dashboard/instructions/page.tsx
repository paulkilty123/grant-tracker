import {
  User, Search, Globe, Sparkles, FolderKanban, CalendarClock,
  ThumbsUp, ThumbsDown, Link, Zap, CheckCircle, ArrowRight,
  Info, Trophy, Database, Clock,
} from 'lucide-react'

// ── Section card wrapper ──────────────────────────────────────────────────────
function Section({
  icon: Icon,
  colour,
  title,
  children,
}: {
  icon: React.ElementType
  colour: string
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="card mb-5">
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-warm">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${colour}`}>
          <Icon className="w-4.5 h-4.5" strokeWidth={2} />
        </div>
        <h2 className="font-display text-lg font-bold text-forest">{title}</h2>
      </div>
      <div className="text-mid leading-relaxed space-y-3 text-sm">
        {children}
      </div>
    </div>
  )
}

// ── Step row ─────────────────────────────────────────────────────────────────
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="w-6 h-6 rounded-full bg-forest text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
        {n}
      </div>
      <div>
        <p className="font-semibold text-charcoal mb-0.5">{title}</p>
        <p className="text-mid text-sm leading-relaxed">{children}</p>
      </div>
    </div>
  )
}

// ── Tip box ───────────────────────────────────────────────────────────────────
function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 mt-3 px-3.5 py-3 rounded-lg border border-amber-200 bg-amber-50">
      <Info className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" strokeWidth={2} />
      <p className="text-xs text-amber-800 leading-relaxed">{children}</p>
    </div>
  )
}

// ── Feature row ───────────────────────────────────────────────────────────────
function Feature({ icon: Icon, label, desc }: { icon: React.ElementType; label: string; desc: string }) {
  return (
    <div className="flex gap-3 py-2.5 border-b border-warm/60 last:border-0">
      <Icon className="w-4 h-4 text-forest flex-shrink-0 mt-0.5" strokeWidth={2} />
      <div>
        <p className="font-semibold text-charcoal text-sm">{label}</p>
        <p className="text-mid text-sm leading-relaxed">{desc}</p>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function InstructionsPage() {
  return (
    <div className="max-w-2xl">

      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-charcoal mb-2">How to use Grant Tracker</h1>
        <p className="text-mid text-sm leading-relaxed">
          Everything you need to find funding, track applications, and stay on top of deadlines — in one place.
        </p>
      </div>

      {/* Quick-start */}
      <Section icon={Zap} colour="bg-gold/15 text-gold" title="Quick start — 3 steps to your first matches">
        <div className="space-y-4">
          <Step n={1} title="Complete your profile">
            Go to <strong className="text-charcoal">Profile</strong> in the sidebar and fill in your organisation details — name, type, mission, themes, areas of work, location, and income band. The more you fill in, the better your matches will be.
          </Step>
          <Step n={2} title="Find your first grants">
            Head to <strong className="text-charcoal">Find Funding</strong> and open the <strong className="text-charcoal">My Matches</strong> tab. Grant Tracker will rank the entire database against your profile and show the most relevant opportunities at the top.
          </Step>
          <Step n={3} title="Add promising grants to your pipeline">
            On any grant card, hit <strong className="text-charcoal">+ Pipeline</strong> to start tracking it. Set a stage, add notes, and monitor your deadlines — all in the Funding Pipeline section.
          </Step>
        </div>
        <Tip>A complete profile unlocks smart match scores and eligibility filtering. Aim for a profile score of 80% or above.</Tip>
      </Section>

      {/* Profile */}
      <Section icon={User} colour="bg-sage/20 text-forest" title="Setting up your profile">
        <p>
          Your profile is the engine behind your grant matches. Navigate to <strong className="text-charcoal">Profile</strong> in the sidebar to complete it.
        </p>
        <div className="space-y-2 pt-1">
          <Feature icon={CheckCircle} label="Organisation name & type" desc="Charity, CIC, social enterprise, community group, or other — this determines which grants you're eligible for." />
          <Feature icon={CheckCircle} label="Mission statement" desc="A short description of what your organisation does. Used to match you to the most relevant grants." />
          <Feature icon={CheckCircle} label="Themes & areas of work" desc="The causes and topics your organisation focuses on — e.g. mental health, education, environment." />
          <Feature icon={CheckCircle} label="Location" desc="Your primary operating area. Used to find local and regional funding opportunities." />
          <Feature icon={CheckCircle} label="Annual income band" desc="Helps filter out grants with minimum or maximum income requirements." />
          <Feature icon={CheckCircle} label="Beneficiaries" desc="Who your organisation serves — e.g. young people, older adults, disabled people." />
        </div>
        <Tip>You can update your profile at any time. Changes take effect immediately across all search and match results.</Tip>
      </Section>

      {/* Find Funding */}
      <Section icon={Search} colour="bg-coral/15 text-coral" title="Find Funding — three ways to search">
        <p>The <strong className="text-charcoal">Find Funding</strong> page has three tabs, each suited to different situations.</p>

        {/* My Matches */}
        <div className="mt-2 p-4 rounded-lg border border-warm bg-warm/30">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="w-4 h-4 text-gold" strokeWidth={2} />
            <p className="font-semibold text-charcoal">My Matches</p>
          </div>
          <p className="text-sm text-mid leading-relaxed">
            The default view. Every grant in the database is scored and ranked against your profile. The score reflects how closely the grant's focus areas, eligibility criteria, location, and funding range match your organisation.
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-mid">
            <li className="flex gap-2"><ArrowRight className="w-3.5 h-3.5 text-forest flex-shrink-0 mt-0.5" /><span>Use the filters (sector, funding type, amount) to narrow results.</span></li>
            <li className="flex gap-2"><ArrowRight className="w-3.5 h-3.5 text-forest flex-shrink-0 mt-0.5" /><span>Click <strong className="text-charcoal">View details →</strong> on any card to see full eligibility criteria and apply.</span></li>
            <li className="flex gap-2"><ArrowRight className="w-3.5 h-3.5 text-forest flex-shrink-0 mt-0.5" /><span>Use thumbs up / thumbs down to train results — liked grants boost similar ones; disliked grants suppress them.</span></li>
          </ul>
        </div>

        {/* Search */}
        <div className="mt-3 p-4 rounded-lg border border-warm bg-warm/30">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-forest" strokeWidth={2} />
            <p className="font-semibold text-charcoal">Search (database)</p>
          </div>
          <p className="text-sm text-mid leading-relaxed">
            Keyword search across the full grant database. Type a topic, funder name, or location and hit <strong className="text-charcoal">Search</strong>. Results are ranked by relevance. Unlike My Matches, this is a free search — your profile is not applied.
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-mid">
            <li className="flex gap-2"><ArrowRight className="w-3.5 h-3.5 text-forest flex-shrink-0 mt-0.5" /><span>Results persist until you click <strong className="text-charcoal">Clear results</strong> or close the browser tab.</span></li>
            <li className="flex gap-2"><ArrowRight className="w-3.5 h-3.5 text-forest flex-shrink-0 mt-0.5" /><span>Combine keywords and location for more targeted results — e.g. "mental health London".</span></li>
          </ul>
        </div>

        {/* Live Search */}
        <div className="mt-3 p-4 rounded-lg border border-amber-200 bg-amber-50/50">
          <div className="flex items-center gap-2 mb-2">
            <Globe className="w-4 h-4 text-amber-600" strokeWidth={2} />
            <p className="font-semibold text-charcoal">Live Search <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 ml-1">Experimental</span></p>
          </div>
          <p className="text-sm text-mid leading-relaxed">
            Goes beyond the database — searches the web in real time to find grants that may not yet be in our database. Results are cached for 7 days so repeat searches are instant.
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-mid">
            <li className="flex gap-2"><ArrowRight className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" /><span>Be specific — "disability sport grants Manchester" works better than "grants for sport".</span></li>
            <li className="flex gap-2"><ArrowRight className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" /><span>Always verify deadlines and eligibility directly with the funder.</span></li>
            <li className="flex gap-2"><ArrowRight className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" /><span>If a link is broken, search the grant name on Google to find the correct page.</span></li>
            <li className="flex gap-2"><ArrowRight className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" /><span>Recent searches are saved — click any to restore results instantly.</span></li>
            <li className="flex gap-2"><ArrowRight className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" /><span>Limited to a weekly allowance — use alongside database search for best results.</span></li>
          </ul>
        </div>
      </Section>

      {/* Training results */}
      <Section icon={Sparkles} colour="bg-violet-50 text-violet-600" title="Training your results">
        <p>
          The thumbs up and thumbs down buttons on each grant card teach Grant Tracker what's relevant to you. Over time this improves the quality of your My Matches results.
        </p>
        <div className="space-y-2 pt-1">
          <Feature icon={ThumbsUp} label="Thumbs up — Good match" desc="Boosts grants in similar sectors and with similar characteristics higher in your results." />
          <Feature icon={ThumbsDown} label="Thumbs down — Not relevant" desc="Reduces the visibility of grants with similar characteristics. Dismissed grants are hidden from your results." />
        </div>
        <Tip>Your feedback is stored against your profile and applied every time you load My Matches. The more you rate, the more personalised your results become.</Tip>
      </Section>

      {/* Pipeline */}
      <Section icon={FolderKanban} colour="bg-teal-50 text-teal-600" title="Funding Pipeline">
        <p>
          The <strong className="text-charcoal">Funding Pipeline</strong> is your workspace for managing active grant applications. Track every opportunity from first discovery through to outcome.
        </p>
        <div className="space-y-2 pt-1">
          <Feature icon={CheckCircle} label="Adding grants" desc="Hit '+ Pipeline' on any grant card in Find Funding to add it instantly. Or use 'Add Opportunity' in the Pipeline to add a grant manually, or paste a URL to auto-fill from the web." />
          <Feature icon={CheckCircle} label="Pipeline stages" desc="Move grants through Identified → Applying → Submitted → Won / Rejected as your application progresses." />
          <Feature icon={CheckCircle} label="Notes & contacts" desc="Open any pipeline item to add notes, contacts, application progress, and the outcome date." />
          <Feature icon={CheckCircle} label="URL auto-fill" desc="In the Add Opportunity panel, paste any grant URL and click Auto-fill — it reads the page and extracts the grant name, funder, amount, and deadline automatically." />
        </div>
      </Section>

      {/* Deadlines */}
      <Section icon={CalendarClock} colour="bg-red-50 text-red-500" title="Deadlines">
        <p>
          The <strong className="text-charcoal">Deadlines</strong> page gives you a time-sorted view of all upcoming grant deadlines across your pipeline. Grants are colour-coded by urgency so you can see at a glance what needs attention.
        </p>
        <ul className="space-y-1.5 pt-1 text-sm text-mid">
          <li className="flex gap-2"><ArrowRight className="w-3.5 h-3.5 text-forest flex-shrink-0 mt-0.5" /><span>Deadlines are pulled automatically from grant data where available.</span></li>
          <li className="flex gap-2"><ArrowRight className="w-3.5 h-3.5 text-forest flex-shrink-0 mt-0.5" /><span>You can set or override a deadline on any pipeline item from the pipeline detail panel.</span></li>
          <li className="flex gap-2"><ArrowRight className="w-3.5 h-3.5 text-forest flex-shrink-0 mt-0.5" /><span>Rolling grants (no fixed deadline) are shown separately and never appear as urgent.</span></li>
        </ul>
      </Section>

      {/* Grant detail popup */}
      <Section icon={Info} colour="bg-blue-50 text-blue-500" title="Grant detail popup">
        <p>
          Click <strong className="text-charcoal">View details →</strong> on any grant card in the database search to open a full detail popup without leaving the page. The popup shows:
        </p>
        <ul className="space-y-1.5 pt-1 text-sm text-mid">
          <li className="flex gap-2"><ArrowRight className="w-3.5 h-3.5 text-forest flex-shrink-0 mt-0.5" /><span>Full description, eligibility criteria, and eligible organisation types.</span></li>
          <li className="flex gap-2"><ArrowRight className="w-3.5 h-3.5 text-forest flex-shrink-0 mt-0.5" /><span>Funding type badge (grant, accelerator, social investment, etc.).</span></li>
          <li className="flex gap-2"><ArrowRight className="w-3.5 h-3.5 text-forest flex-shrink-0 mt-0.5" /><span>Direct Apply and + Add to Pipeline buttons.</span></li>
          <li className="flex gap-2"><ArrowRight className="w-3.5 h-3.5 text-forest flex-shrink-0 mt-0.5" /><span>Close by clicking outside the panel or pressing Escape.</span></li>
        </ul>
      </Section>

      {/* Tips */}
      <Section icon={Clock} colour="bg-orange-50 text-orange-500" title="Tips for getting the most out of Grant Tracker">
        <ul className="space-y-3">
          {[
            { t: 'Complete your profile first', d: 'Even a partial profile dramatically improves match quality. Start with mission, themes, and location.' },
            { t: 'Use My Matches regularly', d: 'The database is updated continuously. Check back weekly for new grants that have been added.' },
            { t: 'Use Live Search for niche queries', d: "If you can't find what you're looking for in the database, Live Search often turns up specialist or emerging funders." },
            { t: 'Add everything to the pipeline', d: 'Even grants you\'re unsure about — the pipeline helps you track what you\'ve looked at and avoid duplicating research.' },
            { t: 'Train with thumbs', d: 'A few minutes rating results significantly improves future recommendations.' },
            { t: 'Check the Deadlines page weekly', d: 'It\'s easy to lose track of closing dates. Make it part of your weekly routine.' },
          ].map(({ t, d }) => (
            <li key={t} className="flex gap-3">
              <CheckCircle className="w-4 h-4 text-forest flex-shrink-0 mt-0.5" strokeWidth={2} />
              <div>
                <p className="font-semibold text-charcoal">{t}</p>
                <p className="text-mid text-sm leading-relaxed">{d}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {/* Footer */}
      <div className="mt-4 mb-10 text-center">
        <p className="text-xs text-light">
          Have a suggestion or found a bug?{' '}
          <a href="/dashboard/feedback" className="text-forest underline underline-offset-2">
            Leave feedback →
          </a>
        </p>
      </div>

    </div>
  )
}
