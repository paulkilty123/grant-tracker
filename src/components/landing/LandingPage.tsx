'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Menu, X, Target, ClipboardList, Bell, Layers, Check, Heart, Users, Lightbulb, Mail, MessageSquare } from 'lucide-react'
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
            <span className="font-serif text-2xl text-forest italic">Grant</span>
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
      <section className="relative overflow-hidden pt-32 pb-12 md:pt-44 md:pb-16">
        {/* Background blobs */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute top-20 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-forest/5 blur-3xl" />
          <div className="absolute top-40 right-1/4 h-[300px] w-[300px] rounded-full bg-gold/10 blur-3xl" />
        </div>

        <div className="mx-auto max-w-6xl px-6 text-center">
          {/* Badge */}
          <motion.div {...fadeUp(0.1)} className="mb-8 inline-flex items-center gap-2 rounded-full border border-warm bg-white px-4 py-2 text-sm text-mid shadow-sm">
            <span>🇬🇧</span>
            <span>For CICs · Social Enterprises · Charities · Co-operatives · Impact Founders · Diverse-Led Ventures</span>
          </motion.div>

          {/* Heading */}
          <motion.h1
            {...fadeUp(0.2)}
            className="mx-auto max-w-3xl text-5xl leading-tight md:text-7xl md:leading-[1.1]"
          >
            Find Funding{' '}
            <span className="text-gradient-warm italic">Matched to Your Purpose</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            {...fadeUp(0.35)}
            className="mx-auto mt-6 max-w-2xl text-lg text-mid md:text-xl"
          >
            Find grants, accelerators, social investment, diversity funds, and more — all matched to your mission, legal structure and stage.
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
              { icon: Layers, stat: '6 Funding Types', label: 'grants, accelerators, investment & more' },
              { icon: Target, stat: 'Smart Matching', label: 'filtered to your structure & stage' },
              { icon: ClipboardList, stat: 'Pipeline', label: 'tracks every application' },
              { icon: Bell, stat: 'Alerts', label: 'never miss a deadline' },
            ].map((item, i) => (
              <motion.div
                key={item.stat}
                {...fadeUp(0.7 + i * 0.1)}
                className="group flex flex-col items-center gap-2 rounded-2xl border border-warm bg-white p-5 transition-all hover:border-forest/20 hover:shadow-warm"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest/10 text-forest transition-colors group-hover:bg-forest group-hover:text-white">
                  <item.icon size={20} />
                </div>
                <span className="font-serif text-sm font-semibold text-charcoal">{item.stat}</span>
                <span className="text-xs text-mid">{item.label}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══ HOW IT WORKS ═════════════════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-6 pt-4 pb-24">
        <motion.div {...fadeInView()} className="text-center mb-12">
          <span className="inline-block mb-4 rounded-full bg-forest/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-forest">
            How it works
          </span>
          <p className="text-xl text-mid md:text-2xl">Set up once. Search everything. Track what matters.</p>
        </motion.div>
        <motion.div {...fadeInView(0.1)} className="rounded-3xl bg-forest/[0.03] border border-forest/8 px-8 py-12">
          {/* Desktop: horizontal flow */}
          <div className="hidden md:flex items-start justify-between gap-0">
            {[
              { icon: '👤', title: 'Set up your profile',  desc: 'Tell us your legal structure, sector, stage, and location. Takes about 5 minutes.', color: 'text-forest',    bg: 'bg-forest/10',    border: 'border-forest/40'    },
              { icon: '🔍', title: 'Search funding',        desc: 'Search naturally across grants, accelerators, social investment, and more in one place.', color: 'text-sky-500',   bg: 'bg-sky-500/10',   border: 'border-sky-400/40'   },
              { icon: '✦',  title: 'See your matches',      desc: 'Results are ranked by how well they fit your profile — structure, sector, stage, and mission.', color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-400/40' },
              { icon: '📋', title: 'Add to pipeline',       desc: 'Track each application from first contact to submission on a simple visual board.', color: 'text-gold',      bg: 'bg-gold/10',      border: 'border-gold/40'      },
              { icon: '🔔', title: 'Get alerts',            desc: 'Weekly or instant email alerts when new funding matches your profile.', color: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/40' },
            ].map((step, i, arr) => (
              <div key={step.title} className="flex items-start flex-1">
                <div className="flex flex-col items-center text-center flex-1 px-2">
                  <div className={`w-16 h-16 rounded-full ${step.bg} border-2 ${step.border} flex items-center justify-center text-2xl mb-4`}>
                    {step.icon}
                  </div>
                  <p className={`text-sm font-semibold ${step.color} leading-snug mb-2`}>{step.title}</p>
                  <p className="text-xs text-mid leading-relaxed max-w-[130px]">{step.desc}</p>
                </div>
                {i < arr.length - 1 && (
                  <div className="flex items-center pt-8 w-8 flex-shrink-0">
                    <div className="h-0.5 flex-1 bg-warm w-full" />
                    <span className="text-light text-sm -ml-1">›</span>
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* Mobile: vertical flow */}
          <div className="flex md:hidden flex-col gap-0 pl-2">
            {[
              { icon: '👤', title: 'Set up your profile',  desc: 'Tell us your legal structure, sector, stage, and location. Takes about 5 minutes.',                              color: 'text-forest'    },
              { icon: '🔍', title: 'Search funding',        desc: 'Search naturally across grants, accelerators, social investment, and more in one place.',                        color: 'text-sky-500'   },
              { icon: '✦',  title: 'See your matches',      desc: 'Results ranked by how well they fit your profile — structure, sector, stage, and mission.',                      color: 'text-emerald-500' },
              { icon: '📋', title: 'Add to pipeline',       desc: 'Track each application from first contact to submission on a simple visual board.',                             color: 'text-gold'      },
              { icon: '🔔', title: 'Get alerts',            desc: 'Weekly or instant email alerts when new funding matches your profile.',                                          color: 'text-purple-400' },
            ].map((step, i, arr) => (
              <div key={step.title} className="flex items-start gap-4">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className="w-11 h-11 rounded-full bg-forest/10 border border-warm flex items-center justify-center text-xl">
                    {step.icon}
                  </div>
                  {i < arr.length - 1 && <div className="w-0.5 h-8 bg-warm my-1" />}
                </div>
                <div className="pt-2 pb-4">
                  <p className={`text-sm font-semibold ${step.color} mb-1`}>{step.title}</p>
                  <p className="text-xs text-mid leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ══ COVERAGE & FUNDING TYPES ═════════════════════════════════════════ */}
      <section id="coverage" className="pt-8 pb-24">
        <div className="max-w-6xl mx-auto px-6">

          {/* Heading */}
          <motion.div {...fadeInView(0)} className="text-center mb-12">
            <span className="inline-block mb-4 rounded-full bg-forest/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-forest">
              6 Funding Types
            </span>
            <h2 className="text-5xl leading-tight md:text-6xl md:leading-[1.1] mb-5">
              Beyond grants —<br />
              <span className="text-gradient-warm italic">the full funding landscape</span>
            </h2>
            <p className="mx-auto max-w-2xl text-mid text-lg">
              Most grant databases cover only a fraction of what mission-driven organisations can access. Grant Tracker brings together searchable grants, accelerators, and diversity funds — plus profiles of social lenders and guides to in-kind support — because finding funding rarely means finding just one type of answer.
            </p>
          </motion.div>

          {/* Funding type cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                emoji: '🎯',
                title: 'Grants & Awards',
                desc: 'National Lottery, trusts, foundations, Innovate UK, arts councils, and government programmes — each tagged with eligible legal structures.',
                badge: '£300 – £500k+',
                journey: '🔍 Search & apply',
                journeyColor: 'bg-forest/10 text-forest',
                delay: 0.1,
              },
              {
                emoji: '🚀',
                title: 'Accelerators & Programmes',
                desc: 'Equity-free programmes with mentoring, workspace and networks. UnLtd, SSE, Foundervine, Hatch, Creative UK and more — with clear application windows.',
                badge: 'Programme + grant',
                journey: '🔍 Search & apply',
                journeyColor: 'bg-forest/10 text-forest',
                delay: 0.2,
              },
              {
                emoji: '🌈',
                title: 'Diversity-Targeted Funds',
                desc: 'Women in Innovation, Black Seed, Foundervine, and more. The fastest-growing category — zero overlap with general grant databases.',
                badge: '£5k – £250k',
                journey: '🔍 Search & apply',
                journeyColor: 'bg-forest/10 text-forest',
                delay: 0.3,
              },
              {
                emoji: '💰',
                title: 'Social Investment',
                desc: 'We profile the major social lenders — Big Issue Invest, Charity Bank, Resonance — so you know who funds what and what they look for. The journey starts with a conversation, not a form.',
                badge: '£20k – £3m',
                journey: '📖 Provider profiles',
                journeyColor: 'bg-sky-500/10 text-sky-600',
                delay: 0.4,
              },
              {
                emoji: '🔗',
                title: 'Blended & Matched Funding',
                desc: 'Specific programmes like SSE Match Trading and Power to Change offer matched or blended funding — part grant, part loan. We list the real programmes, not the theoretical mechanisms.',
                badge: 'Selected programmes',
                journey: '🔍 Selected listings',
                journeyColor: 'bg-forest/10 text-forest',
                delay: 0.5,
              },
              {
                emoji: '🛠️',
                title: 'In-Kind & Sector Reliefs',
                desc: 'Tech credits, sector-specific tax reliefs, and in-kind support explained — including who\'s actually eligible. A growing guides section to help you understand what exists beyond cash grants.',
                badge: 'Guides & resources',
                journey: '📚 Guides section',
                journeyColor: 'bg-gold/10 text-gold',
                delay: 0.6,
              },
            ].map((item) => (
              <motion.div
                key={item.title}
                {...fadeInView(item.delay)}
                className="flex gap-3 rounded-2xl border border-warm bg-white p-4 hover:border-forest/20 hover:shadow-warm transition-all"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-forest/10 text-lg">
                  {item.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-charcoal">{item.title}</span>
                    <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[11px] font-medium text-forest/80">{item.badge}</span>
                  </div>
                  <p className="text-xs text-mid leading-relaxed mb-2">{item.desc}</p>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.journeyColor}`}>{item.journey}</span>
                </div>
              </motion.div>
            ))}

          </div>

          {/* Sector strip */}
          <motion.div {...fadeInView(0.2)} className="mt-10 rounded-2xl border border-warm bg-white p-6">
            <p className="text-sm font-semibold text-charcoal mb-4">Covering 12 impact sectors</p>
            <div className="flex flex-wrap gap-2">
              {[
                '🎨 Creative Industries', '🌿 Environment & Climate', '🧠 Health & Wellbeing',
                '📖 Education & Skills', '💻 Tech for Good', '🏠 Housing & Homelessness',
                '🍽️ Food & Agriculture', '💼 Employment', '🤝 Community Development',
                '⚖️ Justice & Rights', '🏦 Financial Inclusion', '🌍 International',
              ].map(sector => (
                <span key={sector} className="px-3 py-1.5 rounded-lg border border-warm bg-cream text-xs text-mid font-medium">
                  {sector}
                </span>
              ))}
            </div>
            <p className="text-xs text-light mt-3">From film funding to blockchain grants, community energy to legal aid — matched to your structure, stage, and mission.</p>
          </motion.div>

        </div>
      </section>

      {/* ══ FEATURE 1: SEARCH & MATCH ════════════════════════════════════════ */}
      <section id="features" className="max-w-6xl mx-auto px-6 pb-24 scroll-mt-20">
        <div className="bg-forest rounded-3xl px-8 py-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

            {/* Text */}
            <motion.div {...fadeInView()}>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-mint">
                ✦ Feature 1 · Search & Match
              </span>
              <h2 className="mt-4 text-3xl text-white leading-tight md:text-4xl">
                Search everything.<br />See only what fits.
              </h2>
              <p className="mt-4 text-mint/80 leading-relaxed">
                Tell us your legal structure, sector, and stage once. Every search automatically filters to funding you can actually apply for — no reading through pages of criteria only to find you&apos;re ineligible. Live Search surfaces matching opportunities as you type, ranked by how well each one fits your profile.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  'Profile-based filtering — your structure, stage and sector shape every result from the start',
                  'Live Search — finds new funding as you type across all six funding types at once',
                  'Match scores with a full breakdown — structure, sector, geography, stage, and mission',
                  'Filter by funding type, sector, or deadline — or let AI ranking do the work',
                  'Freshness filter surfaces newly-verified opportunities before they fill up',
                ].map(text => (
                  <li key={text} className="flex items-start gap-3 text-sm text-mint/80">
                    <span className="mt-0.5 flex-shrink-0 text-mint">✓</span>
                    {text}
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* Search mock */}
            <motion.div {...fadeInView(0.15)}>
              <div className="rounded-2xl bg-white/10 border border-white/20 p-5">
                {/* Search bar */}
                <div className="flex gap-2 mb-4">
                  <div className="flex-1 flex items-center gap-2 border border-white/20 rounded-xl px-3 py-2.5 bg-white/5">
                    <span className="text-mint/50 text-sm">🔍</span>
                    <span className="text-sm text-mint/60">circular economy Birmingham CIC</span>
                  </div>
                  <div className="bg-white text-forest text-xs font-bold px-3 py-2 rounded-xl whitespace-nowrap flex items-center">✦ Live Search</div>
                </div>
                {/* Filter pills */}
                <div className="flex gap-1.5 mb-4 flex-wrap">
                  {['All types', '🎯 Grants', '🚀 Accelerators', '💰 Social Investment'].map((f, i) => (
                    <span key={f} className={`px-2.5 py-1 rounded-full text-[10px] font-medium border ${i === 0 ? 'bg-white/20 text-white border-white/30' : 'border-white/15 text-white/50'}`}>{f}</span>
                  ))}
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-gold/20 text-gold border border-gold/30">🆕 New this week 17</span>
                </div>
                {/* Result cards */}
                <div className="space-y-2.5">
                  {[
                    { funder: 'Ashden Awards', title: 'UK Climate Solutions Award', amount: '£10k–£40k', score: 96, type: '🎯 Grant', tag: 'CIC eligible', tagColor: 'bg-emerald-500/20 text-emerald-300' },
                    { funder: 'Creative UK / Innovate UK', title: 'Green Economy Innovation Fund', amount: '£25k–£100k', score: 88, type: '🔀 Blended', tag: 'Social enterprise accepted', tagColor: 'bg-gold/20 text-gold' },
                    { funder: 'UnLtd / Big Issue Invest', title: 'Social Entrepreneur Award', amount: 'Up to £15k', score: 81, type: '🚀 Accelerator', tag: 'CIC & unincorporated eligible', tagColor: 'bg-emerald-500/20 text-emerald-300' },
                  ].map(g => (
                    <div key={g.title} className="bg-white/10 rounded-xl p-3 border border-white/10">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] text-mint/60 font-semibold">{g.funder}</p>
                          <p className="text-xs font-bold text-white leading-tight">{g.title}</p>
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <span className="text-[10px] bg-white/15 text-white px-2 py-0.5 rounded-full font-medium">✦ {g.score}% match</span>
                            <span className="text-[9px] bg-white/10 text-mint/70 px-1.5 py-0.5 rounded-full">{g.type}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${g.tagColor}`}>{g.tag}</span>
                          </div>
                        </div>
                        <p className="text-xs font-bold text-gold flex-shrink-0">{g.amount}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-mint/50 mt-3 text-center">Showing 3 of 31 matched results across 6 funding types</p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ══ FEATURE 3: PERSONALISATION ════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

          <motion.div {...fadeInView()}>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
              🎯 Feature 2 · Personalisation
            </span>
            <h2 className="mt-4 text-3xl leading-tight md:text-4xl">
              Results that get sharper<br />every time you use it
            </h2>
            <p className="mt-4 text-lg text-mid leading-relaxed">
              Complete your profile and every result gets a smart match score across 5 dimensions — structure, sector, geography, stage, and mission. Rate results with a thumbs up or down to refine your matches over time.
            </p>
            <p className="mt-3 text-sm font-medium text-forest">
              Every recommendation is explained — tap any match score to see exactly why it was suggested.
            </p>
            <ul className="mt-5 space-y-3">
              {[
                { icon: '🧠', text: 'Profile-based matching across 5 dimensions: sector, eligibility, geography, size and mission' },
                { icon: '👍', text: 'Rate results to refine your matches — liked results surface more like them, dislikes suppress poor fits' },
                { icon: '📊', text: 'Tap any match score to see a full breakdown — sector, eligibility, geography, size, mission fit' },
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
                    { label: 'Structure', score: 95 },
                    { label: 'Sector', score: 92 },
                    { label: 'Mission', score: 90 },
                    { label: 'Geography', score: 88 },
                    { label: 'Stage', score: 82 },
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
              <p className="text-[10px] text-center text-light">👍 on a result — the more you use it, the better it gets</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ══ FEATURE 4: PIPELINE ═══════════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

          {/* Pipeline mockup */}
          <motion.div {...fadeInView()}>
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
                  { label: 'Identified', color: 'border-mid text-mid', cards: 2 },
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

          <motion.div {...fadeInView(0.15)}>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">
              📋 Feature 3 · Pipeline & Alerts
            </span>
            <h2 className="mt-4 text-3xl leading-tight md:text-4xl">
              Track every application.<br />Never miss a deadline.
            </h2>
            <p className="mt-4 text-lg text-mid leading-relaxed">
              Move opportunities from Identified → Researching → Applying → Submitted → Won with a simple drag-and-drop board. Email alerts notify you when new funding matches your profile — and urgency flags surface anything closing within 14 days before it&apos;s too late.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                { icon: '📊', text: 'Visual kanban board — see the full picture at a glance, not buried in a spreadsheet' },
                { icon: '✏️', text: 'Per-card writing tracker from first draft to final submission' },
                { icon: '📝', text: 'Notes, funder contacts, deadlines and grant URLs all on the card' },
                { icon: '💷', text: 'Total pipeline value so you always know what funding is in play' },
                { icon: '📧', text: 'Email alerts when new funding matches your profile — weekly digest or instant' },
                { icon: '⚠', text: 'Urgency flags surface grants closing within 14 days before it\'s too late' },
              ].map(item => (
                <li key={item.text} className="flex items-start gap-3 text-sm text-mid">
                  <span className="flex-shrink-0 mt-0.5">{item.icon}</span>
                  {item.text}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </section>

      {/* ══ COMPARISON ════════════════════════════════════════════════════════ */}
      <section id="compare" className="max-w-4xl mx-auto px-6 pb-24 scroll-mt-20">
        <motion.div {...fadeInView()} className="text-center mb-12">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
            📊 Compare
          </span>
          <h2 className="mt-4 text-3xl md:text-4xl">How Grant Tracker compares</h2>
          <p className="mt-3 text-mid max-w-xl mx-auto">Built for CICs and social enterprises — not an afterthought in a charity database.</p>
        </motion.div>
        <motion.div {...fadeInView(0.15)}>
          <div className="rounded-2xl border border-warm bg-white overflow-hidden shadow-warm">
            {/* Header */}
            <div className="grid grid-cols-3 gap-0 border-b border-warm bg-warm/30 px-6 py-4">
              <div className="text-sm font-medium text-mid">Feature</div>
              <div className="text-center text-sm font-bold text-forest">Grant Tracker</div>
              <div className="text-center text-sm font-medium text-mid">My Funding Central / Charity Excellence</div>
            </div>
            {/* Rows */}
            {[
              { feature: 'UK grant database',                            gt: true,  other: true  },
              { feature: 'Human-curated listings',                       gt: true,  other: true  },
              { feature: 'Email funding alerts',                         gt: true,  other: true  },
              { feature: 'Legal structure eligibility matching',         gt: true,  other: false },
              { feature: 'CIC & social enterprise focus',                gt: true,  other: false },
              { feature: 'Soft matching for Ltd companies with mission', gt: true,  other: false },
              { feature: '6 funding types (not just grants)',            gt: true,  other: false },
              { feature: 'AI match scoring with breakdown',              gt: true,  other: false },
              { feature: 'Pipeline & deadline tracking',                 gt: true,  other: false },
              { feature: '12 impact sectors',                            gt: true,  other: false },
            ].map((row, i) => (
              <div
                key={row.feature}
                className={`grid grid-cols-3 gap-0 px-6 py-3.5 ${i < 9 ? 'border-b border-warm' : ''}`}
              >
                <div className="text-sm text-charcoal">{row.feature}</div>
                <div className="flex justify-center">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-forest/10">
                    <Check className="h-3.5 w-3.5 text-forest" />
                  </div>
                </div>
                <div className="flex justify-center">
                  {row.other ? (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-warm">
                      <Check className="h-3.5 w-3.5 text-mid" />
                    </div>
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-50">
                      <X className="h-3.5 w-3.5 text-red-400" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ══ ABOUT ══════════════════════════════════════════════════════════════ */}
      <section id="about" className="max-w-6xl mx-auto px-6 pb-24 scroll-mt-20">
        <motion.div {...fadeInView()} className="text-center mb-12">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
            🌱 About
          </span>
          <h2 className="mt-4 text-3xl md:text-4xl">
            Built for the people doing the work
          </h2>
          <p className="mt-3 text-mid max-w-lg mx-auto">
            Grant Tracker exists to help mission-driven organisations spend less time searching for funding and more time delivering impact.
          </p>
        </motion.div>

        {/* Persona cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 mb-16">
          {[
            { emoji: '🏗️', label: 'CICs',                desc: 'Access grants, accelerators, and social investment matched specifically to your CIC structure — no more filtering out results meant for charities.' },
            { emoji: '⚡', label: 'Social Enterprises',  desc: 'Ltd company with a social mission? Soft matching surfaces relevant opportunities even without CIC or charity status.' },
            { emoji: '🤝', label: 'Co-operatives & CBS', desc: 'Find the community finance, blended funding, and sector-specific grants that fit your mutual structure and democratic model.' },
            { emoji: '🏠', label: 'Charities & CIOs',    desc: 'Go beyond trusts and foundations. If your charity works across health, creative industries, environment, or tech, you\'re eligible for more than a single-sector database shows. Pipeline tracking and deadline alerts replace the spreadsheet.' },
            { emoji: '💡', label: 'Impact Founders',     desc: 'Grants, accelerators, diversity funds, and interest-free loans — matched to your stage, sector, and founding team.' },
            { emoji: '🌱', label: 'Community Groups',    desc: 'Find local and national funding that fits your size, area, and cause — including hyper-local funders most platforms miss.' },
          ].map((item, i) => (
            <motion.div key={item.label} {...fadeInView(i * 0.08)} className="bg-white rounded-2xl p-5 shadow-card text-center border border-warm hover:shadow-warm transition-shadow">
              <div className="text-3xl mb-3">{item.emoji}</div>
              <p className="font-serif font-bold text-forest text-sm mb-1.5">{item.label}</p>
              <p className="text-sm text-mid leading-normal">{item.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Founder story */}
        <motion.div {...fadeInView(0.2)} className="rounded-3xl bg-forest p-10 max-w-2xl mx-auto">
          <blockquote className="font-serif text-xl text-white font-semibold leading-snug mb-8 border-l-4 border-white/40 pl-5">
            &ldquo;Finding the right grant has always been harder than it should be. The tools that existed were too expensive, too generic, and built for organisations with a dedicated grants team — not for the people actually doing the work.&rdquo;
          </blockquote>
          <div className="space-y-4 text-sm leading-relaxed">
            <div className="border-l-2 border-red-400 pl-4">
              <p className="text-red-300 font-semibold mb-1 text-xs uppercase tracking-wide">Searching shouldn&apos;t mean guessing</p>
              <p className="text-white/80">
                You search one database for grants, another for accelerators, another for social investment — and most results are irrelevant to your size, sector, or structure. Grant Tracker brings it all together and matches it to what you actually do.
              </p>
            </div>
            <div className="border-l-2 border-emerald-400 pl-4">
              <p className="text-emerald-300 font-semibold mb-1 text-xs uppercase tracking-wide">Stop reading criteria that were never meant for you</p>
              <p className="text-white/80">
                Too many people read pages of criteria, start an application, then discover their legal structure or income band rules them out. Grant Tracker filters results to your profile from the start — so you see fewer dead ends and spend more time on funding you can actually win.
              </p>
            </div>
            <div className="border-l-2 border-sky-400 pl-4">
              <p className="text-white/80">
                Whether you&apos;re a CIC, charity, social enterprise, co-op, or just getting started — Grant Tracker helps you find funding faster and waste less time on the ones you were never going to get.
              </p>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ══ STATS ═════════════════════════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <motion.div {...fadeInView()} className="bg-forest/8 rounded-2xl p-8 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center border border-forest/10">
          {[
            { stat: '800+', label: 'Funding opportunities across all 6 types' },
            { stat: '6',    label: 'Funding types — grants, accelerators, investment & more' },
            { stat: '12',   label: 'Impact sectors covered' },
            { stat: 'Free', label: 'to search — no credit card required' },
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
              &ldquo;As a CIC we kept being told we weren&apos;t eligible for charity grants. Grant Tracker finally shows us what we can actually apply for — including accelerators and diversity funds we&apos;d never heard of.&rdquo;
            </blockquote>
            <div className="flex items-center justify-center gap-3">
              <div className="w-9 h-9 rounded-full bg-sage/20 flex items-center justify-center text-sage font-bold text-sm flex-shrink-0">M</div>
              <div className="text-left">
                <p className="text-sm font-semibold text-forest">Marcus</p>
                <p className="text-xs text-mid">Director, community tech CIC, Manchester</p>
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
              ✉️ Contact
            </span>
            <h2 className="mt-4 text-3xl">Get in touch</h2>
            <p className="mt-3 text-lg text-mid leading-relaxed">
              Have a question, partnership idea, or just want to say hello? We&apos;d love to hear from you.
            </p>

            <div className="mt-8 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest/10 text-forest flex-shrink-0">
                  <Mail size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-charcoal">Email us</p>
                  <a href="mailto:hello@granttracker.co.uk" className="text-sm text-forest hover:underline">
                    hello@granttracker.co.uk
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest/10 text-forest flex-shrink-0">
                  <MessageSquare size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-charcoal">Response time</p>
                  <p className="text-sm text-mid">Usually within 24 hours</p>
                </div>
              </div>
            </div>
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
              🇬🇧 Built for CICs, social enterprises, charities, co-operatives &amp; impact founders across the UK
            </div>
            <h2 className="relative text-3xl text-white md:text-5xl">
              Ready to find funding<br />
              <span className="italic">matched to your structure?</span>
            </h2>
            <p className="relative mx-auto mt-4 max-w-lg text-white/80">
              Join CICs, social enterprises, charities, co-operatives, and impact founders already using Grant Tracker to find and win funding that actually fits.
            </p>
            <div className="relative mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link href="/auth/signup" className="btn-gold px-12 py-3.5 text-base font-semibold">
                Create free account →
              </Link>
              <span className="text-sm text-white/70">No credit card required</span>
            </div>
            <p className="relative text-xs text-white/40 mt-5">Free to search · Live Search and pipeline tools from £11/month · Cancel anytime</p>
            <p className="relative text-xs text-white/30 mt-2">🔒 Your data is only used to improve your own matches — never used to train external models, never shared with funders, never sold.</p>
          </div>
        </motion.div>
      </section>

      {/* ══ FOOTER ════════════════════════════════════════════════════════════ */}
      <footer className="border-t border-warm py-10 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-6">
            <a href="/" className="flex items-center gap-0.5">
              <span className="font-serif text-xl text-forest italic">Grant</span>
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
            <p className="text-xs text-light">© {new Date().getFullYear()} Grant Tracker · Funding discovery for CICs, social enterprises, charities &amp; impact founders</p>
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
