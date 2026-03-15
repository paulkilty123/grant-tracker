'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Menu, X, Check, Search, Calendar, TrendingUp, Activity, Clock, Mail, MessageSquare } from 'lucide-react'
import ContactForm from '@/components/ContactForm'
import RadioWaveIcon from '@/components/icons/RadioWaveIcon'

/* ─── helpers ─── */
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, delay },
})

const fadeInView = (delay = 0) => ({
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6, delay },
})

const navLinks = [
  { label: 'How it works', href: '#how' },
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'About', href: '#about' },
  { label: 'Contact', href: '#contact' },
]

const howSteps = [
  { num: '01', title: 'Set up your profile', desc: 'Tell us your legal structure, sector, stage, and location. Takes about 5 minutes.' },
  { num: '02', title: 'Search funding', desc: 'Search naturally across grants, accelerators, social investment, and more in one place.' },
  { num: '03', title: 'See your matches', desc: 'Results are ranked by how well they fit your profile — structure, sector, stage, and mission.' },
  { num: '04', title: 'Add to pipeline', desc: 'Track each application from first contact to submission on a simple visual board.' },
  { num: '05', title: 'Get alerts', desc: 'Weekly or instant email alerts when new funding matches your profile.' },
  { num: '06', title: 'Win Funding', desc: 'Celebrate success and continue building impact with new opportunities.', featured: true },
]

const fundingTypes = [
  { title: 'Grants & Awards', range: '£300 – £500k+', desc: 'National Lottery, trusts, foundations, Innovate UK, arts councils, and government programmes.' },
  { title: 'Accelerators & Programmes', range: 'Programme + grant', desc: 'Equity-free programmes with mentoring, workspace and networks. UnLtd, SSE, Foundervine and more.' },
  { title: 'Diversity-Targeted Funds', range: '£5k – £250k', desc: 'Women in Innovation, Black Seed, Foundervine, and more. Zero overlap with general grant databases.' },
  { title: 'Support Programmes', range: 'Capacity building', desc: 'Fellowships, mentoring, incubators and training — from Lloyds Bank Foundation to local CVS networks.' },
  { title: 'Social Investment', range: '£20k – £3m', desc: 'Big Issue Invest, Charity Bank, Resonance — know who funds what before you reach out.' },
  { title: 'Blended & Matched Funding', range: 'Selected programmes', desc: 'Part grant, part loan. SSE Match Trading and Power to Change — real listings, not theory.' },
]

const audiences = [
  { title: 'CICs', desc: 'Grants, accelerators, and social investment matched to your structure — no more results built for charities.' },
  { title: 'Charities & CIOs', desc: 'Go beyond trusts and foundations — pipeline tracking and alerts replace the spreadsheet.' },
  { title: 'Co-operatives & CBS', desc: 'Community finance, blended funding, and grants that fit your mutual structure.' },
  { title: 'Social Enterprises', desc: 'Ltd company with a mission? Soft matching surfaces opportunities even without CIC or charity status.' },
  { title: 'Impact Founders', desc: 'Grants, accelerators, and diversity funds matched to your stage, sector, and team.' },
  { title: 'Community Groups', desc: 'Local and national funding matched to your size, area, and cause.' },
]

const stats = [
  { value: '500+', label: 'Funding and support opportunities' },
  { value: '6', label: 'Funding types — grants, programmes, investment & more' },
  { value: '12', label: 'Impact sectors covered' },
  { value: 'Free', label: 'To start with, upgrade anytime' },
]

const plans = [
  {
    name: 'Free', price: '£0', period: 'forever',
    features: ['Browse full grant database', 'Filter by region & sector', 'Basic keyword search', 'Weekly email digest'],
    cta: 'Get Started', popular: false,
  },
  {
    name: '6 Months', price: '£65', period: '£10.83/month',
    features: ['Everything in Free', 'AI Live Search (3/week)', 'Match scoring & ranking', 'Deadline alerts', 'Priority support'],
    cta: 'Start 6-Month Plan', popular: true,
  },
  {
    name: '12 Months', price: '£115', period: '£9.58/month — save 12%',
    features: ['Everything in 6-Month', 'Best value per month', 'Annual grant calendar', 'Early access to new features'],
    cta: 'Start Annual Plan', popular: false,
  },
]

const testimonials = [
  {
    quote: "As a CIC we kept being told we weren't eligible for charity grants. Grant Tracker finally shows us what we can actually apply for — including accelerators and diversity funds we'd never heard of.",
    name: 'Marcus', role: 'Director, community tech CIC, Manchester', initials: 'M',
  },
  {
    quote: "We found three grants we didn't even know existed within our first search. One of them funded our entire summer programme.",
    name: 'Sarah R.', role: 'Youth charity, Lewisham', initials: 'SR',
  },
  {
    quote: "The AI search actually understands what we do. It's not just keyword matching — it found grants for community food growing we'd never have thought to check.",
    name: 'Jess P.', role: 'Community garden lead, Bristol', initials: 'JP',
  },
]

/* ─── Mockups ─── */
const SearchMockup = () => (
  <div className="bg-white border border-warm p-5">
    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-warm">
      <div className="flex gap-1.5">
        <div className="h-2.5 w-2.5 rounded-full bg-red-300/60" />
        <div className="h-2.5 w-2.5 rounded-full bg-gold/40" />
        <div className="h-2.5 w-2.5 rounded-full bg-sage/30" />
      </div>
      <span className="mx-auto text-xs text-mid">granttracker.co.uk/search</span>
    </div>
    <div className="flex items-center gap-2 border border-warm bg-cream/50 px-4 py-3">
      <Search size={16} className="text-mid" />
      <span className="text-sm text-mid">Community garden project in South London</span>
      <span className="ml-auto bg-forest px-3 py-1 text-xs font-medium text-white">Search</span>
    </div>
    <div className="mt-4 space-y-3">
      {[
        { org: 'London Community Foundation', name: 'Grow to Give — Community Growing Grants', match: 94, amount: 'Up to £8,000', tags: ['South London', 'Closes Apr 15'] },
        { org: 'National Lottery Community Fund', name: 'Small Grants for Green Spaces', match: 87, amount: '£1,000 – £10,000', tags: ['All UK', 'Rolling'] },
        { org: 'Southwark Council', name: 'Southwark Community Fund', match: 82, amount: 'Up to £5,000', tags: ['Southwark', 'Closes May 1'] },
      ].map((r) => (
        <div key={r.name} className="border border-warm bg-cream/30 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-charcoal">{r.name}</p>
              <p className="text-xs text-mid mt-0.5">{r.org}</p>
            </div>
            <span className="whitespace-nowrap text-sm font-semibold text-charcoal">{r.amount}</span>
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {r.tags.map((tag) => (
              <span key={tag} className="bg-warm px-2 py-0.5 text-[11px] text-mid">{tag}</span>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-warm">
              <div className="h-1.5 bg-forest" style={{ width: `${r.match}%` }} />
            </div>
            <span className="text-xs font-bold text-forest">{r.match}%</span>
          </div>
        </div>
      ))}
    </div>
  </div>
)

const PipelineMockup = () => (
  <div className="border border-warm bg-white p-6">
    <div className="flex items-center justify-between mb-1">
      <h3 className="text-sm font-semibold text-charcoal">Funding Pipeline</h3>
    </div>
    <div className="flex items-center gap-4 mb-5 text-xs text-mid">
      <span>7 opportunities tracked</span>
      <span className="bg-forest/10 px-2 py-0.5 text-sm font-bold text-forest">£187,500 active</span>
    </div>
    <div className="grid grid-cols-3 gap-2 text-[10px]">
      {[{ name: 'Identified', items: 2 }, { name: 'Applying', items: 1 }, { name: 'Submitted', items: 1 }].map((col) => (
        <div key={col.name}>
          <div className="mb-2 text-center font-medium text-mid uppercase tracking-wider">{col.name}</div>
          <div className="space-y-2">
            {Array.from({ length: col.items }).map((_, i) => (
              <div key={i} className="bg-warm/60 p-2.5">
                <div className="h-2 w-3/4 bg-charcoal/10" />
                <div className="mt-1.5 h-1.5 w-1/2 bg-charcoal/5" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
    <div className="mt-4 border border-forest/20 bg-forest/5 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-mid">Paul Hamlyn Foundation</p>
          <p className="text-sm font-semibold text-charcoal">Youth Fund 2025</p>
        </div>
        <span className="text-sm font-bold text-forest">£30k</span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <span className="text-[11px] text-red-500 font-medium">Deadline: 15 Mar 2025</span>
        <span className="text-[11px] text-mid">First draft 50%</span>
      </div>
    </div>
  </div>
)

const DashboardMockup = () => (
  <div className="border border-warm bg-white p-6">
    <div className="flex items-center justify-between mb-5">
      <h3 className="text-sm font-semibold text-charcoal">Dashboard</h3>
      <span className="text-[11px] text-mid">Last updated: just now</span>
    </div>
    <div className="grid grid-cols-3 gap-2 mb-4">
      {[
        { label: 'Pipeline value', value: '£187.5k', Icon: TrendingUp, accent: true },
        { label: 'Active', value: '7', Icon: Activity, accent: false },
        { label: 'Due this week', value: '2', Icon: Clock, accent: false },
      ].map((s) => (
        <div key={s.label} className={`p-3 border ${s.accent ? 'border-forest/20 bg-forest/5' : 'border-warm bg-cream/40'}`}>
          <s.Icon size={14} className={`${s.accent ? 'text-forest' : 'text-mid'} mb-1`} />
          <p className={`text-lg font-bold ${s.accent ? 'text-forest' : 'text-charcoal'}`}>{s.value}</p>
          <p className="text-[10px] text-mid">{s.label}</p>
        </div>
      ))}
    </div>
    <div className="mb-4">
      <p className="text-[11px] font-medium text-mid mb-1.5">Pipeline breakdown</p>
      <div className="flex h-2 w-full overflow-hidden">
        <div className="bg-forest/30 w-[35%]" /><div className="bg-forest/60 w-[30%]" />
        <div className="bg-forest w-[20%]" /><div className="bg-coral w-[15%]" />
      </div>
      <div className="flex justify-between mt-1 text-[9px] text-mid">
        <span>Identified</span><span>Applying</span><span>Submitted</span><span>Awarded</span>
      </div>
    </div>
    <div className="border border-warm bg-cream/40 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Calendar size={12} className="text-mid" />
        <p className="text-[11px] font-semibold text-charcoal">Upcoming deadlines</p>
      </div>
      <div className="space-y-2">
        {[{ name: 'Youth Fund 2025', org: 'Paul Hamlyn', days: 2, amount: '£30k' }, { name: 'Green Spaces Grant', org: 'National Lottery', days: 8, amount: '£10k' }].map((d) => (
          <div key={d.name} className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-charcoal">{d.name}</p>
              <p className="text-[10px] text-mid">{d.org}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-charcoal">{d.amount}</p>
              <p className={`text-[10px] font-medium ${d.days <= 3 ? 'text-red-500' : 'text-mid'}`}>{d.days}d left</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
)

/* ─── page ─── */
export default function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-cream">

      {/* NAVBAR */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="fixed top-0 left-0 right-0 z-50 bg-cream/95 backdrop-blur-sm border-b border-warm/60"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <a href="/" className="flex items-center gap-1">
            <RadioWaveIcon className="h-12 w-12 text-coral" />
            <span className="font-serif text-3xl text-charcoal">GrantTracker</span>
          </a>
          <div className="hidden items-center gap-5 lg:gap-8 md:flex">
            {navLinks.map((link) => (
              <a key={link.label} href={link.href} className="text-sm text-mid transition-colors hover:text-charcoal">{link.label}</a>
            ))}
          </div>
          <div className="hidden items-center gap-3 md:flex">
            <Link href="/auth/login" className="text-sm text-mid hover:text-charcoal transition-colors px-3 py-2">Sign in</Link>
            <Link href="/auth/signup" className="bg-coral text-white rounded px-5 py-2 text-sm font-medium hover:opacity-90 transition-colors">Get started free</Link>
          </div>
          <button className="md:hidden text-charcoal" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="border-t border-warm bg-cream px-6 pb-6 md:hidden"
          >
            <div className="flex flex-col gap-4 pt-4">
              {navLinks.map((link) => (
                <a key={link.label} href={link.href} className="text-sm text-mid" onClick={() => setMobileOpen(false)}>{link.label}</a>
              ))}
              <div className="flex flex-col gap-2 pt-2">
                <Link href="/auth/login" onClick={() => setMobileOpen(false)} className="text-center text-sm text-mid py-2 border border-warm">Sign in</Link>
                <Link href="/auth/signup" onClick={() => setMobileOpen(false)} className="bg-coral text-white rounded text-center text-sm font-medium py-2 hover:opacity-90 transition-colors">Get started free</Link>
              </div>
            </div>
          </motion.div>
        )}
      </motion.nav>

      {/* HERO */}
      <section className="relative pt-16">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-center px-6 py-16 md:py-24 min-h-[70vh] text-center">
          <motion.h1
            {...fadeUp(0.15)}
            className="font-serif text-5xl leading-[1.05] sm:text-6xl md:text-7xl lg:text-8xl"
          >
            <span className="relative inline-block">
              Fund
              <svg className="absolute -bottom-4 left-0 w-full h-6 text-coral/30 pointer-events-none" viewBox="0 0 200 20" preserveAspectRatio="none">
                <path d="M5 12 Q 50 4, 100 10 T 195 8" stroke="currentColor" strokeWidth="14" strokeLinecap="round" fill="none" />
              </svg>
            </span>
            {' '}your cause or venture.
          </motion.h1>
          <motion.p {...fadeUp(0.35)} className="mt-8 max-w-2xl text-mid leading-relaxed text-xl md:text-2xl">
            Find grants, accelerators, investment and support programmes — matched to you, managed in one place.
          </motion.p>
          <motion.div {...fadeUp(0.5)} className="mt-10 flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Link href="/auth/signup" className="bg-coral text-white rounded px-8 py-3 text-base font-semibold hover:opacity-90 transition-colors">Start for free</Link>
            <a href="#how" className="border border-coral/50 text-coral px-8 py-3 text-base font-semibold transition-colors hover:bg-coral/5">
              See how it works
            </a>
          </motion.div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="py-16 md:py-20">
        <div className="mx-auto max-w-5xl px-6">
          <motion.div {...fadeInView(0)} className="mb-16">
            <p className="text-sm font-semibold text-coral uppercase tracking-wider">How it works</p>
            <h2 className="mt-3 font-serif text-4xl md:text-5xl leading-tight max-w-lg">Set up once, search and track what matters.</h2>
          </motion.div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-warm">
            {howSteps.map((step, i) => (
              <motion.div key={step.title} {...fadeInView(i * 0.08)} className="bg-cream p-8">
                <span className={`font-serif text-coral ${step.featured ? 'text-6xl' : 'text-4xl'}`}>{step.num}</span>
                <h3 className={`mt-4 font-serif ${step.featured ? 'text-2xl md:text-3xl' : 'text-xl'}`}>{step.title}</h3>
                <p className="mt-3 text-sm text-mid leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FUNDING TYPES */}
      <section className="py-16 md:py-20 bg-[#121f2b]">
        <div className="mx-auto max-w-5xl px-6">
          <motion.div {...fadeInView(0)} className="mb-16">
            <p className="text-sm font-semibold text-coral uppercase tracking-wider">Funding Types</p>
            <h2 className="mt-3 font-serif text-4xl md:text-5xl leading-tight max-w-lg text-cream">Not just grants, the full picture.</h2>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-white/10">
            {fundingTypes.map((t, i) => (
              <motion.div key={t.title} {...fadeInView(i * 0.05)} className="bg-[#121f2b] p-8">
                <span className="text-xs font-semibold text-coral uppercase tracking-wider">{t.range}</span>
                <h3 className="mt-3 font-serif text-xl text-cream">{t.title}</h3>
                <p className="mt-3 text-sm text-cream/50 leading-relaxed">{t.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURE SECTIONS */}
      <div id="features">
        {/* Search & Match */}
        <section className="py-16 md:py-20">
          <div className="mx-auto grid max-w-5xl items-center gap-16 px-6 md:grid-cols-2">
            <motion.div {...fadeInView(0)}>
              <p className="text-sm font-semibold text-coral uppercase tracking-wider">Search & Match</p>
              <h2 className="mt-3 font-serif text-3xl leading-tight md:text-4xl">Search everything, see only what fits.</h2>
              <p className="mt-4 text-mid leading-relaxed">Tell us your structure and sector once. We filter out everything you're not eligible for before you even see results.</p>
              <ul className="mt-8 space-y-4">
                {['Profile-based filtering — your structure, stage and sector shape every result', 'Live Search — surfaces matching funding across all seven types in real time', 'Match scores ranked by structure, sector, geography, stage and mission'].map((b, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-charcoal">
                    <span className="mt-0.5 flex h-5 w-5 items-center justify-center bg-coral/10 text-coral text-xs font-bold shrink-0">✓</span>
                    <span className="leading-relaxed">{b}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
            <motion.div {...fadeInView(0.15)}><SearchMockup /></motion.div>
          </div>
        </section>

        {/* Pipeline & Alerts */}
        <section className="py-16 md:py-20 bg-warm/30">
          <div className="mx-auto grid max-w-5xl items-center gap-16 px-6 md:grid-cols-2 md:[direction:rtl]">
            <motion.div {...fadeInView(0)} className="md:[direction:ltr]">
              <p className="text-sm font-semibold text-coral uppercase tracking-wider">Pipeline & Alerts</p>
              <h2 className="mt-3 font-serif text-3xl leading-tight md:text-4xl">Track every application, never miss a deadline.</h2>
              <p className="mt-4 text-mid leading-relaxed">A drag-and-drop board keeps every application visible, from first contact to submission.</p>
              <ul className="mt-8 space-y-4">
                {['Visual board with pipeline values at a glance', 'Per-card writing tracker from first draft to final submission', 'Notes, funder contacts, deadlines and grant URLs all on the card', 'Email alerts and urgency flags for grants closing within 14 days'].map((b, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-charcoal">
                    <span className="mt-0.5 flex h-5 w-5 items-center justify-center bg-coral/10 text-coral text-xs font-bold shrink-0">✓</span>
                    <span className="leading-relaxed">{b}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
            <motion.div {...fadeInView(0.15)} className="md:[direction:ltr]"><PipelineMockup /></motion.div>
          </div>
        </section>

        {/* Dashboard */}
        <section className="py-16 md:py-20">
          <div className="mx-auto grid max-w-5xl items-center gap-16 px-6 md:grid-cols-2">
            <motion.div {...fadeInView(0)}>
              <p className="text-sm font-semibold text-coral uppercase tracking-wider">Dashboard</p>
              <h2 className="mt-3 font-serif text-3xl leading-tight md:text-4xl">Everything you need, at a glance.</h2>
              <p className="mt-4 text-mid leading-relaxed">A single view that pulls together your pipeline, deadlines, match quality and activity — so you always know where you stand.</p>
              <ul className="mt-8 space-y-4">
                {['Pipeline summary with total value and stage breakdown', 'Upcoming deadlines highlighted so nothing slips', 'Match quality score with tips to improve your profile', 'Recent activity feed tracking your latest actions'].map((b, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-charcoal">
                    <span className="mt-0.5 flex h-5 w-5 items-center justify-center bg-coral/10 text-coral text-xs font-bold shrink-0">✓</span>
                    <span className="leading-relaxed">{b}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
            <motion.div {...fadeInView(0.15)}><DashboardMockup /></motion.div>
          </div>
        </section>
      </div>

      {/* ABOUT / WHO IT'S FOR */}
      <section id="about" className="py-16 md:py-20">
        <div className="mx-auto max-w-5xl px-6">
          <motion.div {...fadeInView(0)} className="mb-16">
            <p className="text-sm font-semibold text-coral uppercase tracking-wider">Who it's for</p>
            <h2 className="mt-3 font-serif text-4xl md:text-5xl leading-tight max-w-lg">Built for the people doing the work.</h2>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-warm">
            {audiences.map((v, i) => (
              <motion.div key={v.title} {...fadeInView(i * 0.06)} className="bg-cream p-8">
                <h3 className="font-serif text-xl">{v.title}</h3>
                <p className="mt-3 text-sm text-mid leading-relaxed">{v.desc}</p>
              </motion.div>
            ))}
          </div>
          <motion.blockquote {...fadeInView(0)} className="mt-20 border-l-4 border-coral pl-8 py-2">
            <p className="text-xl text-charcoal leading-relaxed font-serif italic max-w-2xl">
              "Grant Tracker was born from first-hand frustration — hours lost to scattered spreadsheets and funding opportunities that slipped through the cracks. We built the tool we wished existed: one place to find, track and win grants."
            </p>
          </motion.blockquote>
        </div>
      </section>

      {/* STATS */}
      <section className="py-12 md:py-16 bg-coral">
        <div className="mx-auto max-w-5xl px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-6">
            {stats.map((s, i) => (
              <motion.div key={s.label} {...fadeInView(i * 0.1)} className="text-center">
                <p className="font-serif text-4xl md:text-5xl text-white">{s.value}</p>
                <p className="mt-2 text-sm text-white/70 leading-relaxed">{s.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="py-16 md:py-20">
        <div className="mx-auto max-w-5xl px-6">
          <motion.div {...fadeInView(0)} className="mb-16">
            <p className="text-sm font-semibold text-coral uppercase tracking-wider">Pricing</p>
            <h2 className="mt-3 font-serif text-4xl md:text-5xl leading-tight max-w-lg">Plans that respect your budget.</h2>
            <p className="mt-4 text-mid max-w-xl leading-relaxed">Start free. Upgrade to Live Search and tracking tools.</p>
          </motion.div>
          <div className="grid md:grid-cols-3 gap-px bg-warm">
            {plans.map((plan, i) => (
              <motion.div
                key={plan.name}
                {...fadeInView(i * 0.1)}
                className={`relative p-8 flex flex-col ${plan.popular ? 'bg-forest text-cream' : 'bg-cream'}`}
              >
                {plan.popular && (
                  <span className="absolute top-4 right-4 bg-coral px-3 py-1 text-xs font-semibold text-white">Most Popular</span>
                )}
                <h3 className={`font-serif text-xl ${plan.popular ? 'text-cream' : ''}`}>{plan.name}</h3>
                <div className="mt-4">
                  <span className={`font-serif text-4xl ${plan.popular ? 'text-cream' : 'text-charcoal'}`}>{plan.price}</span>
                  <span className={`ml-2 text-sm ${plan.popular ? 'text-cream/60' : 'text-mid'}`}>{plan.period}</span>
                </div>
                <ul className="mt-8 space-y-3 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className={`flex items-start gap-2 text-sm ${plan.popular ? 'text-cream/80' : 'text-charcoal'}`}>
                      <Check className="h-4 w-4 mt-0.5 shrink-0 text-coral" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/auth/signup"
                  className={`mt-8 block text-center py-3 text-sm font-semibold transition-colors ${plan.popular ? 'bg-coral text-white hover:bg-coral-light' : 'bg-forest text-white hover:bg-forest/90'}`}
                >
                  {plan.cta}
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="py-16 md:py-20 bg-warm/30">
        <div className="mx-auto max-w-5xl px-6">
          <motion.div {...fadeInView(0)} className="mb-16">
            <p className="text-sm font-semibold text-coral uppercase tracking-wider">Testimonials</p>
            <h2 className="mt-3 font-serif text-4xl md:text-5xl leading-tight">Loved by small organisations.</h2>
          </motion.div>
          <div className="grid md:grid-cols-3 gap-px bg-warm">
            {testimonials.map((t, i) => (
              <motion.div key={t.name} {...fadeInView(i * 0.1)} className="bg-cream p-8">
                <p className="text-sm text-charcoal leading-relaxed">"{t.quote}"</p>
                <div className="mt-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center bg-forest text-white font-semibold text-sm">{t.initials}</div>
                  <div>
                    <p className="text-sm font-semibold text-charcoal">{t.name}</p>
                    <p className="text-xs text-mid">{t.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="py-16 md:py-20">
        <div className="mx-auto max-w-5xl px-6">
          <motion.div {...fadeInView(0)} className="grid md:grid-cols-2 gap-16 items-start">
            <div>
              <p className="text-sm font-semibold text-coral uppercase tracking-wider">Contact</p>
              <h2 className="mt-3 font-serif text-4xl md:text-5xl leading-tight">Get in touch.</h2>
              <p className="mt-4 text-mid leading-relaxed">Have a question, partnership idea, or just want to say hello? We'd love to hear from you.</p>
              <div className="mt-10 space-y-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center bg-coral/10 text-coral"><Mail size={18} /></div>
                  <div>
                    <p className="text-sm font-semibold">Email us</p>
                    <a href="mailto:hello@granttracker.co.uk" className="text-sm text-coral hover:underline">hello@granttracker.co.uk</a>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center bg-coral/10 text-coral"><MessageSquare size={18} /></div>
                  <div>
                    <p className="text-sm font-semibold">Response time</p>
                    <p className="text-sm text-mid">Usually within 24 hours</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="border border-warm bg-white p-8">
              <ContactForm />
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 md:py-20 bg-[#121f2b]">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <motion.div {...fadeInView(0)}>
            <h2 className="font-serif text-4xl text-cream md:text-6xl leading-tight">Find your funding. Free to start.</h2>
            <p className="mx-auto mt-6 max-w-lg text-cream/60 leading-relaxed">Join CICs, charities, social enterprises and impact founders already discovering funding that actually fits.</p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link href="/auth/signup" className="bg-coral text-white rounded px-10 py-3.5 text-base font-semibold hover:opacity-90 transition-colors">Start for free</Link>
            </div>
            <p className="mt-4 text-sm text-cream/40">No credit card required</p>
          </motion.div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-warm py-12">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-8 px-6 md:flex-row md:justify-between">
          <a href="/" className="flex items-center gap-2">
            <RadioWaveIcon className="h-6 w-6 text-coral" />
            <span className="font-serif text-lg text-charcoal">Grant<span className="text-coral">Tracker</span></span>
          </a>
          <div className="flex gap-8 text-sm text-mid">
            <a href="#how" className="hover:text-charcoal transition-colors">How it works</a>
            <a href="#features" className="hover:text-charcoal transition-colors">Features</a>
            <a href="#pricing" className="hover:text-charcoal transition-colors">Pricing</a>
            <a href="#about" className="hover:text-charcoal transition-colors">About</a>
            <a href="#contact" className="hover:text-charcoal transition-colors">Contact</a>
          </div>
          <p className="text-xs text-mid">© 2025 Grant Tracker</p>
        </div>
      </footer>

    </div>
  )
}
