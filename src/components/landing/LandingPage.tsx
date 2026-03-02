'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import ContactForm from '@/components/ContactForm'

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

/* ─── nav links ─── */
const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Compare', href: '#compare' },
  { label: 'About', href: '#about' },
  { label: 'Contact', href: '#contact' },
]

export default function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-cream">

      {/* ══ NAV ══════════════════════════════════════════════════════════════ */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="fixed top-0 left-0 right-0 z-50 border-b border-warm/60 bg-cream/80 backdrop-blur-lg"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          {/* Logo */}
          <a href="/" className="flex items-center gap-0.5">
            <span className="font-serif text-2xl text-forest">Grant</span>
            <span className="font-serif text-2xl text-charcoal">Tracker</span>
          </a>

          {/* Desktop links */}
          <div className="hidden items-center gap-8 md:flex">
            {navLinks.map(link => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm font-medium text-mid transition-colors hover:text-charcoal"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Desktop CTAs */}
          <div className="hidden items-center gap-3 md:flex">
            <Link href="/auth/login" className="btn-outline btn-sm">Sign in</Link>
            <Link href="/auth/signup" className="btn-gold btn-sm">Get started free →</Link>
          </div>

          {/* Mobile toggle */}
          <button
            className="text-charcoal md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="border-t border-warm bg-cream px-6 pb-6 md:hidden"
          >
            <div className="flex flex-col gap-4 pt-4">
              {navLinks.map(link => (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-sm font-medium text-mid"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </a>
              ))}
              <div className="flex flex-col gap-2 pt-2">
                <Link href="/auth/login" className="btn-outline btn-sm text-center">Sign in</Link>
                <Link href="/auth/signup" className="btn-gold btn-sm text-center">Get started free →</Link>
              </div>
            </div>
          </motion.div>
        )}
      </motion.nav>

      {/* ══ HERO ═════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden pt-32 pb-20 md:pt-44 md:pb-28">
        {/* Background blobs */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute top-20 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-forest/5 blur-3xl" />
          <div className="absolute top-40 right-1/4 h-[300px] w-[300px] rounded-full bg-gold/10 blur-3xl" />
        </div>

        <div className="mx-auto max-w-6xl px-6 text-center">
          {/* Badge */}
          <motion.div {...fadeUp(0.1)} className="mb-8 inline-flex items-center gap-2 rounded-full border border-warm bg-white px-4 py-2 text-sm text-mid shadow-sm">
            <span>🇬🇧</span>
            <span>For charities, community groups, social enterprises &amp; impact founders · Free to start</span>
          </motion.div>

          {/* Heading */}
          <motion.h1
            {...fadeUp(0.2)}
            className="mx-auto max-w-3xl text-5xl leading-tight md:text-7xl md:leading-[1.1]"
          >
            Find &amp; Track Grants{' '}
            <span className="text-gradient-warm italic">Matched to your mission</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            {...fadeUp(0.35)}
            className="mx-auto mt-6 max-w-2xl text-lg text-mid md:text-xl"
          >
            800+ UK funding opportunities, AI matching that learns from your feedback, and a full application pipeline — all in one place.
          </motion.p>

          {/* CTAs */}
          <motion.div
            {...fadeUp(0.5)}
            className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
          >
            <Link href="/auth/signup" className="btn-primary px-10 py-3.5 text-base font-semibold">
              Start for free →
            </Link>
            <Link href="/auth/login" className="text-sm text-mid hover:text-charcoal font-medium transition-colors">
              Already have an account? <span className="text-forest underline-offset-4 hover:underline">Sign in</span>
            </Link>
          </motion.div>

          {/* Feature pillars */}
          <motion.div
            {...fadeUp(0.65)}
            className="mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-4 md:grid-cols-4"
          >
            {[
              { icon: '🎯', stat: 'AI Match', label: 'learns from your feedback' },
              { icon: '📋', stat: 'Pipeline', label: 'tracks every application' },
              { icon: '🔔', stat: 'Alerts', label: 'when new matches appear' },
              { icon: '👤', stat: 'Personalisation', label: 'matched to your mission' },
            ].map((item, i) => (
              <motion.div
                key={item.stat}
                {...fadeUp(0.7 + i * 0.1)}
                className="group flex flex-col items-center gap-2 rounded-2xl border border-warm bg-white p-5 transition-all hover:border-forest/20 hover:shadow-warm"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest/10 text-xl transition-colors group-hover:bg-forest group-hover:text-white">
                  {item.icon}
                </div>
                <span className="font-serif text-sm font-semibold text-charcoal">{item.stat}</span>
                <span className="text-xs text-mid">{item.label}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══ FEATURE 1: GRANT SEARCH ══════════════════════════════════════════ */}
      <section id="features" className="max-w-6xl mx-auto px-6 pb-24 scroll-mt-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

          <motion.div {...fadeInView()}>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
              ✦ Feature 1 · AI Search
            </span>
            <h2 className="mt-4 text-3xl leading-tight md:text-4xl">
              800+ UK funding opportunities,<br />ranked by AI to your mission
            </h2>
            <p className="mt-4 text-lg text-mid leading-relaxed">
              Search grants, competitions, social loans and matched crowdfunding — not just the obvious sources, but the specialist and hyper-local funders too. AI Search ranks every result by how well it fits your mission, income band and eligibility.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                { icon: '✦', text: 'AI match scores with a breakdown — sector, eligibility, geography, size, and mission fit' },
                { icon: '🎯', text: 'Thumbs up or down on any result trains future rankings to your preferences' },
                { icon: '📍', text: 'Filter by grants, competitions 🏆, social loans 🔄, or crowdfund match 🤝' },
                { icon: '🆕', text: 'Freshness filter puts the most recently verified opportunities at the top' },
              ].map(item => (
                <li key={item.text} className="flex items-start gap-3 text-sm text-mid">
                  <span className="mt-0.5 flex-shrink-0 text-sage">{item.icon}</span>
                  {item.text}
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Search mockup */}
          <motion.div {...fadeInView(0.15)}>
            <div className="rounded-2xl border border-warm bg-white p-5 shadow-card-lg">
              {/* Search bar */}
              <div className="flex gap-2 mb-4">
                <div className="flex-1 flex items-center gap-2 border border-warm rounded-xl px-3 py-2.5 bg-cream/50">
                  <span className="text-light text-sm">🔍</span>
                  <span className="text-sm text-light">youth mental health Manchester</span>
                </div>
                <div className="bg-forest text-white text-xs font-semibold px-3 py-2 rounded-xl whitespace-nowrap flex items-center">✦ AI Search</div>
              </div>
              {/* Filter pills */}
              <div className="flex gap-1.5 mb-4 flex-wrap">
                {['All', '📍 Local', '🏆 Competition', 'Trust & Foundation'].map((f, i) => (
                  <span key={f} className={`px-2.5 py-1 rounded-full text-[10px] font-medium border ${i === 0 ? 'bg-forest text-white border-forest' : 'border-warm text-mid bg-white'}`}>{f}</span>
                ))}
                <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-gold/15 text-gold border border-gold/20">🆕 New this week 23</span>
              </div>
              {/* Grant cards */}
              <div className="space-y-2.5">
                {[
                  { funder: 'National Lottery Community Fund', title: 'Awards for All England', amount: '£300–£10,000', score: 94, reason: 'Matches youth work in Manchester, rolling deadline' },
                  { funder: 'BBC Children in Need', title: 'Small Grants Programme', amount: 'Up to £10,000', score: 87, reason: 'Strong fit for mental health support for under-18s' },
                  { funder: 'Paul Hamlyn Foundation', title: 'Youth Fund', amount: '£10k–£60k', score: 78, reason: 'Funds youth arts and wellbeing, open to Manchester orgs' },
                ].map(g => (
                  <div key={g.title} className="border border-warm rounded-xl p-3 bg-white hover:border-forest/20 transition-all">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-mid font-semibold">{g.funder}</p>
                        <p className="text-xs font-bold text-forest leading-tight">{g.title}</p>
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <span className="text-[10px] bg-forest/10 text-forest px-2 py-0.5 rounded-full font-medium">✦ {g.score}% match</span>
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
          </motion.div>
        </div>
      </section>

      {/* ══ FEATURE 2: LIVE SEARCH (dark panel) ═══════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="bg-forest rounded-3xl px-8 py-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

            {/* Mock UI */}
            <motion.div {...fadeInView()}>
              <div className="bg-white/10 rounded-2xl p-5 border border-white/20">
                <p className="text-xs text-mint/70 font-semibold uppercase tracking-wider mb-3">🔬 Live Search · Live results</p>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {['🧠 Mental Health', '🧒 Youth', '📚 Education & Training', '🏘 Community', '♿ Disability'].map((s, i) => (
                    <span key={s} className={`px-2 py-1 rounded-full text-[10px] font-medium border ${i < 2 ? 'bg-sage border-sage/70 text-white' : 'border-white/20 text-white/60'}`}>{s}</span>
                  ))}
                </div>
                <div className="space-y-2.5">
                  {[
                    { title: 'Lewisham Community Mental Health Fund', funder: 'London Borough of Lewisham', amount: 'Up to £8,000', tag: '📍 Hyper-local' },
                    { title: 'SE London ICB Commissioning Round', funder: "Guy's & St Thomas' NHS Foundation", amount: '£15k–£50k', tag: '🏥 NHS' },
                    { title: 'Young Minds Matter Grant', funder: 'Comic Relief, open round', amount: '£5k–£25k', tag: '🆕 New round' },
                  ].map(r => (
                    <div key={r.title} className="bg-white/10 rounded-xl p-3 border border-white/10">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[9px] font-semibold text-mint bg-white/10 px-1.5 py-0.5 rounded-full">{r.tag}</span>
                          <p className="text-xs font-bold text-white mt-1 leading-tight">{r.title}</p>
                          <p className="text-[10px] text-mint/60 mt-0.5">{r.funder}</p>
                        </div>
                        <p className="text-xs font-bold text-gold flex-shrink-0">{r.amount}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-mint/50 mt-3 text-center">Results researched live, not from a static database</p>
              </div>
            </motion.div>

            <motion.div {...fadeInView(0.15)}>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-mint">
                🔬 Feature 2 · Live Search (Pro)
              </span>
              <h2 className="mt-4 text-3xl text-white leading-tight md:text-4xl">
                Finds local funders other tools completely miss
              </h2>
              <p className="mt-4 text-mint/80 leading-relaxed">
                Live Search uses AI to scan council websites, NHS commissioning pages, community foundation portals and specialist funders in real time. Not a database. Not last year&apos;s results.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  'Borough-level programmes most national databases never index',
                  'NHS ICB commissioning and local authority grants by area',
                  'Sector filters (mental health, youth, disability, housing, and more)',
                  'Only returns grants not already in the curated database',
                ].map(text => (
                  <li key={text} className="flex items-start gap-3 text-sm text-mint/80">
                    <span className="mt-0.5 flex-shrink-0 text-mint">✓</span>
                    {text}
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ══ FEATURE 3: PERSONALISATION ════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

          <motion.div {...fadeInView()}>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
              🎯 Feature 3 · Personalisation
            </span>
            <h2 className="mt-4 text-3xl leading-tight md:text-4xl">
              Results that get sharper<br />every time you use it
            </h2>
            <p className="mt-4 text-lg text-mid leading-relaxed">
              Grant Tracker learns what matters to you. Complete your profile and every result gets an AI match score. Rate results with a thumbs up or down and the system adjusts — boosting funding types and sectors you respond to, and downranking the ones that don&apos;t fit.
            </p>
            <ul className="mt-6 space-y-3">
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
          </motion.div>

          {/* Personalisation mockup */}
          <motion.div {...fadeInView(0.15)}>
            <div className="rounded-2xl border border-warm bg-white p-5 shadow-card-lg space-y-3">
              {/* Profile completeness */}
              <div className="rounded-xl border border-gold/30 bg-gold/5 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-charcoal">Match quality</span>
                  <span className="font-serif text-2xl font-bold text-gold">60%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-warm">
                  <div className="h-2 w-[60%] rounded-full bg-gold transition-all" />
                </div>
                <p className="mt-2 text-xs text-mid">Annual income, primary location missing from your profile</p>
                <a className="mt-1 inline-block text-xs font-bold text-gold underline-offset-2 hover:underline cursor-pointer">Complete profile →</a>
              </div>

              {/* Grant card with score breakdown */}
              <div className="rounded-xl border border-warm bg-cream/50 p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="text-[10px] text-mid font-semibold">Esmée Fairbairn Foundation</p>
                    <p className="text-sm font-bold text-forest">Main Grants Programme</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-serif text-lg font-bold text-forest">✦ 91%</span>
                    <button className="rounded-full p-1 text-mid hover:bg-forest/10 hover:text-forest transition-colors">👍</button>
                    <button className="rounded-full p-1 text-mid hover:bg-red-100 hover:text-red-500 transition-colors">👎</button>
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { label: 'Mission', score: 90 },
                    { label: 'Sector', score: 95 },
                    { label: 'Eligibility', score: 85 },
                    { label: 'Geography', score: 88 },
                    { label: 'Size', score: 80 },
                  ].map(s => (
                    <div key={s.label} className="text-center">
                      <div className="mx-auto mb-1 h-1.5 w-full rounded-full bg-warm">
                        <div className="h-1.5 rounded-full bg-sage" style={{ width: `${s.score}%` }} />
                      </div>
                      <p className="text-[9px] text-mid">{s.label}</p>
                      <p className="text-[10px] font-semibold text-forest">{s.score}%</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-warm bg-white p-3 flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] text-mid font-semibold">UnLtd</p>
                  <p className="text-xs font-bold text-forest">Award for Social Entrepreneurs</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs bg-forest/10 text-forest px-2 py-0.5 rounded-full font-bold">✦ 84%</span>
                  <span className="text-mid cursor-pointer">👍</span>
                  <span className="text-mid cursor-pointer">👎</span>
                </div>
              </div>
              <p className="text-[10px] text-center text-light">👍 on a result trains future rankings to your preferences</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ══ FEATURE 4: PIPELINE ═══════════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

          <motion.div {...fadeInView()}>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">
              📋 Feature 4 · Pipeline
            </span>
            <h2 className="mt-4 text-3xl leading-tight md:text-4xl">
              A pipeline that shows you exactly where every application stands
            </h2>
            <p className="mt-4 text-lg text-mid leading-relaxed">
              Move grants from Identified → Researching → Applying → Submitted → Won with a simple drag-and-drop board. Each card holds your notes, contacts, deadlines and writing progress — everything in one place, nothing lost in a spreadsheet.
            </p>
            <ul className="mt-6 space-y-3">
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
          </motion.div>

          {/* Pipeline mockup */}
          <motion.div {...fadeInView(0.15)}>
            <div className="rounded-2xl border border-warm bg-white p-5 shadow-card-lg">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-serif text-sm font-bold text-forest">Funding Pipeline</p>
                  <p className="text-xs text-mid">7 opportunities tracked</p>
                </div>
                <span className="text-xs bg-gold/10 text-gold font-bold px-3 py-1 rounded-full">£187,500 active</span>
              </div>
              <div className="grid grid-cols-6 gap-1.5 mb-3">
                {[
                  { label: 'Identified', color: 'border-blue-400 text-blue-600', cards: 2 },
                  { label: 'Researching', color: 'border-gold text-gold', cards: 1 },
                  { label: 'Applying', color: 'border-sage text-sage', cards: 2 },
                  { label: 'Submitted', color: 'border-forest text-forest', cards: 1 },
                  { label: 'Won', color: 'border-emerald-500 text-emerald-600', cards: 1 },
                  { label: 'Declined', color: 'border-red-300 text-red-400', cards: 0 },
                ].map(col => (
                  <div key={col.label} className="bg-warm/40 rounded-xl p-1.5 min-h-[80px]">
                    <p className={`text-[8px] font-bold uppercase tracking-wide pb-1 mb-1.5 border-b ${col.color}`}>{col.label}</p>
                    <div className="space-y-1">
                      {Array.from({ length: col.cards }).map((_, i) => (
                        <div key={i} className="bg-white rounded-lg p-1 shadow-sm border-l-2 border-sage">
                          <div className="h-1.5 bg-warm rounded mb-1 w-full" />
                          <div className="h-1 bg-gold/30 rounded w-2/3" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {/* Expanded card */}
              <div className="border border-sage/20 rounded-xl p-3 bg-forest/[0.03]">
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
          </motion.div>
        </div>
      </section>

      {/* ══ FEATURE 5: DEADLINE ALERTS ════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="rounded-3xl border border-warm bg-white p-10 shadow-card">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">

            {/* Deadline mock */}
            <motion.div {...fadeInView()}>
              <p className="text-xs font-semibold text-forest/60 uppercase tracking-wider mb-4">⏰ Deadline Alerts</p>
              <div className="space-y-3">
                {[
                  { name: 'Youth Fund', funder: 'Paul Hamlyn Foundation', days: 3, amount: '£30,000', urgent: true },
                  { name: 'Local Connections Fund', funder: 'Barclays', days: 12, amount: '£5,000', urgent: false },
                  { name: 'Awards for All', funder: 'National Lottery', days: 28, amount: '£10,000', urgent: false },
                ].map(item => (
                  <div key={item.name} className={`bg-cream rounded-xl p-4 border ${item.urgent ? 'border-red-200' : 'border-warm'} flex items-center justify-between gap-4`}>
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
            </motion.div>

            <motion.div {...fadeInView(0.15)}>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
                ⏰ Feature 5 · Dashboard &amp; Alerts
              </span>
              <h2 className="mt-4 text-3xl leading-tight md:text-4xl">
                A dashboard that tells you what needs attention today
              </h2>
              <p className="mt-4 text-base text-mid leading-relaxed">
                Your dashboard shows you what matters right now — new grants added this week, upcoming deadlines ranked by urgency, and a snapshot of your full pipeline. Anything within 14 days gets flagged. Email alerts notify you when new funding matches your profile, so you never find out too late.
              </p>
              <ul className="mt-5 space-y-2.5">
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
            </motion.div>
          </div>
        </div>
      </section>

      {/* ══ COMPARISON ════════════════════════════════════════════════════════ */}
      <section id="compare" className="max-w-6xl mx-auto px-6 pb-24 scroll-mt-20">
        <motion.div {...fadeInView()} className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl">Not just cheaper. Dramatically better.</h2>
          <p className="mt-3 text-mid max-w-xl mx-auto">UK grant databases have barely changed in a decade. Grant Tracker was built from scratch for how charities, social enterprises and impact founders actually work.</p>
        </motion.div>
        <motion.div {...fadeInView(0.1)}>
          <div className="bg-white rounded-2xl shadow-card border border-warm overflow-hidden">
            <div className="grid grid-cols-3 text-sm">
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
                <div key={row.feature} className="contents">
                  <div className={`p-3.5 border-b border-r border-warm ${i % 2 !== 0 ? 'bg-warm/20' : ''}`}>
                    <p className="text-sm text-charcoal font-medium">{row.feature}</p>
                  </div>
                  <div className={`p-3.5 border-b border-r border-warm text-center ${i % 2 !== 0 ? 'bg-warm/20' : ''}`}>
                    <p className={`text-sm ${row.them.startsWith('✗') ? 'text-red-400' : row.them.startsWith('±') ? 'text-gold' : 'text-mid'}`}>{row.them}</p>
                  </div>
                  <div className={`p-3.5 border-b border-warm text-center ${i % 2 !== 0 ? 'bg-forest/[0.04]' : 'bg-forest/[0.02]'}`}>
                    <p className="text-sm text-forest font-medium">{row.us}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* ══ WHO IT'S FOR ══════════════════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <motion.div {...fadeInView()} className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl">Built for the people doing the work</h2>
          <p className="mt-3 text-mid max-w-md mx-auto">Small teams with big ambitions, not large development offices with specialist staff and six-figure budgets.</p>
        </motion.div>
        <motion.div {...fadeInView(0.1)} className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { emoji: '🏠', label: 'Charities', desc: 'Manage multiple funders and applications without a dedicated grants manager.' },
            { emoji: '🌱', label: 'Community Groups', desc: 'Find local and national funding that fits your size, area, and cause — including hyper-local funders most platforms miss.' },
            { emoji: '⚡', label: 'Social Enterprises', desc: 'Search trusts, corporates, government programmes and social loan funds in one place.' },
            { emoji: '💡', label: 'Impact Founders', desc: 'Find grants, competitions and interest-free loans for founders with a social or environmental mission.' },
            { emoji: '🚀', label: 'Underserved Ventures', desc: 'Discover competitions, matched crowdfunding and community funds open to early-stage and grassroots ventures.' },
          ].map((item, i) => (
            <motion.div key={item.label} {...fadeInView(i * 0.08)} className="bg-white rounded-2xl p-5 shadow-card text-center border border-warm hover:shadow-warm transition-shadow">
              <div className="text-3xl mb-3">{item.emoji}</div>
              <p className="font-serif font-bold text-forest text-sm mb-1.5">{item.label}</p>
              <p className="text-sm text-mid leading-normal">{item.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ══ FOUNDER STORY ══════════════════════════════════════════════════════ */}
      <section id="about" className="max-w-6xl mx-auto px-6 pb-24 scroll-mt-20">
        <motion.div {...fadeInView()} className="bg-white rounded-3xl shadow-card border border-warm overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-5">

            {/* Left credential panel */}
            <div className="lg:col-span-2 bg-forest p-10 flex flex-col gap-8">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-sage/20 border-2 border-sage/30 flex items-center justify-center flex-shrink-0">
                  <span className="font-serif text-xl font-bold text-white">GT</span>
                </div>
                <div>
                  <p className="font-serif text-lg font-bold text-white">Grant Tracker</p>
                  <p className="text-mint/60 text-xs mt-0.5">Built by sector practitioners</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { stat: '20', unit: 'yrs', label: 'sector experience' },
                  { stat: '3', unit: 'orgs', label: 'founded & run' },
                  { stat: 'Charity', unit: '+', label: 'social enterprise' },
                  { stat: '£M', unit: '+', label: 'funding secured' },
                ].map(item => (
                  <div key={item.label} className="bg-white/5 border border-white/10 rounded-xl p-3">
                    <p className="font-serif text-xl font-bold text-white leading-none">
                      {item.stat}<span className="text-sage text-sm">{item.unit}</span>
                    </p>
                    <p className="text-mint/50 text-[10px] mt-1">{item.label}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-mint/40 text-[10px] font-semibold uppercase tracking-wider mb-2">Our background</p>
                <div className="flex flex-wrap gap-1.5">
                  {['Founders', 'Fundraisers', 'Charities', 'Social Enterprise', 'Community Sector'].map(tag => (
                    <span key={tag} className="text-[10px] font-medium text-mint/60 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">{tag}</span>
                  ))}
                </div>
              </div>

              <div className="mt-auto pt-6 border-t border-white/10">
                <p className="text-mint/60 text-sm leading-normal italic">
                  &ldquo;We built the tool the sector needed but never had.&rdquo;
                </p>
              </div>
            </div>

            {/* Right content */}
            <div className="lg:col-span-3 p-10">
              <h2 className="text-3xl mb-6">Why Grant Tracker exists</h2>
              <blockquote className="font-serif text-xl text-forest font-semibold leading-snug mb-6 border-l-4 border-sage pl-5">
                &ldquo;Finding the right grant has always been harder than it should be. The tools that existed were too expensive, too generic, and built for organisations with a dedicated grants team — not for the people actually doing the work.&rdquo;
              </blockquote>
              <div className="space-y-4 text-mid text-base leading-relaxed">
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
        </motion.div>
      </section>

      {/* ══ STATS ═════════════════════════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <motion.div {...fadeInView()} className="bg-forest/8 rounded-2xl p-8 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center border border-forest/10">
          {[
            { stat: '800+', label: 'Grants, competitions, loans & crowdfund matches' },
            { stat: '120+', label: 'Sources crawled daily across the UK' },
            { stat: 'Free', label: 'to search — no credit card required' },
            { stat: 'Live', label: 'AI research and daily database refresh' },
          ].map(item => (
            <div key={item.stat}>
              <p className="font-serif text-3xl sm:text-4xl font-bold text-forest">{item.stat}</p>
              <p className="text-sm text-mid mt-1">{item.label}</p>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ══ TESTIMONIAL ═══════════════════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <motion.div {...fadeInView()} className="max-w-2xl mx-auto text-center">
          <div className="bg-white rounded-2xl p-8 shadow-card border border-warm">
            <div className="flex justify-center gap-0.5 mb-5">
              {[...Array(5)].map((_, i) => (
                <span key={i} className="text-gold text-lg">★</span>
              ))}
            </div>
            <blockquote className="font-serif text-lg text-forest font-semibold leading-snug mb-5">
              &ldquo;Finally found a local NHS commissioning grant we had no idea existed. The Advanced Search is unlike anything I&apos;ve used before.&rdquo;
            </blockquote>
            <div className="flex items-center justify-center gap-3">
              <div className="w-9 h-9 rounded-full bg-sage/20 flex items-center justify-center text-sage font-bold text-sm flex-shrink-0">S</div>
              <div className="text-left">
                <p className="text-sm font-semibold text-forest">Sarah</p>
                <p className="text-xs text-mid">Director, community mental health charity, South London</p>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ══ CONTACT ═══════════════════════════════════════════════════════════ */}
      <section id="contact" className="max-w-6xl mx-auto px-6 pb-24 scroll-mt-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          <motion.div {...fadeInView()}>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
              ✉️ Get in touch
            </span>
            <h2 className="mt-4 text-3xl">Questions? We&apos;d love to hear from you</h2>
            <p className="mt-4 text-lg text-mid leading-relaxed">
              Whether you&apos;re curious about how Grant Tracker works, want to suggest something, or just want to say hello — drop us a message and we&apos;ll get back to you.
            </p>
            <div className="mt-6 space-y-3">
              {[
                { icon: '💡', text: 'Suggest a feature or improvement' },
                { icon: '🐛', text: 'Report a bug or something not working' },
                { icon: '🤝', text: 'Partnership or collaboration enquiries' },
                { icon: '❓', text: 'Any other questions' },
              ].map(item => (
                <div key={item.text} className="flex items-center gap-3 text-sm text-mid">
                  <span>{item.icon}</span>
                  {item.text}
                </div>
              ))}
            </div>
            <p className="text-xs text-light mt-6">
              Or email us directly at{' '}
              <a href="mailto:hello@granttracker.co.uk" className="text-sage hover:underline font-medium">hello@granttracker.co.uk</a>
            </p>
          </motion.div>
          <motion.div {...fadeInView(0.15)} className="bg-white rounded-2xl shadow-card p-8 border border-warm">
            <ContactForm />
          </motion.div>
        </div>
      </section>

      {/* ══ FINAL CTA ═════════════════════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <motion.div {...fadeInView()}>
          <div className="relative overflow-hidden rounded-3xl bg-forest p-12 text-center md:p-20">
            {/* Decorative blobs */}
            <div className="pointer-events-none absolute -top-20 -right-20 h-60 w-60 rounded-full bg-gold/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-white/10 blur-3xl" />

            <div className="relative inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs text-mint font-semibold mb-6">
              🇬🇧 Trusted by UK charities, community groups, social enterprises &amp; impact founders
            </div>
            <h2 className="relative text-3xl text-white md:text-5xl">
              Ready to find funding<br />
              <span className="italic">matched to your mission?</span>
            </h2>
            <p className="relative mx-auto mt-4 max-w-lg text-white/80">
              Join hundreds of charities, community groups and social enterprises already using Grant Tracker to find and win funding.
            </p>
            <div className="relative mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link href="/auth/signup" className="btn-gold px-12 py-3.5 text-base font-semibold">
                Create free account →
              </Link>
              <span className="text-sm text-white/70">No credit card required</span>
            </div>
            <p className="relative text-xs text-white/40 mt-5">Free forever for grant search · Upgrade anytime · Cancel anytime</p>
            <p className="relative text-xs text-white/30 mt-2">🔒 Your data is never shared or sold. Stored securely, deleted on request.</p>
          </div>
        </motion.div>
      </section>

      {/* ══ FOOTER ════════════════════════════════════════════════════════════ */}
      <footer className="border-t border-warm py-10 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-6">
            <a href="/" className="flex items-center gap-0.5">
              <span className="font-serif text-xl text-forest">Grant</span>
              <span className="font-serif text-xl text-charcoal">Tracker</span>
            </a>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Link href="/auth/login" className="text-xs text-mid hover:text-charcoal transition-colors">Sign in</Link>
              <Link href="/auth/signup" className="text-xs text-mid hover:text-charcoal transition-colors">Sign up free</Link>
              <a href="#features" className="text-xs text-mid hover:text-charcoal transition-colors">Features</a>
              <a href="#about" className="text-xs text-mid hover:text-charcoal transition-colors">About</a>
              <a href="#contact" className="text-xs text-mid hover:text-charcoal transition-colors">Contact</a>
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
