'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Menu, X, Target, ClipboardList, Bell, Layers, Check, Search } from 'lucide-react'
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
  { label: 'How it works', href: '#how' },
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'About', href: '#about' },
  { label: 'Contact', href: '#contact' },
]

/* ─── demo data ─── */
const demoResults = [
  {
    title: 'Grow to Give — Community Growing Grants',
    funder: 'London Community Foundation',
    amount: 'Up to £8,000',
    tags: [
      { text: 'South London', cls: 'bg-sage/10 text-forest' },
      { text: 'Closes Apr 15', cls: 'bg-gold/10 text-gold' },
      { text: 'Environment', cls: 'bg-warm text-mid' },
    ],
    match: 94,
  },
  {
    title: 'Small Grants for Green Spaces',
    funder: 'National Lottery Community Fund',
    amount: '£1,000 – £10,000',
    tags: [
      { text: 'All UK', cls: 'bg-sage/10 text-forest' },
      { text: 'Rolling', cls: 'bg-gold/10 text-gold' },
    ],
    match: 87,
  },
  {
    title: 'Southwark Community Fund',
    funder: 'Southwark Council',
    amount: 'Up to £5,000',
    tags: [
      { text: 'Southwark', cls: 'bg-sage/10 text-forest' },
      { text: 'Closes May 1', cls: 'bg-gold/10 text-gold' },
      { text: 'Community', cls: 'bg-warm text-mid' },
    ],
    match: 82,
  },
]

export default function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [demoVisible, setDemoVisible] = useState<boolean[]>([false, false, false])
  const [matchWidths, setMatchWidths] = useState<number[]>([0, 0, 0])

  const playDemo = () => {
    setDemoVisible([false, false, false])
    setMatchWidths([0, 0, 0])
    demoResults.forEach((r, i) => {
      setTimeout(() => {
        setDemoVisible(prev => { const n = [...prev]; n[i] = true; return n })
        setTimeout(() => {
          setMatchWidths(prev => { const n = [...prev]; n[i] = r.match; return n })
        }, 200)
      }, 400 + i * 280)
    })
  }

  useEffect(() => {
    const t = setTimeout(playDemo, 900)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
          <a href="/" className="flex items-center gap-2.5">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-forest text-white overflow-hidden flex-shrink-0">
              <Search size={16} />
              <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-gold border-2 border-cream" />
            </div>
            <span className="font-serif text-xl text-charcoal">Grant Tracker</span>
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
            <Link href="/auth/login" className="text-sm font-medium text-mid hover:text-charcoal transition-colors">Sign in</Link>
            <Link href="/auth/signup" className="btn-primary px-5 py-2.5 text-sm font-semibold">Get started free →</Link>
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
                <Link href="/auth/signup" className="btn-primary btn-sm text-center">Get started free →</Link>
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
          {/* Badge with pulsing dot */}
          <motion.div
            {...fadeUp(0.1)}
            className="mb-8 inline-flex items-center gap-2 rounded-full border border-sage/30 bg-sage/10 px-4 py-2 text-sm font-semibold text-forest"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sage opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sage" />
            </span>
            AI-powered grant discovery for UK organisations
          </motion.div>

          {/* Heading */}
          <motion.h1
            {...fadeUp(0.2)}
            className="text-5xl leading-tight md:text-7xl md:leading-[1.1]"
          >
            <span className="block">
              Find the{' '}
              <span
                style={{
                  backgroundImage: 'linear-gradient(transparent 76%, rgba(232,114,92,0.45) 76%)',
                  paddingLeft: '3px',
                  paddingRight: '3px',
                }}
              >
                perfect grant
              </span>
              {' '}for
            </span>
            <span className="block">your cause or venture</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            {...fadeUp(0.35)}
            className="mx-auto mt-6 max-w-2xl text-lg text-mid md:text-xl"
          >
            Search grants, accelerators, social investment, diversity funds and support programmes — all filtered to your legal structure, sector and stage. Built for the UK.
          </motion.p>

          {/* CTAs */}
          <motion.div
            {...fadeUp(0.5)}
            className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
          >
            <Link href="/auth/signup" className="btn-primary px-10 py-3.5 text-base font-semibold">
              Start for free →
            </Link>
            <a
              href="#how"
              className="rounded-full border border-warm bg-white px-7 py-3.5 text-base font-semibold text-charcoal transition-all hover:border-sage/50 hover:shadow-warm"
            >
              See how it works
            </a>
          </motion.div>

          <motion.p {...fadeUp(0.6)} className="mt-4 text-sm text-light">
            No credit card required · Free tier always available
          </motion.p>

          {/* Feature pillars */}
          <motion.div
            {...fadeUp(0.65)}
            className="mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-4 md:grid-cols-4"
          >
            {[
              { icon: Layers, stat: '7 Funding Types', label: 'grants, programmes, investment & more' },
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
                <span className="text-xs text-mid text-center">{item.label}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══ DEMO CARD ════════════════════════════════════════════════════════ */}
      <section className="mx-auto max-w-4xl px-6 pb-20">
        <motion.div
          {...fadeUp(0.8)}
          className="overflow-hidden rounded-3xl border border-warm/60 bg-white shadow-card-lg"
        >
          {/* Browser chrome */}
          <div className="flex items-center gap-2 border-b border-warm bg-warm/30 px-5 py-3.5">
            <span className="h-3 w-3 rounded-full bg-[#ff6b6b]" />
            <span className="h-3 w-3 rounded-full bg-[#ffd93d]" />
            <span className="h-3 w-3 rounded-full bg-[#6bcb77]" />
            <span className="mx-auto text-xs font-medium text-light">granttracker.co.uk/search</span>
          </div>
          <div className="p-8">
            {/* Search row */}
            <div className="mb-6 flex gap-3">
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-warm bg-cream px-4 py-3 text-sm text-mid">
                <Search size={15} className="flex-shrink-0 text-light" />
                Community garden project in South London
              </div>
              <button
                onClick={playDemo}
                className="flex items-center gap-2 whitespace-nowrap rounded-xl bg-forest px-5 py-3 text-sm font-semibold text-white transition-all hover:bg-sage"
              >
                Search →
              </button>
            </div>
            {/* Results */}
            <div className="space-y-3">
              {demoResults.map((r, i) => (
                <div
                  key={r.title}
                  className="rounded-xl border border-warm bg-cream/50 p-4 transition-all duration-500"
                  style={{
                    opacity: demoVisible[i] ? 1 : 0,
                    transform: demoVisible[i] ? 'translateY(0)' : 'translateY(12px)',
                  }}
                >
                  <div className="mb-1.5 flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-forest">{r.title}</p>
                    <p className="flex-shrink-0 text-sm font-bold text-gold">{r.amount}</p>
                  </div>
                  <p className="mb-2 text-xs text-light">{r.funder}</p>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {r.tags.map(t => (
                      <span key={t.text} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${t.cls}`}>
                        {t.text}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-warm">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sage to-forest transition-all duration-1000"
                        style={{ width: `${matchWidths[i]}%` }}
                      />
                    </div>
                    <span className="min-w-[32px] text-right text-xs font-bold text-forest">
                      {r.match}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* ══ HOW IT WORKS ═════════════════════════════════════════════════════ */}
      <section id="how" className="mx-auto max-w-6xl px-6 pb-24 scroll-mt-20">
        <motion.div {...fadeInView()} className="mb-12">
          <span className="mb-3 inline-block text-xs font-bold uppercase tracking-widest text-gold">
            How It Works
          </span>
          <h2 className="mb-4 text-4xl leading-tight text-charcoal md:text-5xl">
            Set up once. Find everything.<br />Track what matters.
          </h2>
          <p className="max-w-lg text-lg text-mid">
            We&apos;ve made grant discovery as simple as asking a question. Here&apos;s how Grant Tracker works for you.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { icon: '👤', title: 'Set up your profile', desc: 'Tell us your legal structure, sector, stage, and location. Takes about 5 minutes.', iconBg: 'bg-sage/10 text-forest border-sage/30' },
            { icon: '🔍', title: 'Search funding', desc: 'Search naturally across grants, accelerators, social investment, and more in one place.', iconBg: 'bg-sky-500/10 text-sky-600 border-sky-400/30' },
            { icon: '✦', title: 'See your matches', desc: 'Results are ranked by how well they fit your profile — structure, sector, stage, and mission.', iconBg: 'bg-emerald-500/10 text-emerald-600 border-emerald-400/30' },
            { icon: '📋', title: 'Add to pipeline', desc: 'Track each application from first contact to submission on a simple visual board.', iconBg: 'bg-gold/10 text-gold border-gold/30' },
            { icon: '🔔', title: 'Get alerts', desc: 'Weekly or instant email alerts when new funding matches your profile.', iconBg: 'bg-purple-400/10 text-purple-500 border-purple-400/30' },
          ].map((step, i) => (
            <motion.div
              key={step.title}
              {...fadeInView(i * 0.1)}
              className="relative rounded-2xl border border-warm bg-white p-6 transition-all hover:-translate-y-1 hover:shadow-warm"
            >
              <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl border text-xl ${step.iconBg}`}>
                {step.icon}
              </div>
              <div className={`absolute right-5 top-5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${step.iconBg}`}>
                {i + 1}
              </div>
              <h3 className="mb-2 font-serif text-base font-semibold text-charcoal">{step.title}</h3>
              <p className="text-sm leading-relaxed text-mid">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ══ COVERAGE & FUNDING TYPES ═════════════════════════════════════════ */}
      <section id="coverage" className="pb-24 pt-8">
        <div className="mx-auto max-w-6xl px-6">
          <motion.div {...fadeInView(0)} className="mb-12">
            <span className="mb-3 inline-block text-xs font-bold uppercase tracking-widest text-gold">
              7 Funding Types
            </span>
            <h2 className="mb-5 text-4xl leading-tight md:text-5xl">
              Not just grants —<br />
              <span className="text-gradient-warm italic">the full picture</span>
            </h2>
            <p className="max-w-2xl text-lg text-mid">
              Most platforms only index grants. Grant Tracker covers 7 funding types — including accelerators, diversity funds, and support programmes. That&apos;s 300–500 additional opportunities completely invisible on every other platform.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { emoji: '🎯', title: 'Grants & Awards', desc: 'National Lottery, trusts, foundations, Innovate UK, arts councils, and government programmes — each tagged with eligible legal structures.', badge: '£300 – £500k+', journey: '🔍 Search & apply', jc: 'bg-forest/10 text-forest', delay: 0.1 },
              { emoji: '🚀', title: 'Accelerators & Programmes', desc: 'Equity-free programmes with mentoring, workspace and networks. UnLtd, SSE, Foundervine, Hatch, Creative UK and more — with clear application windows.', badge: 'Programme + grant', journey: '🔍 Search & apply', jc: 'bg-forest/10 text-forest', delay: 0.2 },
              { emoji: '🌈', title: 'Diversity-Targeted Funds', desc: 'Women in Innovation, Black Seed, Foundervine, and more. The fastest-growing category — zero overlap with general grant databases.', badge: '£5k – £250k', journey: '🔍 Search & apply', jc: 'bg-forest/10 text-forest', delay: 0.3 },
              { emoji: '🎓', title: 'Support Programmes & Training', desc: 'Capacity building, fellowships, mentoring, incubators and training — from Lloyds Bank Foundation Enhance to NCVO and local CVS networks. Near-zero overlap with any grant database.', badge: 'Capacity building', journey: '📋 Self-enrol / apply', jc: 'bg-sage/10 text-sage', delay: 0.4 },
              { emoji: '💰', title: 'Social Investment', desc: 'We profile major social lenders — Big Issue Invest, Charity Bank, Resonance — so you know who funds what before you reach out.', badge: '£20k – £3m', journey: '📖 Provider profiles', jc: 'bg-sky-500/10 text-sky-600', delay: 0.5 },
              { emoji: '🔗', title: 'Blended & Matched Funding', desc: 'Programmes like SSE Match Trading and Power to Change — part grant, part loan. Real listings, not theoretical mechanisms.', badge: 'Selected programmes', journey: '🔍 Selected listings', jc: 'bg-forest/10 text-forest', delay: 0.6 },
              { emoji: '🛠️', title: 'In-Kind & Sector Reliefs', desc: 'Tech credits, tax reliefs, and in-kind support explained — including who\'s actually eligible. Beyond cash grants.', badge: 'Guides & resources', journey: '📚 Guides section', jc: 'bg-gold/10 text-gold', delay: 0.7 },
            ].map((item) => (
              <motion.div
                key={item.title}
                {...fadeInView(item.delay)}
                className="flex gap-3 rounded-2xl border border-warm bg-white p-4 transition-all hover:border-forest/20 hover:shadow-warm"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-forest/10 text-lg">
                  {item.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-charcoal">{item.title}</span>
                    <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[11px] font-medium text-forest/80">{item.badge}</span>
                  </div>
                  <p className="mb-2 text-xs leading-relaxed text-mid">{item.desc}</p>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.jc}`}>{item.journey}</span>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Sector strip */}
          <motion.div {...fadeInView(0.2)} className="mt-8 rounded-2xl border border-warm bg-white p-6">
            <p className="mb-4 text-sm font-semibold text-charcoal">Covering 12 impact sectors</p>
            <div className="flex flex-wrap gap-2">
              {[
                '🎨 Creative Industries', '🌿 Environment & Climate', '🧠 Health & Wellbeing',
                '📖 Education & Skills', '💻 Tech for Good', '🏠 Housing & Homelessness',
                '🍽️ Food & Agriculture', '💼 Employment', '🤝 Community Development',
                '⚖️ Justice & Rights', '🏦 Financial Inclusion', '🌍 International',
              ].map(sector => (
                <span key={sector} className="rounded-lg border border-warm bg-cream px-3 py-1.5 text-xs font-medium text-mid">
                  {sector}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-light">From film funding to blockchain grants, community energy to legal aid — matched to your structure, stage, and mission.</p>
          </motion.div>
        </div>
      </section>

      {/* ══ FEATURE 1: SEARCH & MATCH ════════════════════════════════════════ */}
      <section id="features" className="mx-auto max-w-6xl px-6 pb-24 scroll-mt-20">
        <div className="rounded-3xl bg-forest px-8 py-16">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">

            {/* Text */}
            <motion.div {...fadeInView()}>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-mint">
                ✦ Feature 1 · Search & Match
              </span>
              <h2 className="mt-4 text-3xl leading-tight text-white md:text-4xl">
                Search everything.<br />See only what fits.
              </h2>
              <p className="mt-4 leading-relaxed text-mint/80">
                Tell us your structure and sector once. We filter out everything you&apos;re not eligible for before you even see results — no more reading criteria pages for funding you were never going to get.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  'Profile-based filtering — your structure, stage and sector shape every result',
                  'Live Search — surfaces matching funding across all seven types in real time',
                  'Match scores ranked by structure, sector, geography, stage and mission',
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
              <div className="rounded-2xl border border-white/20 bg-white/10 p-5">
                <div className="mb-4 flex gap-2">
                  <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-3 py-2.5">
                    <span className="text-sm text-mint/50">🔍</span>
                    <span className="text-sm text-mint/60">circular economy Birmingham CIC</span>
                  </div>
                  <div className="flex items-center whitespace-nowrap rounded-xl bg-white px-3 py-2 text-xs font-bold text-forest">
                    ✦ Live Search
                  </div>
                </div>
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {['All types', '🎯 Grants', '🚀 Accelerators', '💰 Social Investment'].map((f, i) => (
                    <span
                      key={f}
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${i === 0 ? 'border-white/30 bg-white/20 text-white' : 'border-white/15 text-white/50'}`}
                    >
                      {f}
                    </span>
                  ))}
                  <span className="rounded-full border border-gold/30 bg-gold/20 px-2.5 py-1 text-[10px] font-medium text-gold">
                    🆕 New this week 17
                  </span>
                </div>
                <div className="space-y-2.5">
                  {[
                    { funder: 'Ashden Awards', title: 'UK Climate Solutions Award', amount: '£10k–£40k', score: 96, type: '🎯 Grant', tag: 'CIC eligible', tagColor: 'bg-emerald-500/20 text-emerald-300' },
                    { funder: 'Creative UK / Innovate UK', title: 'Green Economy Innovation Fund', amount: '£25k–£100k', score: 88, type: '🔀 Blended', tag: 'Social enterprise accepted', tagColor: 'bg-gold/20 text-gold' },
                    { funder: 'UnLtd / Big Issue Invest', title: 'Social Entrepreneur Award', amount: 'Up to £15k', score: 81, type: '🚀 Accelerator', tag: 'CIC & unincorporated eligible', tagColor: 'bg-emerald-500/20 text-emerald-300' },
                  ].map(g => (
                    <div key={g.title} className="rounded-xl border border-white/10 bg-white/10 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold text-mint/60">{g.funder}</p>
                          <p className="text-xs font-bold leading-tight text-white">{g.title}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white">✦ {g.score}% match</span>
                            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] text-mint/70">{g.type}</span>
                            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${g.tagColor}`}>{g.tag}</span>
                          </div>
                        </div>
                        <p className="flex-shrink-0 text-xs font-bold text-gold">{g.amount}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-center text-[10px] text-mint/50">Showing 3 of 31 matched results across 6 funding types</p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ══ FEATURE 2: PERSONALISATION ════════════════════════════════════════ */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">

          <motion.div {...fadeInView()}>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
              🎯 Feature 2 · Personalisation
            </span>
            <h2 className="mt-4 text-3xl leading-tight md:text-4xl">
              Every result scored.<br />Not just listed.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-mid">
              Complete your profile once and every opportunity is ranked across structure, sector, geography, stage and mission — so the funding you&apos;re most likely to win floats straight to the top.
            </p>
            <ul className="mt-5 space-y-3">
              {[
                { icon: '🧠', text: 'Match scores across 5 dimensions: structure, sector, geography, stage and mission' },
                { icon: '👍', text: 'Rate results to refine future matches — the more you use it, the better it gets' },
                { icon: '📊', text: 'Tap any score for a full breakdown — see exactly why a result was suggested' },
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
            <div className="space-y-3 rounded-2xl border border-warm bg-white p-5 shadow-card-lg">
              <div className="rounded-xl border border-gold/30 bg-gold/5 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-charcoal">Match quality</span>
                  <span className="font-serif text-2xl font-bold text-gold">60%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-warm">
                  <div className="h-2 w-[60%] rounded-full bg-gold" />
                </div>
                <p className="mt-2 text-xs text-mid">Annual income, primary location missing from your profile</p>
                <span className="mt-1 inline-block cursor-pointer text-xs font-bold text-gold">Complete profile →</span>
              </div>

              <div className="rounded-xl border border-warm bg-cream/50 p-4">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-semibold text-mid">Esmée Fairbairn Foundation</p>
                    <p className="text-sm font-bold text-forest">Main Grants Programme</p>
                  </div>
                  <span className="flex-shrink-0 font-serif text-lg font-bold text-forest">✦ 91%</span>
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

              <div className="flex items-start justify-between gap-2 rounded-xl border border-warm bg-white p-3">
                <div>
                  <p className="text-[10px] font-semibold text-mid">UnLtd</p>
                  <p className="text-xs font-bold text-forest">Award for Social Entrepreneurs</p>
                </div>
                <span className="flex-shrink-0 rounded-full bg-forest/10 px-2 py-0.5 text-xs font-bold text-forest">✦ 84%</span>
              </div>
              <p className="text-center text-[10px] text-light">👍 on a result — the more you use it, the better it gets</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ══ FEATURE 3: PIPELINE ═══════════════════════════════════════════════ */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">

          {/* Pipeline mockup */}
          <motion.div {...fadeInView()}>
            <div className="rounded-2xl border border-warm bg-white p-5 shadow-card-lg">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="font-serif text-sm font-bold text-forest">Funding Pipeline</p>
                  <p className="text-xs text-mid">7 opportunities tracked</p>
                </div>
                <span className="rounded-full bg-gold/10 px-3 py-1 text-xs font-bold text-gold">£187,500 active</span>
              </div>
              <div className="mb-3 grid grid-cols-6 gap-1.5">
                {[
                  { label: 'Identified', color: 'border-mid text-mid', cards: 2 },
                  { label: 'Researching', color: 'border-gold text-gold', cards: 1 },
                  { label: 'Applying', color: 'border-sage text-sage', cards: 2 },
                  { label: 'Submitted', color: 'border-forest text-forest', cards: 1 },
                  { label: 'Won', color: 'border-emerald-500 text-emerald-600', cards: 1 },
                  { label: 'Declined', color: 'border-red-300 text-red-400', cards: 0 },
                ].map(col => (
                  <div key={col.label} className="min-h-[80px] rounded-xl bg-warm/40 p-1.5">
                    <p className={`mb-1.5 border-b pb-1 text-[8px] font-bold uppercase tracking-wide ${col.color}`}>{col.label}</p>
                    <div className="space-y-1">
                      {Array.from({ length: col.cards }).map((_, i) => (
                        <div key={i} className="rounded-lg border-l-2 border-sage bg-white p-1 shadow-sm">
                          <div className="mb-1 h-1.5 w-full rounded bg-warm" />
                          <div className="h-1 w-2/3 rounded bg-gold/30" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-sage/20 bg-forest/[0.03] p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-semibold text-mid">Paul Hamlyn Foundation</p>
                    <p className="text-xs font-bold text-forest">Youth Fund 2025</p>
                    <p className="mt-0.5 text-[10px] text-mid">⚠ Deadline: 15 Mar 2025</p>
                  </div>
                  <p className="text-sm font-bold text-gold">£30k</p>
                </div>
                <div className="mt-2">
                  <div className="mb-0.5 flex justify-between text-[9px] text-mid">
                    <span>✏️ First draft</span><span>50%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-warm">
                    <div className="h-full w-1/2 rounded-full bg-sage" />
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
            <p className="mt-4 text-lg leading-relaxed text-mid">
              A drag-and-drop board keeps every application visible, from first contact to submission. Urgency flags surface anything closing within 14 days. Alerts fire the moment new funding matches your profile.
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
                  <span className="mt-0.5 flex-shrink-0">{item.icon}</span>
                  {item.text}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </section>

      {/* ══ COMPARISON ════════════════════════════════════════════════════════ */}
      <section id="compare" className="mx-auto max-w-4xl px-6 pb-24 scroll-mt-20">
        <motion.div {...fadeInView()} className="mb-12 text-center">
          <span className="mb-3 inline-block text-xs font-bold uppercase tracking-widest text-gold">Compare</span>
          <h2 className="mt-2 text-3xl text-charcoal md:text-4xl">How Grant Tracker compares</h2>
          <p className="mx-auto mt-3 max-w-xl text-mid">The only platform that covers grants AND support programmes — not bolted on as an afterthought.</p>
        </motion.div>
        <motion.div {...fadeInView(0.15)}>
          <div className="overflow-hidden rounded-2xl border border-warm bg-white shadow-warm">
            <div className="grid grid-cols-3 gap-0 border-b border-warm bg-warm/30 px-6 py-4">
              <div className="text-sm font-medium text-mid">Feature</div>
              <div className="text-center text-sm font-bold text-forest">Grant Tracker</div>
              <div className="text-center text-sm font-medium text-mid">My Funding Central / Charity Excellence</div>
            </div>
            {[
              { feature: 'UK grant database', gt: true, other: true },
              { feature: 'Human-curated listings', gt: true, other: true },
              { feature: 'Email funding alerts', gt: true, other: true },
              { feature: 'Legal structure eligibility matching', gt: true, other: false },
              { feature: 'CIC & social enterprise focus', gt: true, other: false },
              { feature: 'Soft matching for Ltd companies with mission', gt: true, other: false },
              { feature: 'Support programmes, training & capacity building', gt: true, other: false },
              { feature: '7 funding types (not just grants)', gt: true, other: false },
              { feature: 'AI match scoring with breakdown', gt: true, other: false },
              { feature: 'Pipeline & deadline tracking', gt: true, other: false },
              { feature: '12 impact sectors', gt: true, other: false },
            ].map((row, i) => (
              <div
                key={row.feature}
                className={`grid grid-cols-3 gap-0 px-6 py-3.5 ${i < 10 ? 'border-b border-warm' : ''}`}
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
      <section id="about" className="mx-auto max-w-6xl px-6 pb-24 scroll-mt-20">
        <motion.div {...fadeInView()} className="mb-12 text-center">
          <span className="mb-3 inline-block text-xs font-bold uppercase tracking-widest text-gold">About</span>
          <h2 className="mt-2 text-3xl text-charcoal md:text-4xl">Built for the people doing the work</h2>
          <p className="mx-auto mt-3 max-w-lg text-mid">
            A dedicated grants team is a luxury most organisations can&apos;t afford. Grant Tracker gives you the tools they use — at a price that makes sense.
          </p>
        </motion.div>

        {/* Persona cards */}
        <div className="mb-16 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[
            { emoji: '🏗️', label: 'CICs', desc: 'Grants, accelerators, and social investment matched to your structure — no more results built for charities.' },
            { emoji: '⚡', label: 'Social Enterprises', desc: 'Ltd company with a mission? Soft matching surfaces opportunities even without CIC or charity status.' },
            { emoji: '🤝', label: 'Co-operatives & CBS', desc: 'Community finance, blended funding, and grants that fit your mutual structure.' },
            { emoji: '🏠', label: 'Charities & CIOs', desc: 'Go beyond trusts and foundations — pipeline tracking and alerts replace the spreadsheet.' },
            { emoji: '💡', label: 'Impact Founders', desc: 'Grants, accelerators, and diversity funds matched to your stage, sector, and team.' },
            { emoji: '🌱', label: 'Community Groups', desc: 'Local and national funding matched to your size, area, and cause.' },
          ].map((item, i) => (
            <motion.div
              key={item.label}
              {...fadeInView(i * 0.08)}
              className="rounded-2xl border border-warm bg-white p-5 text-center shadow-card transition-shadow hover:shadow-warm"
            >
              <div className="mb-3 text-3xl">{item.emoji}</div>
              <p className="mb-1.5 font-serif text-sm font-bold text-forest">{item.label}</p>
              <p className="text-sm leading-normal text-mid">{item.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Founder story */}
        <motion.div {...fadeInView(0.2)} className="mx-auto max-w-2xl rounded-3xl bg-forest p-10">
          <blockquote className="mb-8 border-l-4 border-white/40 pl-5 font-serif text-xl font-semibold leading-snug text-white">
            &ldquo;Finding the right grant has always been harder than it should be. The tools that existed were too expensive, too generic, and built for organisations with a dedicated grants team — not for the people actually doing the work.&rdquo;
          </blockquote>
          <div className="space-y-4 text-sm leading-relaxed">
            <div className="border-l-2 border-red-400 pl-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-300">One place for everything</p>
              <p className="text-white/80">Grants, accelerators, social investment, diversity funds and support programmes — brought together and filtered to your structure, sector and stage.</p>
            </div>
            <div className="border-l-2 border-emerald-400 pl-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-300">No more dead ends</p>
              <p className="text-white/80">We filter results to your profile from the start — fewer criteria pages to wade through, more time on funding you can actually win.</p>
            </div>
            <div className="border-l-2 border-sky-400 pl-4">
              <p className="text-white/80">CIC, charity, co-op, social enterprise, or just getting started — stop wasting time on grants you were never going to get.</p>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ══ STATS ═════════════════════════════════════════════════════════════ */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <motion.div {...fadeInView()} className="relative overflow-hidden rounded-3xl bg-forest px-12 py-14">
          <div className="pointer-events-none absolute -right-10 -top-20 h-60 w-60 rounded-full bg-gold/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-60 w-60 rounded-full bg-white/5 blur-3xl" />
          <div className="relative grid grid-cols-2 gap-8 text-center sm:grid-cols-4">
            {[
              { stat: '800+', label: 'Funding opportunities across all 7 types' },
              { stat: '7', label: 'Funding types — grants, programmes, investment & more' },
              { stat: '12', label: 'Impact sectors covered' },
              { stat: 'Free', label: 'to search — no credit card required' },
            ].map(item => (
              <div key={item.stat}>
                <p className="font-serif text-4xl font-bold text-white">{item.stat}</p>
                <p className="mt-2 text-sm leading-snug text-mint/70">{item.label}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ══ PRICING ═══════════════════════════════════════════════════════════ */}
      <section id="pricing" className="mx-auto max-w-5xl px-6 pb-24 scroll-mt-20">
        <motion.div {...fadeInView()} className="mb-12 text-center">
          <span className="mb-3 inline-block text-xs font-bold uppercase tracking-widest text-gold">Pricing</span>
          <h2 className="mt-2 text-3xl text-charcoal md:text-4xl">Plans that respect your budget</h2>
          <p className="mx-auto mt-3 max-w-lg text-mid">
            Start free. Upgrade when you need AI-powered search to find grants faster.
          </p>
        </motion.div>
        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-3">
          {/* Free */}
          <motion.div {...fadeInView(0.1)} className="rounded-2xl border border-warm bg-white p-8 transition-all hover:-translate-y-1 hover:shadow-warm">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-light">Free</p>
            <p className="font-serif text-5xl leading-none text-charcoal">£0</p>
            <p className="mb-6 mt-1 text-sm text-light">forever</p>
            <ul className="mb-8 space-y-3">
              {['Browse full grant database', 'Filter by region & sector', 'Basic keyword search', 'Weekly email digest'].map(f => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-mid">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-sage/15 text-xs text-forest">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/auth/signup"
              className="block w-full rounded-full border border-warm bg-cream py-3 text-center text-sm font-semibold text-charcoal transition-all hover:border-sage/50 hover:bg-sage/5"
            >
              Get Started
            </Link>
          </motion.div>

          {/* 6 Months — featured */}
          <motion.div {...fadeInView(0.2)} className="relative scale-105 rounded-2xl border-2 border-forest bg-white p-8 shadow-card-lg transition-all hover:-translate-y-1">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gold px-4 py-1 text-xs font-bold text-white">
              Most Popular
            </div>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-light">6 Months</p>
            <p className="font-serif text-5xl leading-none text-charcoal">£65</p>
            <p className="mb-6 mt-1 text-sm text-light">£10.83/month</p>
            <ul className="mb-8 space-y-3">
              {['Everything in Free', 'AI Live Search (3/week)', 'Match scoring & ranking', 'Deadline alerts', 'Priority support'].map(f => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-mid">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-sage/15 text-xs text-forest">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/auth/signup"
              className="block w-full rounded-full bg-forest py-3 text-center text-sm font-semibold text-white transition-all hover:bg-sage"
            >
              Start 6-Month Plan
            </Link>
          </motion.div>

          {/* 12 Months */}
          <motion.div {...fadeInView(0.3)} className="rounded-2xl border border-warm bg-white p-8 transition-all hover:-translate-y-1 hover:shadow-warm">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-light">12 Months</p>
            <p className="font-serif text-5xl leading-none text-charcoal">£115</p>
            <p className="mb-6 mt-1 text-sm text-light">£9.58/month — save 12%</p>
            <ul className="mb-8 space-y-3">
              {['Everything in 6-Month', 'Best value per month', 'Annual grant calendar', 'Early access to new features'].map(f => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-mid">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-sage/15 text-xs text-forest">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/auth/signup"
              className="block w-full rounded-full border border-warm bg-cream py-3 text-center text-sm font-semibold text-charcoal transition-all hover:border-sage/50 hover:bg-sage/5"
            >
              Start Annual Plan
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ══ TESTIMONIALS ══════════════════════════════════════════════════════ */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <motion.div {...fadeInView()} className="mb-12 text-center">
          <span className="mb-3 inline-block text-xs font-bold uppercase tracking-widest text-gold">Trusted by Changemakers</span>
          <h2 className="mt-2 text-3xl text-charcoal md:text-4xl">Loved by small organisations</h2>
        </motion.div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {[
            {
              quote: "As a CIC we kept being told we weren't eligible for charity grants. Grant Tracker finally shows us what we can actually apply for — including accelerators and diversity funds we'd never heard of.",
              name: 'Marcus',
              role: 'Director, community tech CIC, Manchester',
              initials: 'M',
              color: 'bg-sage/20 text-sage',
            },
            {
              quote: "We found three grants we didn't even know existed within our first search. One of them funded our entire summer programme.",
              name: 'Sarah R.',
              role: 'Youth charity, Lewisham',
              initials: 'SR',
              color: 'bg-forest/10 text-forest',
            },
            {
              quote: "The AI search actually understands what we do. It's not just keyword matching — it found grants for community food growing we'd never have thought to check.",
              name: 'Jess P.',
              role: 'Community garden lead, Bristol',
              initials: 'JP',
              color: 'bg-gold/20 text-gold',
            },
          ].map((t, i) => (
            <motion.div
              key={t.name}
              {...fadeInView(i * 0.1)}
              className="rounded-2xl border border-warm bg-white p-7 transition-all hover:-translate-y-1 hover:shadow-warm"
            >
              <div className="mb-4 flex gap-0.5">
                {[...Array(5)].map((_, j) => (
                  <span key={j} className="text-base text-gold">★</span>
                ))}
              </div>
              <blockquote className="mb-5 font-serif text-base italic leading-snug text-forest">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${t.color}`}>
                  {t.initials}
                </div>
                <div>
                  <p className="text-sm font-semibold text-charcoal">{t.name}</p>
                  <p className="text-xs text-mid">{t.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ══ CONTACT ═══════════════════════════════════════════════════════════ */}
      <section id="contact" className="mx-auto max-w-6xl px-6 pb-24 scroll-mt-20">
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2">
          <motion.div {...fadeInView()}>
            <span className="mb-3 inline-block text-xs font-bold uppercase tracking-widest text-gold">Contact</span>
            <h2 className="mt-2 text-3xl text-charcoal">Get in touch</h2>
            <p className="mt-3 text-lg leading-relaxed text-mid">
              Have a question, partnership idea, or just want to say hello? We&apos;d love to hear from you.
            </p>
            <div className="mt-8 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-forest/10 text-base text-forest">✉️</div>
                <div>
                  <p className="text-sm font-semibold text-charcoal">Email us</p>
                  <a href="mailto:hello@granttracker.co.uk" className="text-sm text-forest hover:underline">
                    hello@granttracker.co.uk
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-forest/10 text-base text-forest">💬</div>
                <div>
                  <p className="text-sm font-semibold text-charcoal">Response time</p>
                  <p className="text-sm text-mid">Usually within 24 hours</p>
                </div>
              </div>
            </div>
          </motion.div>
          <motion.div {...fadeInView(0.15)} className="rounded-2xl border border-warm bg-white p-8 shadow-card">
            <ContactForm />
          </motion.div>
        </div>
      </section>

      {/* ══ FINAL CTA ═════════════════════════════════════════════════════════ */}
      <section className="mx-auto max-w-3xl px-6 pb-24">
        <motion.div {...fadeInView()}>
          <div className="relative overflow-hidden rounded-3xl border border-warm bg-white p-14 text-center shadow-card-lg">
            {/* Gradient top border */}
            <div className="absolute left-0 right-0 top-0 h-1 rounded-t-3xl bg-gradient-to-r from-sage via-gold to-forest" />
            <div className="relative mb-6 inline-flex items-center gap-2 rounded-full bg-forest/8 px-4 py-1.5 text-xs font-semibold text-forest">
              🇬🇧 Built for CICs, social enterprises, charities, co-operatives &amp; impact founders across the UK
            </div>
            <h2 className="text-3xl text-charcoal md:text-5xl">
              Find your funding.<br />
              <span className="text-gradient-warm italic">Free to start.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-md text-lg text-mid">
              Join CICs, charities, social enterprises and impact founders already discovering funding that actually fits — no credit card needed.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link href="/auth/signup" className="btn-primary px-12 py-3.5 text-base font-semibold">
                Start for free →
              </Link>
              <span className="text-sm text-light">No credit card required</span>
            </div>
            <p className="mt-5 text-xs text-light">Free to search · Live Search and pipeline tools from £11/month · Cancel anytime</p>
            <p className="mt-2 text-xs text-light/60">🔒 Your data is only used to improve your own matches — never used to train external models, never shared with funders, never sold.</p>
          </div>
        </motion.div>
      </section>

      {/* ══ FOOTER ════════════════════════════════════════════════════════════ */}
      <footer className="border-t border-warm px-6 py-10">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
            <a href="/" className="flex items-center gap-2">
              <div className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-forest text-white">
                <Search size={14} />
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-gold" />
              </div>
              <span className="font-serif text-lg text-charcoal">Grant Tracker</span>
            </a>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Link href="/auth/login" className="text-xs text-mid transition-colors hover:text-charcoal">Sign in</Link>
              <Link href="/auth/signup" className="text-xs text-mid transition-colors hover:text-charcoal">Sign up free</Link>
              <a href="#features" className="text-xs text-mid transition-colors hover:text-charcoal">Features</a>
              <a href="#about" className="text-xs text-mid transition-colors hover:text-charcoal">About</a>
              <a href="#contact" className="text-xs text-mid transition-colors hover:text-charcoal">Contact</a>
            </div>
          </div>
          <div className="flex flex-col items-center justify-between gap-3 border-t border-warm pt-5 sm:flex-row">
            <p className="text-xs text-light">© {new Date().getFullYear()} Grant Tracker · Funding discovery for CICs, social enterprises, charities &amp; impact founders</p>
            <div className="flex items-center gap-5">
              <Link href="/privacy" className="text-xs text-light transition-colors hover:text-mid">Privacy Policy</Link>
              <Link href="/terms" className="text-xs text-light transition-colors hover:text-mid">Terms of Service</Link>
              <a href="mailto:hello@granttracker.co.uk" className="text-xs text-light transition-colors hover:text-mid">hello@granttracker.co.uk</a>
            </div>
          </div>
        </div>
      </footer>

    </div>
  )
}
