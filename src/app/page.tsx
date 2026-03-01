import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import Logo from '@/components/Logo'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-cream">

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 bg-cream/90 backdrop-blur-sm border-b border-warm">
        <div className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
          <div className="flex items-center gap-6">
            <a href="#" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <Logo variant="dark" size="sm" />
            </a>
            <div className="hidden sm:flex items-center gap-1">
              {[
                { label: 'Features', href: '#features' },
                { label: 'Compare', href: '#compare' },
                { label: 'About', href: '#about' },
              ].map(link => (
                <a key={link.href} href={link.href}
                  className="text-sm text-mid hover:text-forest font-medium px-3 py-1.5 rounded-lg hover:bg-sage/10 transition-all">
                  {link.label}
                </a>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/auth/login" className="btn-outline btn-sm">Sign in</Link>
            <Link href="/auth/signup" className="btn-gold btn-sm">Get started free →</Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-sage/10 text-sage text-xs font-semibold px-4 py-1.5 rounded-full mb-7">
          🇬🇧 For charities, community groups, social enterprises, impact founders &amp; underserved ventures · Free to get started
        </div>
        <h1 className="font-display font-bold leading-[1.15] mb-6 max-w-4xl mx-auto">
          <span className="block text-5xl sm:text-6xl text-forest">Find and track grants matched to your mission</span>
          <span className="block text-3xl sm:text-[2.75rem] text-gold mt-4">Built for charities, community groups,</span>
          <span className="block text-3xl sm:text-[2.75rem] text-gold">social enterprises and impact founders</span>
        </h1>
        <p className="text-mid text-xl max-w-2xl mx-auto mb-4 leading-relaxed">
          800+ UK funding opportunities, AI matching that learns from your feedback, and a full application pipeline — all in one place.
        </p>
        <p className="text-sm text-mid/70 mb-10">
          Other tools charge <span className="line-through">£150–£1,000+/year</span> for less. Grant Tracker starts free.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link href="/auth/signup" className="btn-primary px-10 py-3.5 text-base font-semibold">
            Start for free →
          </Link>
          <Link href="/auth/login" className="text-sm text-mid hover:text-charcoal font-medium transition-colors">
            Already have an account? Sign in
          </Link>
        </div>
        <p className="text-xs text-light mt-5">Free forever for grant search · No credit card required · Set up in 2 minutes · 🔒 Your data is never shared</p>
      </section>

      {/* ── Differentiator strip ── */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: '🆓', stat: 'Free', label: 'to search 800+ grants' },
            { icon: '🎯', stat: 'AI Match', label: 'learns from your feedback' },
            { icon: '📋', stat: 'Pipeline', label: 'tracks every application' },
            { icon: '💷', stat: '£19/mo', label: 'for the full toolkit' },
          ].map(item => (
            <div key={item.stat} className="bg-white rounded-xl p-4 shadow-card text-center border border-warm">
              <div className="text-2xl mb-1">{item.icon}</div>
              <p className="font-display text-xl font-bold text-forest">{item.stat}</p>
              <p className="text-xs text-mid mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Feature 1: Grant Search ── */}
      <section id="features" className="max-w-6xl mx-auto px-6 pb-24 scroll-mt-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-sage/10 text-sage text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
              ✦ Feature 1
            </div>
            <h2 className="font-display text-3xl font-bold text-forest mb-4">
              800+ UK funding opportunities,<br />ranked by AI to your mission
            </h2>
            <p className="text-mid leading-relaxed mb-6">
              Search grants, competitions, social loans and matched crowdfunding — not just the obvious sources, but the specialist and hyper-local funders too. AI Search ranks every result by how well it fits your mission, income band and eligibility. Not keyword guesswork.
            </p>
            <ul className="space-y-3">
              {[
                { icon: '✦', text: 'AI match scores with a breakdown — sector, eligibility, geography, size, and mission fit' },
                { icon: '🎯', text: 'Thumbs up or down on any result trains future rankings to your preferences' },
                { icon: '📍', text: 'Filter by grants, competitions 🏆, social loans 🔄, or crowdfund match 🤝' },
                { icon: '🆕', text: 'Freshness filter puts the most recently verified opportunities at the top' },
              ].map(item => (
                <li key={item.text} className="flex items-start gap-3 text-sm text-mid">
                  <span className="text-sage mt-0.5 flex-shrink-0">{item.icon}</span>
                  {item.text}
                </li>
              ))}
            </ul>
          </div>
          {/* Mock UI: Grant Search */}
          <div className="bg-white rounded-2xl shadow-card-lg p-5 border border-warm">
            {/* Search bar */}
            <div className="flex gap-2 mb-4">
              <div className="flex-1 flex items-center gap-2 border border-warm rounded-lg px-3 py-2 bg-cream/50">
                <span className="text-light text-sm">🔍</span>
                <span className="text-sm text-light">youth mental health Manchester</span>
              </div>
              <div className="bg-forest text-white text-xs font-semibold px-3 py-2 rounded-lg whitespace-nowrap">✦ AI Search</div>
            </div>
            {/* Filter pills */}
            <div className="flex gap-1.5 mb-4 flex-wrap">
              {['All', '📍 Local', '🏆 Competition', 'Trust & Foundation', '🆕 New this week 23'].map((f, i) => (
                <span key={f} className={`px-2.5 py-1 rounded-full text-[10px] font-medium border ${i === 0 ? 'bg-forest text-white border-forest' : i === 4 ? 'bg-green-600 text-white border-green-600' : 'border-warm text-mid'}`}>{f}</span>
              ))}
            </div>
            {/* Grant cards */}
            <div className="space-y-2.5">
              {[
                { funder: 'National Lottery Community Fund', title: 'Awards for All England', amount: '£300–£10,000', score: 94, reason: 'Matches youth work in Manchester, rolling deadline' },
                { funder: 'BBC Children in Need', title: 'Small Grants Programme', amount: 'Up to £10,000', score: 87, reason: 'Strong fit for mental health support for under-18s' },
                { funder: 'Paul Hamlyn Foundation', title: 'Youth Fund', amount: '£10k–£60k', score: 78, reason: 'Funds youth arts and wellbeing, open to Manchester orgs' },
              ].map(g => (
                <div key={g.title} className="border border-warm rounded-xl p-3 bg-white hover:border-mint transition-all">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-mid font-semibold">{g.funder}</p>
                      <p className="text-xs font-bold text-forest leading-tight">{g.title}</p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="text-[10px] bg-sage/10 text-sage px-2 py-0.5 rounded-full font-medium">✦ {g.score}% match</span>
                        <span className="text-[10px] text-mid">{g.reason}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-bold text-gold">{g.amount}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-center text-light mt-3">Showing 3 of 24 AI-matched results · ranked by match score</p>
          </div>
        </div>
      </section>

      {/* ── Feature 2: Advanced Search ── */}
      <section className="bg-forest rounded-3xl max-w-6xl mx-auto px-8 py-16 mb-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Mock UI: Advanced Search */}
          <div className="bg-white/10 rounded-2xl p-5 border border-white/20">
            <p className="text-xs text-mint/70 font-semibold uppercase tracking-wider mb-3">🔬 Live Search · Live results</p>
            {/* Sector pills */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {['🧠 Mental Health', '🧒 Youth', '📚 Education & Training', '🏘 Community', '♿ Disability'].map((s, i) => (
                <span key={s} className={`px-2 py-1 rounded-full text-[10px] font-medium border ${i < 2 ? 'bg-indigo-500 border-indigo-400 text-white' : 'border-white/20 text-white/60'}`}>{s}</span>
              ))}
            </div>
            {/* Result cards */}
            <div className="space-y-2.5">
              {[
                { title: 'Lewisham Community Mental Health Fund', funder: 'London Borough of Lewisham', amount: 'Up to £8,000', tag: '📍 Hyper-local' },
                { title: 'SE London ICB Commissioning Round', funder: "Guy's & St Thomas' NHS Foundation", amount: '£15k–£50k', tag: '🏥 NHS' },
                { title: 'Young Minds Matter Grant', funder: 'Comic Relief, open round', amount: '£5k–£25k', tag: '🆕 New round' },
              ].map(r => (
                <div key={r.title} className="bg-white/10 rounded-xl p-3 border border-white/10">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[9px] font-semibold text-indigo-300 bg-indigo-500/20 px-1.5 py-0.5 rounded-full">{r.tag}</span>
                      <p className="text-xs font-bold text-white mt-1 leading-tight">{r.title}</p>
                      <p className="text-[10px] text-mint/60 mt-0.5">{r.funder}</p>
                    </div>
                    <p className="text-xs font-bold text-gold-light flex-shrink-0">{r.amount}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-mint/50 mt-3 text-center">Results researched live, not from a static database</p>
          </div>

          <div>
            <div className="inline-flex items-center gap-2 bg-white/10 text-mint text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
              🔬 Feature 2 · Live Search (Pro)
            </div>
            <h2 className="font-display text-3xl font-bold text-white mb-4">
              Finds local funders other tools completely miss
            </h2>
            <p className="text-mint/80 leading-relaxed mb-6">
              Live Search uses AI to scan council websites, NHS commissioning pages, community foundation portals and specialist funders in real time. Not a database. Not last year&apos;s results.
            </p>
            <ul className="space-y-3">
              {[
                { text: 'Borough-level programmes most national databases never index' },
                { text: 'NHS ICB commissioning and local authority grants by area' },
                { text: 'Sector filters (mental health, youth, disability, housing, and more)' },
                { text: 'Only returns grants not already in the curated database' },
              ].map(item => (
                <li key={item.text} className="flex items-start gap-3 text-sm text-mint/80">
                  <span className="text-mint mt-0.5 flex-shrink-0">✓</span>
                  {item.text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Feature 3: Personalisation ── */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-600 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
              🎯 Feature 3 · Personalisation
            </div>
            <h2 className="font-display text-3xl font-bold text-forest mb-4">
              Results that get sharper<br />every time you use it
            </h2>
            <p className="text-mid leading-relaxed mb-6">
              Grant Tracker learns what matters to you. Complete your profile and every result gets an AI match score. Rate results with a thumbs up or down and the system adjusts — boosting funding types and sectors you respond to, and downranking the ones that don&apos;t fit.
            </p>
            <ul className="space-y-3">
              {[
                { icon: '🧠', text: 'Profile-based matching across 5 dimensions: sector, eligibility, geography, size and mission' },
                { icon: '👍', text: 'Feedback-pattern learning — liked grants boost similar results, dislikes suppress them' },
                { icon: '📊', text: 'Tap any match score to see a breakdown of exactly how it was calculated' },
                { icon: '🔔', text: 'Profile completeness indicator shows you which fields will improve your matches most' },
              ].map(item => (
                <li key={item.text} className="flex items-start gap-3 text-sm text-mid">
                  <span className="mt-0.5 flex-shrink-0">{item.icon}</span>
                  {item.text}
                </li>
              ))}
            </ul>
          </div>
          {/* Mock UI: Personalisation */}
          <div className="bg-white rounded-2xl shadow-card-lg p-5 border border-warm space-y-3">
            {/* Profile completeness banner */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-4">
              <div className="relative w-12 h-12 flex-shrink-0">
                <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#fde68a" strokeWidth="3.2" />
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f59e0b" strokeWidth="3.2"
                    strokeDasharray="60 40" strokeLinecap="round" />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-amber-700">60%</span>
              </div>
              <div>
                <p className="text-xs font-semibold text-amber-900">Match quality is partial</p>
                <p className="text-[10px] text-amber-700 leading-snug mt-0.5">Annual income, primary location missing from your profile</p>
                <a className="text-[10px] font-bold text-amber-600 underline mt-1 inline-block">Complete profile →</a>
              </div>
            </div>
            {/* Grant card with match breakdown */}
            {[
              { funder: 'Esmée Fairbairn Foundation', title: 'Main Grants Programme', score: 91, breakdown: [{ label: 'Mission', w: '90%' }, { label: 'Sector', w: '95%' }, { label: 'Eligibility', w: '85%' }, { label: 'Geography', w: '88%' }, { label: 'Size', w: '80%' }], liked: true },
              { funder: 'UnLtd', title: 'Award for Social Entrepreneurs', score: 84, breakdown: [], liked: false },
            ].map(g => (
              <div key={g.title} className="border border-warm rounded-xl p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="text-[10px] text-mid font-semibold">{g.funder}</p>
                    <p className="text-xs font-bold text-forest">{g.title}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-[10px] bg-sage/10 text-sage px-2 py-0.5 rounded-full font-bold">✦ {g.score}%</span>
                    <span className={`text-sm cursor-pointer ${g.liked ? 'text-emerald-500' : 'text-light hover:text-emerald-400'}`}>👍</span>
                    <span className="text-sm text-light hover:text-red-400 cursor-pointer">👎</span>
                  </div>
                </div>
                {g.breakdown.length > 0 && (
                  <div className="bg-cream rounded-lg p-2 space-y-1">
                    {g.breakdown.map(b => (
                      <div key={b.label} className="flex items-center gap-2">
                        <span className="text-[9px] text-mid w-14 flex-shrink-0">{b.label}</span>
                        <div className="flex-1 bg-warm rounded-full h-1.5">
                          <div className="h-1.5 bg-sage rounded-full" style={{ width: b.w }} />
                        </div>
                        <span className="text-[9px] text-sage font-bold w-6 text-right">{b.w}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <p className="text-[10px] text-center text-light">👍 on a result trains future rankings to your preferences</p>
          </div>
        </div>
      </section>

      {/* ── Feature 4: Pipeline ── */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-gold/10 text-gold text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
              📋 Feature 4 · Pipeline
            </div>
            <h2 className="font-display text-3xl font-bold text-forest mb-4">
              A pipeline that shows you exactly where every application stands
            </h2>
            <p className="text-mid leading-relaxed mb-6">
              Move grants from Identified → Researching → Applying → Submitted → Won with a simple drag-and-drop board. Each card holds your notes, contacts, deadlines and writing progress — everything in one place, nothing lost in a spreadsheet.
            </p>
            <ul className="space-y-3">
              {[
                { icon: '📊', text: 'Visual kanban board — see the full picture at a glance, not buried in a spreadsheet' },
                { icon: '✏️', text: 'Per-card writing tracker from first draft to final submission' },
                { icon: '📝', text: 'Notes, funder contacts, deadlines and grant URLs all on the card' },
                { icon: '💷', text: 'Total pipeline value so you always know what funding is in play' },
              ].map(item => (
                <li key={item.text} className="flex items-start gap-3 text-sm text-mid">
                  <span className="flex-shrink-0 mt-0.5">{item.icon}</span>
                  {item.text}
                </li>
              ))}
            </ul>
          </div>
          {/* Mock UI: Pipeline */}
          <div className="bg-white rounded-2xl shadow-card-lg p-5 border border-warm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-display text-sm font-bold text-forest">Funding Pipeline</p>
                <p className="text-xs text-mid">7 opportunities tracked</p>
              </div>
              <span className="text-xs bg-gold/10 text-gold font-bold px-3 py-1 rounded-full">£187,500 active</span>
            </div>
            <div className="grid grid-cols-6 gap-1.5 mb-2">
              {[
                { label: 'Identified', colour: 'border-blue-400 text-blue-600', cards: 2 },
                { label: 'Researching', colour: 'border-amber-400 text-amber-600', cards: 1 },
                { label: 'Applying', colour: 'border-purple-400 text-purple-600', cards: 2 },
                { label: 'Submitted', colour: 'border-sage text-sage', cards: 1 },
                { label: 'Won', colour: 'border-forest text-forest', cards: 1 },
                { label: 'Declined', colour: 'border-red-300 text-red-400', cards: 0 },
              ].map(col => (
                <div key={col.label} className="bg-warm/50 rounded-lg p-1.5 min-h-[80px]">
                  <p className={`text-[8px] font-bold uppercase tracking-wide pb-1 mb-1.5 border-b ${col.colour}`}>{col.label}</p>
                  <div className="space-y-1">
                    {Array.from({ length: col.cards }).map((_, i) => (
                      <div key={i} className="bg-white rounded p-1 shadow-sm border-l-2 border-sage">
                        <div className="h-1.5 bg-warm rounded mb-1 w-full" />
                        <div className="h-1 bg-gold/30 rounded w-2/3" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {/* One expanded card */}
            <div className="border border-indigo-100 rounded-xl p-3 mt-3 bg-indigo-50/40">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] text-mid font-semibold">Paul Hamlyn Foundation</p>
                  <p className="text-xs font-bold text-forest">Youth Fund 2025</p>
                  <p className="text-[10px] text-mid mt-0.5">⚠ Deadline: 15 Mar 2025</p>
                </div>
                <p className="text-sm font-bold text-gold">£30k</p>
              </div>
              <div className="mt-2">
                <div className="flex justify-between text-[9px] text-mid mb-0.5">
                  <span>✏️ First draft</span><span>50%</span>
                </div>
                <div className="h-1.5 bg-warm rounded-full overflow-hidden">
                  <div className="h-full bg-sage rounded-full w-1/2" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature 4: Deadlines ── */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="bg-red-50 border border-red-100 rounded-3xl p-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            {/* Mock: Deadline alerts */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-4">⏰ Deadline Alerts</p>
              {[
                { name: 'Youth Fund', funder: 'Paul Hamlyn Foundation', days: 3, amount: '£30,000', urgent: true },
                { name: 'Local Connections Fund', funder: 'Barclays', days: 12, amount: '£5,000', urgent: false },
                { name: 'Awards for All', funder: 'National Lottery', days: 28, amount: '£10,000', urgent: false },
              ].map(item => (
                <div key={item.name} className={`bg-white rounded-xl p-4 border ${item.urgent ? 'border-red-300 shadow-sm shadow-red-100' : 'border-warm'} flex items-center justify-between gap-4`}>
                  <div>
                    <p className="text-xs font-semibold text-charcoal">{item.name}</p>
                    <p className="text-[10px] text-mid">{item.funder}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xs font-bold ${item.urgent ? 'text-red-500' : 'text-mid'}`}>
                      {item.urgent ? `⚠ ${item.days} days left` : `${item.days} days`}
                    </p>
                    <p className="text-[10px] text-gold font-semibold">{item.amount}</p>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div className="inline-flex items-center gap-2 bg-red-100 text-red-500 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
                ⏰ Feature 5 · Dashboard &amp; Alerts
              </div>
              <h2 className="font-display text-3xl font-bold text-forest mb-4">
                A dashboard that tells you what needs attention today
              </h2>
              <p className="text-sm text-mid leading-relaxed mb-4">
                Your dashboard shows you what matters right now — new grants added this week, upcoming deadlines ranked by urgency, and a snapshot of your full pipeline. Anything within 14 days gets flagged. Email alerts notify you when new funding matches your profile, so you never find out too late.
              </p>
              <ul className="space-y-2 mb-4">
                {[
                  { icon: '🆕', text: '"New This Week" highlights fresh opportunities the moment they appear' },
                  { icon: '⚠', text: 'Urgency flags surface grants closing within 14 days before it\'s too late' },
                  { icon: '📧', text: 'Email alerts when new matches appear for your profile — weekly digest or instant' },
                  { icon: '📋', text: 'Pipeline snapshot shows your full funding picture without opening a single card' },
                ].map(item => (
                  <li key={item.text} className="flex items-start gap-2.5 text-sm text-mid">
                    <span className="flex-shrink-0 mt-0.5">{item.icon}</span>
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Comparison ── */}
      <section id="compare" className="max-w-6xl mx-auto px-6 pb-24 scroll-mt-20">
        <div className="text-center mb-10">
          <h2 className="font-display text-3xl font-bold text-forest mb-3">Not just cheaper. Dramatically better.</h2>
          <p className="text-mid max-w-xl mx-auto">UK grant databases have barely changed in a decade. Grant Tracker was built from scratch for how charities, social enterprises and impact founders actually work.</p>
        </div>
        <div className="bg-white rounded-2xl shadow-card border border-warm overflow-hidden">
          <div className="grid grid-cols-3 text-sm">
            {/* Header */}
            <div className="p-4 bg-warm/40 border-b border-r border-warm">
              <p className="font-semibold text-charcoal text-xs uppercase tracking-wider">Feature</p>
            </div>
            <div className="p-4 bg-warm/40 border-b border-r border-warm text-center">
              <p className="font-semibold text-mid text-xs uppercase tracking-wider">Traditional tools</p>
              <p className="text-[10px] text-light mt-0.5">£150–£1,000+/year</p>
            </div>
            <div className="p-4 bg-forest/5 border-b border-warm text-center">
              <p className="font-bold text-forest text-xs uppercase tracking-wider">Grant Tracker</p>
              <p className="text-[10px] text-sage mt-0.5">Free · £19/mo for full access</p>
            </div>
            {/* Rows */}
            {[
              { feature: 'Funding database', them: '✓', us: '✓ 800+ grants, competitions, loans & crowdfund match' },
              { feature: 'AI-powered matching', them: '✗ No', us: '✓ Scores every result across 5 dimensions' },
              { feature: 'Personalisation & feedback learning', them: '✗ No', us: '✓ Ratings train results to your preferences' },
              { feature: 'Live web research', them: '✗ Static database', us: '✓ Live Search finds live & hyper-local results' },
              { feature: 'Dashboard & deadline alerts', them: '± Basic', us: '✓ Urgency flags + email alerts on new matches' },
              { feature: 'Application pipeline', them: '✗ Separate tool needed', us: '✓ Built in, drag and drop kanban' },
              { feature: 'Writing progress tracking', them: '✗', us: '✓ Per-card stage-by-stage progress tracker' },
              { feature: 'Free tier', them: '✗ Fully paywalled', us: '✓ Search 800+ grants free forever' },
            ].map((row, i) => (
              <div key={row.feature} className={`contents`}>
                <div className={`p-3.5 border-b border-r border-warm ${i % 2 === 0 ? '' : 'bg-warm/20'}`}>
                  <p className="text-sm text-charcoal font-medium">{row.feature}</p>
                </div>
                <div className={`p-3.5 border-b border-r border-warm text-center ${i % 2 === 0 ? '' : 'bg-warm/20'}`}>
                  <p className={`text-sm ${row.them.startsWith('✗') ? 'text-red-400' : row.them.startsWith('±') ? 'text-amber-500' : 'text-mid'}`}>{row.them}</p>
                </div>
                <div className={`p-3.5 border-b border-warm text-center ${i % 2 === 0 ? 'bg-forest/[0.02]' : 'bg-forest/[0.04]'}`}>
                  <p className="text-sm text-forest font-medium">{row.us}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Who it's for ── */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="text-center mb-10">
          <h2 className="font-display text-3xl font-bold text-forest mb-3">Built for the people doing the work</h2>
          <p className="text-mid max-w-md mx-auto">Small teams with big ambitions, not large development offices with specialist staff and six-figure budgets.</p>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { emoji: '🏠', label: 'Charities', desc: 'Manage multiple funders and applications without a dedicated grants manager.' },
            { emoji: '🌱', label: 'Community Groups', desc: 'Find local and national funding that fits your size, area, and cause — including hyper-local funders most platforms miss.' },
            { emoji: '⚡', label: 'Social Enterprises', desc: 'Search trusts, corporates, government programmes and social loan funds in one place.' },
            { emoji: '💡', label: 'Impact Founders', desc: 'Find grants, competitions and interest-free loans for founders with a social or environmental mission.' },
            { emoji: '🚀', label: 'Underserved Ventures', desc: 'Discover competitions, matched crowdfunding and community funds open to early-stage and grassroots ventures.' },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-xl p-5 shadow-card text-center border border-warm">
              <div className="text-3xl mb-3">{item.emoji}</div>
              <p className="font-display font-bold text-forest text-sm mb-1.5">{item.label}</p>
              <p className="text-xs text-mid leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Founder story ── */}
      <section id="about" className="max-w-6xl mx-auto px-6 pb-24 scroll-mt-20">
        <div className="bg-white rounded-3xl shadow-card border border-warm overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-5">

            {/* Left credential panel */}
            <div className="lg:col-span-2 bg-forest p-10 flex flex-col gap-8">
              {/* Logo / brand mark */}
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-sage/20 border-2 border-sage/30 flex items-center justify-center flex-shrink-0">
                  <span className="font-display text-xl font-bold text-white">GT</span>
                </div>
                <div>
                  <p className="font-display text-lg font-bold text-white">Grant Tracker</p>
                  <p className="text-mint/60 text-xs mt-0.5">Built by sector practitioners</p>
                </div>
              </div>

              {/* Credential stats */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { stat: '20', unit: 'yrs', label: 'sector experience' },
                  { stat: '3', unit: 'orgs', label: 'founded & run' },
                  { stat: 'Charity', unit: '+', label: 'social enterprise' },
                  { stat: '£M', unit: '+', label: 'funding secured' },
                ].map(item => (
                  <div key={item.label} className="bg-white/5 border border-white/10 rounded-xl p-3">
                    <p className="font-display text-xl font-bold text-white leading-none">
                      {item.stat}<span className="text-sage text-sm">{item.unit}</span>
                    </p>
                    <p className="text-mint/50 text-[10px] mt-1">{item.label}</p>
                  </div>
                ))}
              </div>

              {/* Sector tags */}
              <div>
                <p className="text-mint/40 text-[10px] font-semibold uppercase tracking-wider mb-2">Our background</p>
                <div className="flex flex-wrap gap-1.5">
                  {['Founders', 'Fundraisers', 'Charities', 'Social Enterprise', 'Community Sector'].map(tag => (
                    <span key={tag} className="text-[10px] font-medium text-mint/60 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Pull quote */}
              <div className="mt-auto pt-6 border-t border-white/10">
                <p className="text-mint/60 text-sm leading-relaxed italic">
                  "We built the tool the sector needed but never had."
                </p>
              </div>
            </div>

            {/* Right content */}
            <div className="lg:col-span-3 p-10">
              <h2 className="font-display text-3xl font-bold text-forest mb-6">
                Why Grant Tracker exists
              </h2>
              <blockquote className="font-display text-xl text-forest font-semibold leading-snug mb-6 border-l-4 border-sage pl-5">
                "Finding the right grant has always been harder than it should be. The tools that existed were too expensive, too generic, and built for organisations with a dedicated grants team — not for the people actually doing the work."
              </blockquote>
              <div className="space-y-4 text-mid text-sm leading-relaxed">
                <p>
                  Grant Tracker was built from direct experience of the sector. Across charities, social enterprises and community organisations, the grant search process is consistently one of the most time-consuming and frustrating parts of running a mission-driven organisation — sifting through outdated databases, missing hyper-local funders that never appear in national searches, and juggling applications across spreadsheets and inboxes.
                </p>
                <p>
                  The tools that did exist ranged from around £150 a year for basic directories to £1,000 or more for the larger platforms, and most required specialist training to extract any real value. Small charities, community groups and grassroots ventures were effectively priced out of the tools designed to help them.
                </p>
                <p>
                  Grant Tracker was built to change that. A platform that understands how UK funding actually works, that learns from how you engage with it, and that&apos;s simple enough for any founder, trustee or community organiser to use alongside everything else they&apos;re managing.
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="bg-sage/10 rounded-2xl p-8 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {[
            { stat: '800+', label: 'Grants, competitions, loans & crowdfund matches' },
            { stat: '120+', label: 'Sources crawled daily across the UK' },
            { stat: 'Free', label: 'to search — no credit card required' },
            { stat: 'Live', label: 'AI research and daily database refresh' },
          ].map(item => (
            <div key={item.stat}>
              <p className="font-display text-3xl sm:text-4xl font-bold text-forest">{item.stat}</p>
              <p className="text-sm text-mid mt-1">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Testimonial ── */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="max-w-2xl mx-auto text-center">
          <div className="bg-white rounded-2xl p-8 shadow-card border border-warm">
            <div className="flex justify-center gap-0.5 mb-5">
              {[...Array(5)].map((_, i) => (
                <span key={i} className="text-gold text-lg">★</span>
              ))}
            </div>
            <blockquote className="font-display text-lg text-forest font-semibold leading-snug mb-5">
              "Finally found a local NHS commissioning grant we had no idea existed. The Advanced Search is unlike anything I've used before."
            </blockquote>
            <div className="flex items-center justify-center gap-3">
              <div className="w-9 h-9 rounded-full bg-sage/20 flex items-center justify-center text-sage font-bold text-sm flex-shrink-0">
                S
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-forest">Sarah</p>
                <p className="text-xs text-mid">Director, community mental health charity, South London</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="max-w-6xl mx-auto px-6 pb-24 text-center">
        <div className="bg-white rounded-2xl shadow-card-lg p-12 border border-warm">
          <div className="inline-flex items-center gap-2 bg-sage/10 text-sage text-xs font-semibold px-4 py-1.5 rounded-full mb-6">
            🇬🇧 Trusted by UK charities, community groups, social enterprises &amp; impact founders
          </div>
          <h2 className="font-display text-4xl font-bold text-forest mb-3">Ready to find your next grant?</h2>
          <p className="text-mid mb-8 max-w-sm mx-auto">Set up your free account in under two minutes. Search 200+ grants immediately, no credit card needed.</p>
          <Link href="/auth/signup" className="btn-gold px-12 py-3.5 text-base font-semibold inline-block">
            Create free account →
          </Link>
          <p className="text-xs text-light mt-5">Free forever for grant search · Upgrade anytime · Cancel anytime</p>
          <p className="text-xs text-light/60 mt-2">🔒 Your data is never shared or sold. Stored securely, deleted on request.</p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-warm py-10 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-6">
            <div className="flex items-center gap-2.5">
              <Logo variant="dark" size="sm" />
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Link href="/auth/login" className="text-xs text-mid hover:text-charcoal transition-colors">Sign in</Link>
              <Link href="/auth/signup" className="text-xs text-mid hover:text-charcoal transition-colors">Sign up free</Link>
              <a href="#features" className="text-xs text-mid hover:text-charcoal transition-colors">Features</a>
              <a href="#pricing" className="text-xs text-mid hover:text-charcoal transition-colors">Pricing</a>
              <a href="mailto:hello@granttracker.co.uk" className="text-xs text-mid hover:text-charcoal transition-colors">Contact</a>
            </div>
          </div>
          <div className="border-t border-warm pt-5 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-light">© {new Date().getFullYear()} Grant Tracker · Supporting UK communities</p>
            <div className="flex items-center gap-5">
              <Link href="/privacy" className="text-xs text-light hover:text-mid transition-colors">Privacy Policy</Link>
              <Link href="/terms" className="text-xs text-light hover:text-mid transition-colors">Terms of Service</Link>
              <a href="mailto:hello@granttracker.co.uk" className="text-xs text-light hover:text-mid transition-colors">hello@granttracker.co.uk</a>
            </div>
          </div>
        </div>
      </footer>

    </div>
  )
}
