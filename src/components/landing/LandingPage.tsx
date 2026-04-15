'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { Menu, X, Check, Search, Calendar, TrendingUp, Activity, Clock, Mail, MessageSquare, Bell, LayoutGrid, ArrowRight, Award, CheckCircle, BadgeCheck, Users, Rocket, Landmark, HeartHandshake, Building2, Shield, TreePine, Lightbulb } from 'lucide-react'
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
  { num: '01', title: 'Setup your profile', desc: 'List your impact, mission and target groups.' },
  { num: '02', title: 'Search & match', desc: 'Discover opportunities matched to you.' },
  { num: '03', title: 'Track opportunities', desc: 'Add to pipeline, get alerts and apply.' },
  { num: '04', title: 'Submit & win', desc: 'Increase your win-rate with strongly aligned applications.', featured: true },
]

const fundingTypes = [
  { title: 'Grants', range: '£300 – £500k+', desc: 'Trusts, foundations, National Lottery, Innovate UK, arts councils and government programmes.' },
  { title: 'Programmes', range: 'Equity-free', desc: 'Accelerators, incubators, fellowships and structured programmes with mentoring, networks and workspace. Filter for those that include a cash award.' },
  { title: 'Social Investment', range: '£20k – £3m', desc: 'Patient capital, loans and blended finance from Big Issue Invest, Charity Bank, Resonance and others.' },
  { title: 'In-Kind Support', range: 'Resources & expertise', desc: 'Mentoring, training and workspace. Often overlooked, high value — especially at an early stage.' },
]

const audiences = [
  {
    title: 'CICs & Social Enterprises',
    desc: "Most funding databases were built with registered charities in mind. If you're a CIC or trading social enterprise, Grant Tracker matches funding to your legal structure and filters out grants you're not eligible to apply for.",
    Icon: Shield, iconColor: '#2d8a7a', numberColor: 'rgba(45,138,122,0.18)', badgeBg: 'rgba(45,138,122,0.10)', badgeColor: '#1f5c52',
    decoBg: 'rgba(45,138,122,0.07)',
  },
  {
    title: 'Charities & CIOs',
    desc: "Trusts, foundations, lottery and government programmes matched to your cause, size and geography. Results are filtered to what your organisation can actually apply for.",
    Icon: Landmark, iconColor: '#446900', numberColor: 'rgba(132,204,22,0.22)', badgeBg: 'rgba(148,207,53,0.15)', badgeColor: '#446900',
    decoBg: 'rgba(148,207,53,0.07)',
  },
  {
    title: 'Co-operatives & Community Groups',
    desc: "Whether you're worker-led, community-owned or unincorporated, funding is matched to how your organisation is set up, not just what you do.",
    Icon: TreePine, iconColor: '#c2410c', numberColor: 'rgba(194,65,12,0.18)', badgeBg: 'rgba(251,146,60,0.12)', badgeColor: '#c2410c',
    decoBg: 'rgba(251,146,60,0.07)',
  },
  {
    title: 'Impact Founders',
    desc: "Early-stage, pre-revenue or working as an individual. Accelerators, fellowships and awards matched to your sector, stage and team.",
    Icon: Lightbulb, iconColor: '#7c3aed', numberColor: 'rgba(124,58,237,0.18)', badgeBg: 'rgba(167,139,250,0.15)', badgeColor: '#7c3aed',
    decoBg: 'rgba(167,139,250,0.08)',
  },
]

const stats = [
  { value: '500+', label: 'Funding and support opportunities' },
  { value: '4', label: 'Funding types — grants, programmes, investment & more' },
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
    features: ['Everything in Free', 'Live Search (3/week)', 'Match scoring & ranking', 'Deadline alerts', 'Priority support'],
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
    quote: "The search actually understands what we do. It's not just keyword matching — it found grants for community food growing we'd never have thought to check.",
    name: 'Jess P.', role: 'Community garden lead, Bristol', initials: 'JP',
  },
]

/* ─── Mockups ─── */
const SearchMockup = () => (
  <div className="bg-white border border-warm/80 p-5" style={{ boxShadow: '0 4px 24px rgba(26,46,43,0.08)' }}>
    <div className="flex items-center gap-2 mb-4">
      <div className="w-7 h-7 rounded-full bg-warm flex items-center justify-center flex-shrink-0">
        <Search className="w-3.5 h-3.5 text-mid" />
      </div>
      <p className="text-[11px] font-bold text-charcoal uppercase tracking-wider">Search</p>
    </div>
    <div className="flex items-center gap-2 bg-[#f5f2ed] px-3 py-2.5 mb-4 border border-warm/40">
      <Search size={14} className="text-mid flex-shrink-0" />
      <span className="text-sm text-mid flex-1">Community garden project in South London</span>
      <span className="bg-forest px-3 py-1 text-xs font-medium text-white">Search</span>
    </div>
    <div className="flex flex-col">
      {[
        { org: 'London Community Foundation', name: 'Grow to Give — Community Growing Grants', match: 94, amount: 'Up to £8,000', tags: ['South London', 'Closes Apr 15'], color: 'bg-forest' },
        { org: 'National Lottery Community Fund', name: 'Small Grants for Green Spaces', match: 87, amount: '£1,000 – £10,000', tags: ['All UK', 'Rolling'], color: 'bg-forest/70' },
        { org: 'Southwark Council', name: 'Southwark Community Fund', match: 82, amount: 'Up to £5,000', tags: ['Southwark', 'Closes May 1'], color: 'bg-amber-400' },
      ].map((r, i) => (
        <div key={r.name} className={`py-3 ${i < 2 ? 'border-b border-warm/40' : ''}`}>
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <p className="text-sm font-semibold text-charcoal leading-snug">{r.name}</p>
              <p className="text-xs text-mid mt-0.5">{r.org}</p>
            </div>
            <span className="whitespace-nowrap text-sm font-semibold text-charcoal">{r.amount}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-1.5 flex-wrap">
              {r.tags.map((tag) => (
                <span key={tag} className="bg-[#f5f2ed] px-2 py-0.5 text-[11px] text-mid">{tag}</span>
              ))}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className="w-14 h-1.5 bg-warm rounded-full overflow-hidden">
                <div className={`h-full ${r.color} rounded-full`} style={{ width: `${r.match}%` }} />
              </div>
              <span className="text-xs font-bold text-charcoal">{r.match}%</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
)

const PipelineMockup = () => (
  <div className="bg-white border border-warm/80 p-5" style={{ boxShadow: '0 4px 24px rgba(26,46,43,0.08)' }}>
    <div className="flex items-center gap-2 mb-3">
      <div className="w-7 h-7 rounded-full bg-coral/15 flex items-center justify-center flex-shrink-0">
        <ArrowRight className="w-3.5 h-3.5 text-coral" />
      </div>
      <p className="text-[11px] font-bold text-coral uppercase tracking-wider">Pipeline</p>
    </div>
    <p className="font-serif text-[28px] font-bold text-charcoal leading-tight">£187,500</p>
    <p className="text-[11px] text-coral font-medium mb-4">7 active opportunities</p>
    <div className="grid grid-cols-3 gap-2 mb-4 text-[10px]">
      {[{ name: 'Identified', items: 2 }, { name: 'Applying', items: 2 }, { name: 'Submitted', items: 1 }].map((col) => (
        <div key={col.name}>
          <div className="mb-2 text-center font-medium text-mid uppercase tracking-wider">{col.name}</div>
          <div className="space-y-2">
            {Array.from({ length: col.items }).map((_, i) => (
              <div key={i} className="bg-[#f5f2ed] p-2.5">
                <div className="h-2 w-3/4 bg-charcoal/10" />
                <div className="mt-1.5 h-1.5 w-1/2 bg-charcoal/5" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
    <div className="bg-[#f5f2ed] border border-warm/60 p-3.5">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-[10px] text-mid">Paul Hamlyn Foundation</p>
          <p className="text-sm font-semibold text-charcoal">Youth Fund 2025</p>
        </div>
        <span className="text-sm font-bold text-forest">£30k</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-coral font-medium">Deadline: 15 Mar</span>
        <span className="text-[11px] text-mid">First draft 50%</span>
      </div>
    </div>
  </div>
)

const DashboardMockup = () => (
  <div className="bg-white border border-warm/80 p-5" style={{ boxShadow: '0 4px 24px rgba(26,46,43,0.08)' }}>
    <div className="flex items-center gap-2 mb-4">
      <div className="w-7 h-7 rounded-full bg-warm flex items-center justify-center flex-shrink-0">
        <LayoutGrid className="w-3.5 h-3.5 text-mid" />
      </div>
      <p className="text-[11px] font-bold text-charcoal uppercase tracking-wider">Dashboard</p>
      <span className="ml-auto text-[10px] text-mid">Just now</span>
    </div>
    <div className="grid grid-cols-3 gap-2 mb-4">
      {[
        { label: 'Pipeline value', value: '£187.5k', Icon: TrendingUp, accent: true },
        { label: 'Active', value: '7', Icon: Activity, accent: false },
        { label: 'Due this week', value: '2', Icon: Clock, accent: false },
      ].map((s) => (
        <div key={s.label} className={`p-3 ${s.accent ? 'bg-forest/8 border border-forest/20' : 'bg-[#f5f2ed]'}`} style={s.accent ? { background: 'rgba(45,107,74,0.08)' } : {}}>
          <s.Icon size={14} className={`${s.accent ? 'text-forest' : 'text-mid'} mb-1.5`} />
          <p className={`text-lg font-bold leading-tight ${s.accent ? 'text-forest' : 'text-charcoal'}`}>{s.value}</p>
          <p className="text-[10px] text-mid mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
    <div className="mb-4">
      <p className="text-[11px] font-medium text-mid uppercase tracking-wider mb-2">Pipeline breakdown</p>
      <div className="flex h-2 w-full overflow-hidden">
        <div className="bg-forest/30 w-[35%]" /><div className="bg-forest/60 w-[30%]" />
        <div className="bg-forest w-[20%]" /><div className="bg-coral/70 w-[15%]" />
      </div>
      <div className="flex justify-between mt-1.5 text-[9px] text-mid uppercase tracking-wide">
        <span>Identified</span><span>Applying</span><span>Submitted</span><span>Awarded</span>
      </div>
    </div>
    <div className="bg-[#f5f2ed] border border-warm/60 p-3.5">
      <div className="flex items-center gap-1.5 mb-2.5">
        <Calendar size={12} className="text-mid" />
        <p className="text-[11px] font-bold text-charcoal uppercase tracking-wider">Upcoming deadlines</p>
      </div>
      <div className="flex flex-col gap-2.5">
        {[{ name: 'Youth Fund 2025', org: 'Paul Hamlyn', days: 2, amount: '£30k' }, { name: 'Green Spaces Grant', org: 'National Lottery', days: 8, amount: '£10k' }].map((d, i) => (
          <div key={d.name} className={`flex items-center justify-between ${i < 1 ? 'border-b border-warm/40 pb-2.5' : ''}`}>
            <div>
              <p className="text-xs font-semibold text-charcoal">{d.name}</p>
              <p className="text-[10px] text-mid">{d.org}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-charcoal">{d.amount}</p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${d.days <= 3 ? 'bg-coral text-white' : 'bg-warm text-mid'}`}>{d.days}d</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
)

/* ─── Public grant preview ─── */
interface PublicGrant {
  id: string
  title: string
  funder: string
  amount_min: number | null
  amount_max: number | null
  deadline: string | null
  is_rolling: boolean
  impact_sectors: string[] | null
  eligible_structures: string[] | null
  funder_type: string | null
  geo_scope: string | null
}

function fmtAmount(min: number | null, max: number | null): string {
  const fmt = (n: number) => n >= 1000 ? `£${Math.round(n / 1000)}k` : `£${n}`
  if (min && max && min !== max) return `${fmt(min)} – ${fmt(max)}`
  if (max) return `Up to ${fmt(max)}`
  if (min) return `From ${fmt(min)}`
  return 'Amount varies'
}

function fmtDeadline(d: string | null, rolling: boolean): string {
  if (rolling) return 'Rolling'
  if (!d) return 'Check website'
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const SECTOR_LABELS: Record<string, string> = {
  creative: 'Creative', environment: 'Environment', health: 'Health',
  education: 'Education', tech: 'Tech for Good', housing: 'Housing',
  food: 'Food', employment: 'Employment', community: 'Community',
  justice: 'Justice', financial: 'Financial Inclusion', international: 'International',
}

/* ─── page ─── */
export default function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [previewGrants, setPreviewGrants] = useState<PublicGrant[]>([])

  // Preview section hidden — uncomment to re-enable
  // useEffect(() => {
  //   fetch('/api/public-grants')
  //     .then(r => r.json())
  //     .then(d => setPreviewGrants(d.grants ?? []))
  //     .catch(() => {})
  // }, [])

  return (
    <div className="min-h-screen bg-cream">

      {/* NAVBAR */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-100"
      >
        <div className="flex items-center justify-between px-6 md:px-8 py-5 max-w-7xl mx-auto">
          {/* Logo */}
          <a href="/" className="text-2xl font-bold text-[#1A1A1A] tracking-tight no-underline" style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}>
            GrantTracker
          </a>
          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-10">
            {navLinks.map((link) => (
              <a key={link.label} href={link.href} className="text-[#525252] hover:text-[#1A1A1A] transition-colors font-medium text-base" style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}>{link.label}</a>
            ))}
          </nav>
          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-8">
            <Link href="/auth/login" className="text-[#1A1A1A] font-semibold text-base hover:opacity-80 transition-opacity no-underline" style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}>
              Sign in
            </Link>
            <Link href="/auth/signup" className="bg-[#84CC16] text-[#1A1A1A] px-8 py-3 rounded-full font-bold text-base hover:opacity-90 transition-all no-underline">
              Get Started
            </Link>
          </div>
          {/* Mobile */}
          <div className="flex md:hidden items-center gap-3">
            <Link href="/auth/signup" className="bg-[#84CC16] text-[#1A1A1A] px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-all no-underline">Get started</Link>
            <button onClick={() => setMobileOpen(o => !o)} className="p-1 text-[#1A1A1A]" aria-label="Toggle menu">
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="border-t border-slate-100 bg-white px-6 pb-6 md:hidden"
          >
            <div className="flex flex-col gap-4 pt-4">
              {navLinks.map(link => (
                <a key={link.label} href={link.href} className="text-sm text-[#525252]" onClick={() => setMobileOpen(false)}>{link.label}</a>
              ))}
              <div className="flex flex-col gap-2 pt-2">
                <Link href="/auth/login" onClick={() => setMobileOpen(false)} className="text-center text-sm text-[#525252] py-2 border border-slate-200 rounded-full">Sign in</Link>
                <Link href="/auth/signup" onClick={() => setMobileOpen(false)} className="bg-[#84CC16] text-[#1A1A1A] rounded-full text-center text-sm font-bold py-2 hover:opacity-90 transition-colors">Get started free</Link>
              </div>
            </div>
          </motion.div>
        )}
      </motion.nav>

      {/* HERO */}
      <section className="relative overflow-hidden" style={{ background: '#F9F9F9', minHeight: '100vh' }}>
        <div className="relative z-10 mx-auto max-w-7xl px-6 md:px-8 grid lg:grid-cols-2 gap-16 lg:gap-12 items-start" style={{ paddingTop: 'clamp(100px, 14vw, 128px)', paddingBottom: '80px' }}>

          {/* Left: text */}
          <motion.div {...fadeUp(0)} className="flex flex-col justify-start">
            {/* Audience badge */}
            <div className="flex items-center gap-3 bg-[#C8E9FB] text-[#4D7C98] px-5 py-3 rounded-full w-fit mb-10">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <p className="font-bold text-xs tracking-wide uppercase">
                Built for the UK social impact sector.
              </p>
            </div>
            {/* Headline */}
            <h1
              className="font-bold leading-[1.05] text-[#1A1A1A] mb-10"
              style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif', fontSize: 'clamp(48px, 6.5vw, 88px)', letterSpacing: '-0.04em' }}
            >
              Funding,<br/>
              <span style={{ color: '#84CC16' }}>matched</span><br/>
              for you.
            </h1>
            {/* Subtext */}
            <p className="text-[#525252] leading-relaxed font-medium text-lg max-w-lg mb-10">
              Matched to your structure, sector and geography — across grants, programmes, social investment and in-kind support.
            </p>
            {/* CTAs */}
            <div className="flex flex-wrap gap-4">
              <Link
                href="/auth/signup"
                className="text-white px-9 py-4 rounded-full font-bold text-base hover:opacity-95 transition-all no-underline"
                style={{ background: 'linear-gradient(180deg, #84CC16 0%, #4D7C0F 100%)', boxShadow: '0 10px 20px -5px rgba(132, 204, 22, 0.3)' }}
              >
                Get started free
              </Link>
              <a href="#how" className="bg-[#EAEAEA] text-[#1A1A1A] px-9 py-4 rounded-full font-bold text-base hover:bg-[#E0E0E0] transition-all">
                How it works
              </a>
            </div>
          </motion.div>

          {/* Right: UI card */}
          <motion.div {...fadeUp(0.2)} className="relative lg:pl-8 flex items-start pt-4">
            <div className="bg-white rounded-3xl p-8 w-full" style={{ boxShadow: '0 40px 100px -20px rgba(0,0,0,0.08)' }}>
              {/* Card header */}
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-2xl font-bold text-[#1A1A1A] tracking-tight" style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}>Digital Inclusion Fund</h3>
                  <p className="text-[#525252] font-medium mt-0.5 text-sm">Active Grant Application</p>
                </div>
                <div className="bg-[#BEF264] px-4 py-1.5 rounded-full flex items-center gap-1.5 flex-shrink-0">
                  <span className="w-2 h-2 rounded-full bg-[#84CC16] animate-pulse" />
                  <span className="text-[#1A1A1A] font-bold text-xs tracking-tight">Pipeline: Draft</span>
                </div>
              </div>
              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div className="bg-[#F2F2F2] rounded-2xl p-5">
                  <p className="text-[#525252] text-[11px] font-bold uppercase tracking-wider mb-1">Matching Score</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-5xl font-bold text-[#84CC16]" style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}>94%</span>
                    <span className="text-[#525252] font-bold text-sm">Match</span>
                  </div>
                  <div className="mt-4">
                    <div className="h-1.5 w-full bg-[#E2E2E2] rounded-full overflow-hidden">
                      <div className="h-full bg-[#84CC16] rounded-full" style={{ width: '94%' }} />
                    </div>
                  </div>
                  <p className="text-[11px] text-[#525252] mt-3 font-semibold italic">Based on Youth Fund criteria</p>
                </div>
                <div className="bg-[#E6F4FF] rounded-2xl p-5">
                  <p className="text-[#3C687D] text-[11px] font-bold uppercase tracking-wider mb-1">Requested Funding</p>
                  <div className="flex items-baseline">
                    <span className="text-4xl font-bold text-[#1A1A1A]" style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}>£25,000</span>
                  </div>
                  <div className="mt-6 flex items-center gap-1.5">
                    <BadgeCheck className="w-4 h-4 text-[#376478]" />
                    <span className="text-[11px] font-bold text-[#376478] uppercase tracking-tight">Verified UK Funder</span>
                  </div>
                </div>
              </div>
              {/* List rows */}
              <div className="space-y-3">
                {[
                  { Icon: Users, label: 'Community Reach', sub: 'Social impact focus', iconBg: '#E6F4FF', iconColor: '#376478', tag: 'High Priority', tagStyle: { background: '#F5E1AD', color: '#52461F' } },
                  { Icon: TrendingUp, label: 'Social Investment', sub: 'Sustainable growth model', iconBg: 'rgba(206,188,139,0.4)', iconColor: '#6B5D34', tag: 'High Priority', tagStyle: { background: '#F5E1AD', color: '#52461F' } },
                  { Icon: Rocket, label: 'Incubation Programme', sub: 'Capacity building', iconBg: 'rgba(190,242,100,0.4)', iconColor: '#446900', tag: 'Phase 1', tagStyle: { color: '#84CC16', fontWeight: '800', letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '11px' } },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between p-4 bg-[#F2F2F2] rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full flex items-center justify-center w-12 h-12 flex-shrink-0" style={{ background: row.iconBg }}>
                        <row.Icon className="w-5 h-5" style={{ color: row.iconColor }} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#1A1A1A]">{row.label}</p>
                        <p className="text-xs text-[#525252]">{row.sub}</p>
                      </div>
                    </div>
                    <span className="px-3 py-1 rounded-lg text-[10px] font-extrabold" style={row.tagStyle}>{row.tag}</span>
                  </div>
                ))}
              </div>

            </div>
          </motion.div>

        </div>
      </section>

      {/* LIVE GRANT PREVIEW */}
      {previewGrants.length > 0 && (
        <section className="py-16 md:py-24 bg-white border-t border-warm/60">
          <div className="mx-auto max-w-6xl px-6">
            <motion.div {...fadeInView(0)} className="text-center mb-12">
              <p className="text-sm font-semibold text-coral uppercase tracking-wider mb-3">Live funding, right now</p>
              <h2 className="font-serif text-3xl md:text-4xl text-charcoal mb-4">Browse what's available today</h2>
              <p className="text-mid max-w-xl mx-auto text-sm leading-relaxed">A sample from our live database. Sign up free to search all opportunities matched to your organisation.</p>
            </motion.div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
              {previewGrants.map((grant, i) => (
                <motion.div
                  key={grant.id}
                  {...fadeInView(i * 0.06)}
                  className="bg-cream border border-warm/80 p-5 flex flex-col"
                  style={{ boxShadow: '0 2px 12px rgba(26,46,43,0.06)' }}
                >
                  {/* Funder + amount */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <p className="text-[11px] text-mid font-medium uppercase tracking-wide leading-snug">{grant.funder}</p>
                    <span className="text-sm font-bold text-forest flex-shrink-0">{fmtAmount(grant.amount_min, grant.amount_max)}</span>
                  </div>

                  {/* Title */}
                  <h3 className="font-serif text-[15px] text-charcoal leading-snug mb-3 flex-1">{grant.title}</h3>

                  {/* Sectors */}
                  {grant.impact_sectors && grant.impact_sectors.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {grant.impact_sectors.slice(0, 3).map(s => (
                        <span key={s} className="text-[10px] px-2 py-0.5 font-medium" style={{ background: '#ede9fe', color: '#5b21b6' }}>
                          {SECTOR_LABELS[s] ?? s}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Deadline + CTA */}
                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-warm/60">
                    <span className="text-[11px] text-mid">
                      {grant.is_rolling ? (
                        <span className="text-forest font-medium">Rolling</span>
                      ) : grant.deadline ? (
                        <>Deadline: <span className="text-charcoal font-medium">{fmtDeadline(grant.deadline, false)}</span></>
                      ) : (
                        'Check website'
                      )}
                    </span>
                    <Link
                      href="/auth/signup"
                      className="text-[11px] font-semibold text-coral hover:underline"
                    >
                      View &amp; track →
                    </Link>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* CTA bar */}
            <motion.div {...fadeInView(0.2)} className="text-center">
              <Link
                href="/auth/signup"
                className="inline-flex items-center gap-2 bg-forest text-white px-8 py-3.5 text-sm font-semibold hover:opacity-90 transition-colors"
                style={{ borderRadius: '0px' }}
              >
                Search all opportunities free <ArrowRight size={16} />
              </Link>
              <p className="text-xs text-mid mt-3">No credit card · Takes 2 minutes</p>
            </motion.div>
          </div>
        </section>
      )}

      {/* HOW IT WORKS */}
      <section id="how" className="py-20 md:py-28" style={{ background: '#F9F9F9' }}>
        <div className="mx-auto max-w-7xl px-6 md:px-8">

          {/* Header row */}
          <motion.div {...fadeInView(0)} className="grid lg:grid-cols-2 gap-8 items-end mb-14">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: '#84CC16' }}>Process</p>
              <h2 className="font-bold leading-tight" style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif', fontSize: 'clamp(32px, 4.5vw, 56px)', letterSpacing: '-0.03em', color: '#1A1A1A' }}>
                Setup, search and<br/>
                <span style={{ color: '#84CC16' }}>track what matters</span>
              </h2>
            </div>
            <div className="lg:pb-2">
              <p className="text-[#525252] text-base leading-relaxed max-w-sm">
                GrantTracker streamlines your funding journey from initial discovery to successful submission — matched to your organisation.
              </p>
            </div>
          </motion.div>

          {/* Cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                num: '01', title: 'Setup your profile',
                desc: 'List your impact, mission and target groups.',
                Icon: Users,
                bg: '#E6F4FF', numColor: '#376478', titleColor: '#1A1A1A', textColor: '#525252', iconColor: '#376478',
              },
              {
                num: '02', title: 'Search & match',
                desc: 'Discover opportunities matched to you.',
                Icon: Search,
                bg: '#FFEBB6', numColor: '#6B5D34', titleColor: '#6B5D34', textColor: '#6B5D34', iconColor: '#6B5D34',
              },
              {
                num: '03', title: 'Track opportunities',
                desc: 'Add to pipeline, get deadline alerts and apply.',
                Icon: TrendingUp,
                bg: '#EEEEEE', numColor: '#9E9E9E', titleColor: '#1A1A1A', textColor: '#525252', iconColor: '#9E9E9E',
              },
              {
                num: '04', title: 'Submit & win',
                desc: 'Increase your win-rate with strongly aligned applications.',
                Icon: Award,
                bg: '#84CC16', numColor: '#BEF264', titleColor: '#ffffff', textColor: 'rgba(255,255,255,0.85)', iconColor: '#ffffff',
              },
            ].map((step, i) => (
              <motion.div
                key={step.title}
                {...fadeInView(i * 0.08)}
                className="rounded-3xl p-7 flex flex-col min-h-[260px]"
                style={{ background: step.bg }}
              >
                <span className="text-4xl font-bold mb-6" style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif', color: step.numColor }}>{step.num}</span>
                <h3 className="font-bold text-lg mb-3 leading-snug" style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif', color: step.titleColor }}>{step.title}</h3>
                <p className="text-sm leading-relaxed flex-1" style={{ color: step.textColor }}>{step.desc}</p>
                <div className="mt-6">
                  <step.Icon className="w-6 h-6" style={{ color: step.iconColor }} />
                </div>
              </motion.div>
            ))}
          </div>

        </div>
      </section>

      {/* FUNDING TYPES */}
      <section className="py-20 md:py-28 bg-white">
        <div className="mx-auto max-w-7xl px-6 md:px-8">

          {/* Header row — matches Process section */}
          <motion.div {...fadeInView(0)} className="grid lg:grid-cols-2 gap-8 items-end mb-14">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: '#84CC16' }}>Funding Types</p>
              <h2 className="font-bold leading-tight" style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif', fontSize: 'clamp(32px, 4.5vw, 56px)', letterSpacing: '-0.03em', color: '#1A1A1A' }}>
                Not just grants,<br/><span style={{ color: '#84CC16' }}>the full picture.</span>
              </h2>
            </div>
            <div className="lg:pb-2">
              <p className="text-[#525252] text-base leading-relaxed max-w-sm">
                Not every organisation needs a grant. We surface the full funding landscape matched to your structure and stage.
              </p>
            </div>
          </motion.div>

          {/* 2x2 grid */}
          <div className="grid md:grid-cols-2 gap-4">
            {[
              {
                badge: '£300 – £500k+', badgeColor: '#446900', badgeBg: 'rgba(148,207,53,0.15)',
                title: 'Grants', titleColor: '#111827',
                desc: 'Trusts, foundations, National Lottery, Innovate UK, arts councils and government programmes.',
                Icon: Landmark, iconColor: '#446900',
                decoBg: 'rgba(148,207,53,0.07)', decoPos: '-translate-y-16 translate-x-16',
              },
              {
                badge: 'Equity-free', badgeColor: '#c2410c', badgeBg: 'rgba(251,146,60,0.15)',
                title: 'Programmes', titleColor: '#111827',
                desc: 'Accelerators, incubators, fellowships and structured programmes with mentoring, networks and workspace.',
                Icon: Rocket, iconColor: '#ea580c',
                decoBg: 'rgba(251,146,60,0.12)', decoPos: 'translate-y-8 translate-x-8',
              },
              {
                badge: '£20k – £3m', badgeColor: '#1d4ed8', badgeBg: 'rgba(96,165,250,0.15)',
                title: 'Social Investment', titleColor: '#111827',
                desc: 'Patient capital, loans and blended finance from Big Issue Invest, Charity Bank, Resonance and others.',
                Icon: TrendingUp, iconColor: '#2563eb',
                decoBg: 'rgba(96,165,250,0.12)', decoPos: 'top-1/2 -right-4',
              },
              {
                badge: 'Resources & expertise', badgeColor: '#7c3aed', badgeBg: 'rgba(167,139,250,0.15)',
                title: 'In-Kind Support', titleColor: '#111827',
                desc: 'Mentoring, training and workspace. Often overlooked, high value — especially at an early stage.',
                Icon: HeartHandshake, iconColor: '#7c3aed',
                decoBg: 'rgba(167,139,250,0.10)', decoPos: 'translate-y-4 -translate-x-4',
              },
            ].map((card, i) => (
              <motion.div
                key={card.title}
                {...fadeInView(i * 0.07)}
                className="relative overflow-hidden bg-white rounded-3xl p-7 md:p-9 group"
                style={{ boxShadow: '0 2px 16px rgba(0,0,0,0.05)' }}
              >
                {/* Decorative circle */}
                <div
                  className="absolute top-0 right-0 w-32 h-32 rounded-full pointer-events-none transition-transform duration-700 group-hover:scale-150"
                  style={{ background: card.decoBg, transform: 'translate(2rem, -2rem)' }}
                />
                {/* Icon top-right */}
                <div className="absolute top-6 right-6 opacity-25 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300 z-10">
                  <card.Icon className="w-6 h-6" style={{ color: card.iconColor }} />
                </div>
                {/* Badge */}
                <span
                  className="inline-block px-3 py-1 rounded-full font-bold tracking-widest uppercase text-[10px] mb-5 relative z-10"
                  style={{ color: card.badgeColor, background: card.badgeBg }}
                >
                  {card.badge}
                </span>
                {/* Title */}
                <h3
                  className="font-bold mb-3 relative z-10 transition-transform duration-300 group-hover:translate-x-1"
                  style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif', fontSize: '1.375rem', color: card.titleColor }}
                >
                  {card.title}
                </h3>
                {/* Description */}
                <p className="text-gray-500 text-sm leading-relaxed max-w-md relative z-10">{card.desc}</p>
              </motion.div>
            ))}
          </div>

        </div>
      </section>

      {/* FEATURES */}
      <div id="features">
        <section className="py-20 md:py-28" style={{ background: '#F9F9F9' }}>
          <div className="mx-auto max-w-7xl px-6 md:px-8">
            <div className="grid lg:grid-cols-2 gap-16 items-center">

              {/* Left: copy */}
              <motion.div {...fadeInView(0)}>
                <p className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: '#84CC16' }}>Features</p>
                <h2 className="font-bold leading-tight mb-5" style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif', fontSize: 'clamp(32px, 4.5vw, 56px)', letterSpacing: '-0.03em', color: '#1A1A1A' }}>
                  Search &amp; track,<br/><span style={{ color: '#84CC16' }}>in one place.</span>
                </h2>
                <ul className="space-y-6 mb-10">
                  {[
                    { title: 'Intelligent Matching', desc: 'Profile-based matching across grants, programmes, investment and in-kind support.' },
                    { title: 'Live Precision Search', desc: 'Live search ranked by structure, sector, geography and mission.' },
                    { title: 'Pipeline Visibility', desc: 'Pipeline tracking from first contact to submission status.' },
                    { title: 'Deadline Alerts', desc: 'Stay ahead with deadline alerts for grants closing within 14 days.' },
                    { title: 'Impact Dashboard', desc: 'Full dashboard summary of pipeline value and upcoming deadlines.' },
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-4">
                      <span className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full" style={{ background: 'rgba(132,204,22,0.18)' }}>
                        <Check className="w-4 h-4" style={{ color: '#84CC16' }} />
                      </span>
                      <div className="pt-1">
                        <p className="font-bold text-[#1A1A1A] text-base leading-snug mb-1">{item.title}</p>
                        <p className="text-sm text-[#525252] leading-relaxed">{item.desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <a href="/auth/signup" className="inline-flex items-center gap-3 bg-[#1A1A1A] text-white px-7 py-4 rounded-full font-bold text-base hover:bg-slate-800 transition-all no-underline">
                  Start now <ArrowRight className="w-4 h-4" />
                </a>
              </motion.div>

              {/* Right: description + scattered feature cards */}
              <div className="hidden lg:flex flex-col gap-0">
                <div className="relative" style={{ height: '560px' }}>

                  {/* Dashboard — back right */}
                  <motion.div {...fadeInView(0.1)} className="absolute" style={{ width: '240px', top: '20px', right: '0px', zIndex: 1 }}>
                    <div className="bg-white rounded-2xl p-4" style={{ transform: 'rotate(7deg)', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(132,204,22,0.15)' }}>
                          <LayoutGrid className="w-3.5 h-3.5" style={{ color: '#84CC16' }} />
                        </div>
                        <p className="text-[11px] font-bold text-[#1A1A1A] uppercase tracking-wider">Dashboard</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="rounded-xl p-2.5" style={{ background: '#F2F2F2' }}>
                          <p className="text-[17px] font-bold text-[#1A1A1A] leading-tight">42k</p>
                          <p className="text-[9px] text-[#525252] uppercase tracking-wide font-medium">Won</p>
                        </div>
                        <div className="rounded-xl p-2.5" style={{ background: 'rgba(132,204,22,0.15)' }}>
                          <p className="text-[17px] font-bold leading-tight" style={{ color: '#84CC16' }}>68%</p>
                          <p className="text-[9px] uppercase tracking-wide font-medium" style={{ color: '#84CC16' }}>Success</p>
                        </div>
                      </div>
                      <p className="text-[9px] text-[#525252] mb-2">Funding won — last 7 months</p>
                      <div className="flex items-end gap-1" style={{ height: '40px' }}>
                        {[40, 25, 55, 35, 70, 60, 85].map((h, i) => (
                          <div key={i} className="flex-1 rounded-sm" style={{ height: `${h}%`, background: i === 6 ? '#84CC16' : 'rgba(132,204,22,0.35)' }} />
                        ))}
                      </div>
                    </div>
                  </motion.div>

                  {/* Pipeline — front left */}
                  <motion.div {...fadeInView(0.05)} className="absolute" style={{ width: '220px', top: '60px', left: '0px', zIndex: 3 }}>
                    <div className="bg-white rounded-2xl p-4" style={{ transform: 'rotate(-8deg)', boxShadow: '0 8px 32px rgba(0,0,0,0.10)' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(234,88,12,0.12)' }}>
                          <ArrowRight className="w-3.5 h-3.5" style={{ color: '#ea580c' }} />
                        </div>
                        <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#ea580c' }}>Pipeline</p>
                      </div>
                      <p className="text-[26px] font-bold text-[#1A1A1A] leading-tight" style={{ fontFamily: 'var(--font-space-grotesk), sans-serif' }}>£187,500</p>
                      <p className="text-[11px] font-medium mb-3" style={{ color: '#ea580c' }}>7 active opportunities</p>
                      <div className="flex flex-col gap-1.5">
                        {['Identified', 'Applying', 'Submitted'].map((label) => (
                          <div key={label} className="flex items-center justify-between rounded-xl px-2.5 py-1.5" style={{ background: '#F2F2F2' }}>
                            <span className="text-[10px] text-[#1A1A1A]">{label}</span>
                            <div className="w-2 h-2 rounded-full" style={{ background: label === 'Applying' ? '#84CC16' : '#D4D4D4' }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>

                  {/* Search — centre, largest, front */}
                  <motion.div {...fadeInView(0.08)} className="absolute" style={{ width: '290px', top: '110px', left: 'calc(50% - 145px)', zIndex: 5 }}>
                    <div className="bg-white rounded-2xl p-5" style={{ transform: 'rotate(-1deg)', boxShadow: '0 16px 48px rgba(0,0,0,0.12)' }}>
                      <p className="text-[11px] font-bold uppercase tracking-wider mb-2.5" style={{ color: '#2d8a7a' }}>Search</p>
                      <div className="flex items-center gap-2 rounded-full px-3 py-2 mb-3" style={{ background: '#F2F2F2' }}>
                        <Search className="w-3 h-3 text-[#525252] flex-shrink-0" />
                        <span className="text-[11px] text-[#525252]">community garden...</span>
                      </div>
                      <div className="flex flex-col">
                        {[
                          { name: 'Community Growing Grants', pct: 94, barColor: '#2d8a7a', pctColor: '#2d8a7a' },
                          { name: 'Green Spaces Fund',        pct: 87, barColor: '#9E9E9E',  pctColor: '#9E9E9E' },
                          { name: 'Urban Nature Programme',   pct: 79, barColor: '#f59e0b',  pctColor: '#f59e0b' },
                        ].map((r, i) => (
                          <div key={r.name} className={`flex items-center justify-between gap-2 py-2 ${i < 2 ? 'border-b border-[#F2F2F2]' : ''}`}>
                            <p className="text-[11px] font-semibold text-[#1A1A1A] leading-tight">{r.name}</p>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <div className="w-10 h-1.5 rounded-full overflow-hidden" style={{ background: '#EEEEEE' }}>
                                <div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: r.barColor }} />
                              </div>
                              <span className="text-[10px] font-bold" style={{ color: r.pctColor }}>{r.pct}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>

                  {/* Awarded — bottom right */}
                  <motion.div {...fadeInView(0.12)} className="absolute" style={{ width: '210px', top: '340px', right: '0px', zIndex: 2 }}>
                    <div className="bg-white rounded-2xl p-4" style={{ transform: 'rotate(4deg)', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(45,138,122,0.12)' }}>
                          <Award className="w-3.5 h-3.5" style={{ color: '#2d8a7a' }} />
                        </div>
                        <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#2d8a7a' }}>Awarded</p>
                      </div>
                      <p className="text-[13px] font-semibold text-[#1A1A1A] leading-snug mb-1">London Community Foundation</p>
                      <p className="text-[11px] text-[#525252] mb-3">Grow to Give — Community Growing</p>
                      <div className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: 'rgba(45,138,122,0.10)' }}>
                        <span className="text-[11px] text-[#525252]">Grant awarded</span>
                        <span className="text-[15px] font-bold" style={{ color: '#2d8a7a' }}>£8,000</span>
                      </div>
                    </div>
                  </motion.div>

                  {/* Alerts — front bottom left */}
                  <motion.div {...fadeInView(0.1)} className="absolute" style={{ width: '240px', top: '330px', left: '10px', zIndex: 4 }}>
                    <div className="bg-white rounded-2xl p-4" style={{ transform: 'rotate(-3deg)', boxShadow: '0 8px 32px rgba(0,0,0,0.10)' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="relative w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#F2F2F2' }}>
                          <Bell className="w-3.5 h-3.5 text-[#525252]" />
                          <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-red-400 border border-white" />
                        </div>
                        <p className="text-[11px] font-bold text-[#1A1A1A] uppercase tracking-wider">Alerts</p>
                      </div>
                      <div className="flex flex-col">
                        {[
                          { name: 'Youth Fund 2025',        org: 'Paul Hamlyn Foundation', days: '2d',  urgent: true  },
                          { name: 'Green Spaces Grant',     org: 'National Lottery',       days: '8d',  urgent: false },
                          { name: 'Digital Inclusion Fund', org: 'DCMS',                   days: '14d', urgent: false },
                        ].map((a, i) => (
                          <div key={a.name} className={`flex items-center justify-between gap-2 py-2 ${i < 2 ? 'border-b border-[#F2F2F2]' : ''}`}>
                            <div>
                              <p className="text-[11px] font-semibold text-[#1A1A1A] leading-tight">{a.name}</p>
                              <p className="text-[10px] text-[#525252]">{a.org}</p>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0" style={a.urgent ? { background: '#BEF264', color: '#1A1A1A' } : { background: '#F2F2F2', color: '#525252' }}>{a.days}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>

                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ABOUT — Block 1: Founder story */}
      <section id="about" className="py-20 md:py-28 bg-white">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-start">

            {/* Left: label + heading + quote */}
            <motion.div {...fadeInView(0)}>
              <p className="text-sm font-semibold tracking-widest uppercase mb-4" style={{ color: '#84CC16', fontFamily: 'var(--font-space-grotesk)' }}>About</p>
              <h2 className="mb-10 leading-[1.05]" style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 'clamp(36px, 4.5vw, 56px)', letterSpacing: '-0.03em', color: '#1A1A1A' }}>
                Built from<br /><span style={{ color: '#84CC16' }}>the inside.</span>
              </h2>
              <blockquote className="mb-6">
                <p className="text-lg leading-relaxed italic mb-4" style={{ color: '#525252', fontFamily: 'var(--font-dm-serif)' }}>
                  &ldquo;I&apos;ve spent 20 years in the social enterprise and charity sector &mdash; co-founding a youth music organisation, leading development strategy at local charities, and driving fundraising across a global co-working network.
                </p>
                <p className="text-lg leading-relaxed italic" style={{ color: '#525252', fontFamily: 'var(--font-dm-serif)' }}>
                  Throughout all of it, I was consistently frustrated by the same thing: a fragmented
                  funding ecosystem that forced people like me to spend a disproportionate amount of
                  time hunting opportunities rather than delivering impactful work.&rdquo;
                </p>
              </blockquote>
              <p className="text-sm font-semibold" style={{ color: '#1A1A1A', fontFamily: 'var(--font-space-grotesk)' }}>Paul Kilty, founder</p>
            </motion.div>

            {/* Right: £8bn stat card + why it exists */}
            <motion.div {...fadeInView(0.1)} className="flex flex-col gap-6">
              <div className="rounded-3xl p-10 text-center" style={{ background: '#F4F9E8' }}>
                <p className="leading-none mb-3" style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 'clamp(56px, 8vw, 96px)', color: '#84CC16', letterSpacing: '-0.04em' }}>£8bn<span style={{ color: '#1A1A1A' }}>+</span></p>
                <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: '#525252', fontFamily: 'var(--font-space-grotesk)' }}>awarded by UK trusts &amp; foundations annually</p>
              </div>
              <div className="rounded-3xl p-8" style={{ background: '#F9F9F9' }}>
                <p className="text-base font-semibold mb-3" style={{ color: '#1A1A1A', fontFamily: 'var(--font-space-grotesk)' }}>Why it exists</p>
                <p className="text-base leading-relaxed mb-3" style={{ color: '#525252' }}>
                  The UK has thousands of active funders, but finding the right ones is effectively
                  a full-time job. Most charities, CICs and social enterprises can&apos;t afford
                  that — and they shouldn&apos;t have to.
                </p>
                <p className="text-base leading-relaxed" style={{ color: '#525252' }}>
                  Grant Tracker matches you to grants, programmes, investments and in-kind support
                  so you can spend that time delivering.
                </p>
              </div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* ABOUT — Block 2: Who it's for */}
      <section className="py-20 md:py-28" style={{ background: '#F9F9F9' }}>
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid lg:grid-cols-2 gap-8 items-end mb-14">
            <motion.div {...fadeInView(0)}>
              <p className="text-sm font-semibold tracking-widest uppercase mb-4" style={{ color: '#84CC16', fontFamily: 'var(--font-space-grotesk)' }}>Who it&apos;s for</p>
              <h2 className="leading-tight" style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 'clamp(32px, 4.5vw, 56px)', letterSpacing: '-0.03em', color: '#1A1A1A' }}>
                Funding matched to<br/><span style={{ color: '#84CC16' }}>your structure.</span>
              </h2>
            </motion.div>
            <motion.div {...fadeInView(0.1)}>
              <p className="text-base leading-relaxed" style={{ color: '#525252' }}>
                Whether you're a CIC, impact founder, grassroots charity or community group, find funding you can actually apply for.
              </p>
            </motion.div>
          </div>
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-0 divide-y divide-[#EBEBEB] sm:divide-y-0">
            {audiences.map((card, i) => (
              <motion.div
                key={card.title}
                {...fadeInView(i * 0.08)}
                className={`relative py-6 md:py-8 ${i < 2 ? 'sm:border-b sm:border-[#EBEBEB]' : ''} ${i % 2 === 0 ? 'sm:pr-8 sm:border-r sm:border-[#EBEBEB]' : 'sm:pl-8'}`}
              >
                {/* Large faded coloured number */}
                <span
                  className="block font-bold leading-none select-none mb-3"
                  style={{
                    fontFamily: 'var(--font-space-grotesk)',
                    fontSize: 'clamp(40px, 5vw, 64px)',
                    color: card.numberColor,
                    letterSpacing: '-0.05em',
                    lineHeight: 1,
                  }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                {/* Icon + title */}
                <div className="flex items-center gap-2.5 mb-3">
                  <card.Icon className="w-4 h-4 flex-shrink-0" style={{ color: card.iconColor }} />
                  <h3
                    className="font-bold"
                    style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: '1.15rem', color: '#1A1A1A' }}
                  >
                    {card.title}
                  </h3>
                </div>
                {/* Description */}
                <p className="text-sm leading-relaxed" style={{ color: '#525252' }}>
                  {card.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ABOUT — Block 3: Values + AI */}
      <section className="py-20 md:py-28 bg-white">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid lg:grid-cols-2 gap-8 items-end mb-14">
            <motion.div {...fadeInView(0)}>
              <p className="text-sm font-semibold tracking-widest uppercase mb-4" style={{ color: '#84CC16', fontFamily: 'var(--font-space-grotesk)' }}>Values</p>
              <h2 className="leading-tight" style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 'clamp(32px, 4.5vw, 56px)', letterSpacing: '-0.03em', color: '#1A1A1A' }}>
                How we <span style={{ color: '#84CC16' }}>work.</span>
              </h2>
            </motion.div>
            <motion.div {...fadeInView(0.1)}>
              <p className="text-base leading-relaxed" style={{ color: '#525252' }}>
                A few principles that shape every decision we make.
              </p>
            </motion.div>
          </div>

          {/* Three value cards */}
          <div className="grid md:grid-cols-3 gap-4 mb-4">
            {[
              { label: 'Honest', body: "We don't inflate match scores or dress up poor-fit grants. If something isn't right for you, we'd rather tell you than waste your time.", bg: '#E6F4FF' },
              { label: 'Practical', body: "Every feature exists because it makes the funding process easier. We don't add complexity for the sake of it.", bg: '#FFEBB6' },
              { label: 'Accessible', body: "Good funding intelligence shouldn't only be available to organisations with big budgets. Grant Tracker is priced so smaller organisations can afford it.", bg: '#F4F9E8' },
            ].map((v, i) => (
              <motion.div key={v.label} {...fadeInView(i * 0.08)} className="rounded-3xl p-8 flex flex-col" style={{ background: v.bg }}>
                <p className="text-4xl font-bold mb-4" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#1A1A1A', letterSpacing: '-0.02em' }}>{v.label}</p>
                <p className="text-base leading-relaxed flex-1" style={{ color: '#525252' }}>{v.body}</p>
              </motion.div>
            ))}
          </div>

          {/* AI approach — full-width card */}
          <motion.div {...fadeInView(0.1)} className="rounded-3xl p-10 md:p-12" style={{ background: '#F9F9F9' }}>
            <div className="grid lg:grid-cols-2 gap-8 items-start">
              <div>
                <p className="text-sm font-semibold tracking-widest uppercase mb-3" style={{ color: '#84CC16', fontFamily: 'var(--font-space-grotesk)' }}>Our approach to AI</p>
                <p className="text-2xl font-bold leading-snug" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#1A1A1A', letterSpacing: '-0.02em' }}>
                  Your voice. Your story.<br />Your evidence.
                </p>
              </div>
              <div className="space-y-4">
                <p className="text-base leading-relaxed" style={{ color: '#525252' }}>
                  Funders are increasingly inundated with AI-generated applications that are bland, generic and interchangeable.
                  We don&apos;t want to make that problem worse.
                </p>
                <p className="text-base leading-relaxed" style={{ color: '#525252' }}>
                  Grant Tracker uses AI where it genuinely helps: matching your profile to the right opportunities,
                  building intelligence about how funders make decisions, and cutting the time you spend searching.
                  Always in service of something genuinely yours — not instead of it.
                </p>
              </div>
            </div>
          </motion.div>

        </div>
      </section>

      {/* STATS */}
      <section className="py-16 md:py-20" style={{ background: '#1A1A1A' }}>
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
            {stats.map((s, i) => (
              <motion.div key={s.label} {...fadeInView(i * 0.1)} className="text-center">
                <p className="leading-none mb-3" style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 'clamp(40px, 5vw, 64px)', color: '#84CC16', letterSpacing: '-0.03em' }}>{s.value}</p>
                <p className="text-sm leading-relaxed" style={{ color: '#888888' }}>{s.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="py-20 md:py-28" style={{ background: "#F9F9F9" }}>
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid lg:grid-cols-2 gap-8 items-end mb-14">
            <motion.div {...fadeInView(0)}>
              <p className="text-sm font-semibold tracking-widest uppercase mb-4" style={{ color: '#84CC16', fontFamily: 'var(--font-space-grotesk)' }}>Pricing</p>
              <h2 className="leading-tight" style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 'clamp(32px, 4.5vw, 56px)', letterSpacing: '-0.03em', color: '#1A1A1A' }}>
                Plans that respect <span style={{ color: '#84CC16' }}>your budget.</span>
              </h2>
            </motion.div>
            <motion.div {...fadeInView(0.1)}>
              <p className="text-base leading-relaxed" style={{ color: '#525252' }}>Start free. Upgrade to live search, match scoring and tracking tools whenever you're ready.</p>
            </motion.div>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {plans.map((plan, i) => (
              <motion.div
                key={plan.name}
                {...fadeInView(i * 0.1)}
                className="relative rounded-3xl p-8 flex flex-col"
                style={{ background: plan.popular ? '#1A1A1A' : '#F9F9F9' }}
              >
                {plan.popular && (
                  <span className="absolute top-6 right-6 rounded-full px-3 py-1 text-xs font-semibold" style={{ background: '#84CC16', color: '#1A1A1A', fontFamily: 'var(--font-space-grotesk)' }}>Most popular</span>
                )}
                <p className="text-sm font-semibold mb-4" style={{ color: plan.popular ? '#84CC16' : '#525252', fontFamily: 'var(--font-space-grotesk)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{plan.name}</p>
                <div className="mb-2">
                  <span style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 'clamp(40px, 5vw, 56px)', letterSpacing: '-0.03em', color: plan.popular ? '#FFFFFF' : '#1A1A1A' }}>{plan.price}</span>
                </div>
                <p className="text-sm mb-8" style={{ color: plan.popular ? '#888888' : '#888888' }}>{plan.period}</p>
                <ul className="space-y-3 flex-1 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm" style={{ color: plan.popular ? '#CCCCCC' : '#525252' }}>
                      <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: '#84CC16' }}>
                        <Check className="w-2.5 h-2.5" style={{ color: '#1A1A1A' }} />
                      </span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/auth/signup"
                  className="block rounded-full text-center py-3 text-sm font-semibold transition-opacity hover:opacity-80"
                  style={{ background: plan.popular ? '#84CC16' : '#1A1A1A', color: plan.popular ? '#1A1A1A' : '#FFFFFF', fontFamily: 'var(--font-space-grotesk)' }}
                >
                  {plan.cta}
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="py-20 md:py-28 bg-white">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid lg:grid-cols-2 gap-8 items-end mb-14">
            <motion.div {...fadeInView(0)}>
              <p className="text-sm font-semibold tracking-widest uppercase mb-4" style={{ color: '#84CC16', fontFamily: 'var(--font-space-grotesk)' }}>Testimonials</p>
              <h2 className="leading-tight" style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 'clamp(32px, 4.5vw, 56px)', letterSpacing: '-0.03em', color: '#1A1A1A' }}>
                Loved by <span style={{ color: '#84CC16' }}>small organisations.</span>
              </h2>
            </motion.div>
            <motion.div {...fadeInView(0.1)}>
              <p className="text-base leading-relaxed" style={{ color: '#525252' }}>Early users finding funding they never knew existed.</p>
            </motion.div>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {testimonials.map((t, i) => (
              <motion.div key={t.name} {...fadeInView(i * 0.1)} className="rounded-3xl p-8 flex flex-col bg-white">
                <p className="text-base leading-relaxed flex-1 mb-8" style={{ color: '#525252' }}>&ldquo;{t.quote}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 rounded-full items-center justify-center text-white font-semibold text-sm flex-shrink-0" style={{ background: '#1A1A1A', fontFamily: 'var(--font-space-grotesk)' }}>{t.initials}</div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#1A1A1A', fontFamily: 'var(--font-space-grotesk)' }}>{t.name}</p>
                    <p className="text-xs" style={{ color: '#888888' }}>{t.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="py-20 md:py-28" style={{ background: "#F9F9F9" }}>
        <div className="mx-auto max-w-6xl px-6">
          <motion.div {...fadeInView(0)} className="grid lg:grid-cols-2 gap-16 items-start">
            <div>
              <p className="text-sm font-semibold tracking-widest uppercase mb-4" style={{ color: '#84CC16', fontFamily: 'var(--font-space-grotesk)' }}>Contact</p>
              <h2 className="mb-6 leading-tight" style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 'clamp(32px, 4.5vw, 56px)', letterSpacing: '-0.03em', color: '#1A1A1A' }}>
                Get in <span style={{ color: '#84CC16' }}>touch.</span>
              </h2>
              <p className="text-base leading-relaxed mb-10" style={{ color: '#525252' }}>Have a question, partnership idea, or just want to say hello? We&apos;d love to hear from you.</p>
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 rounded-xl items-center justify-center flex-shrink-0" style={{ background: '#F4F9E8' }}>
                    <Mail size={18} style={{ color: '#84CC16' }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold mb-0.5" style={{ color: '#1A1A1A', fontFamily: 'var(--font-space-grotesk)' }}>Email us</p>
                    <a href="mailto:hello@granttracker.co.uk" className="text-sm hover:underline" style={{ color: '#84CC16' }}>hello@granttracker.co.uk</a>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 rounded-xl items-center justify-center flex-shrink-0" style={{ background: '#F4F9E8' }}>
                    <MessageSquare size={18} style={{ color: '#84CC16' }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold mb-0.5" style={{ color: '#1A1A1A', fontFamily: 'var(--font-space-grotesk)' }}>Response time</p>
                    <p className="text-sm" style={{ color: '#525252' }}>Usually within 24 hours</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-3xl p-8 md:p-10" style={{ background: '#F9F9F9' }}>
              <ContactForm />
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 md:py-28" style={{ background: '#1A1A1A' }}>
        <div className="mx-auto max-w-6xl px-6">
          <motion.div {...fadeInView(0)} className="rounded-3xl p-12 md:p-20 text-center" style={{ background: '#84CC16' }}>
            <h2 className="mb-6 leading-[1.05]" style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 'clamp(36px, 5.5vw, 72px)', letterSpacing: '-0.03em', color: '#1A1A1A' }}>
              Find your funding.<br />Free to start.
            </h2>
            <p className="mx-auto mb-10 max-w-lg text-base leading-relaxed" style={{ color: '#2A4A1A' }}>
              Join CICs, charities, social enterprises and impact founders already discovering funding that actually fits.
            </p>
            <Link
              href="/auth/signup"
              className="inline-block rounded-full px-10 py-4 text-base font-semibold transition-opacity hover:opacity-80"
              style={{ background: '#1A1A1A', color: '#FFFFFF', fontFamily: 'var(--font-space-grotesk)' }}
            >
              Start for free
            </Link>
            <p className="mt-5 text-sm" style={{ color: '#2A4A1A' }}>No credit card required</p>
          </motion.div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-10" style={{ background: '#1A1A1A', borderTop: '1px solid #2A2A2A' }}>
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center gap-8 md:flex-row md:justify-between">
            <a href="/" className="flex items-center gap-2">
              <span className="text-lg font-bold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#FFFFFF' }}>Grant<span style={{ color: '#84CC16' }}>Tracker</span></span>
            </a>
            <div className="flex flex-wrap justify-center gap-6 text-sm" style={{ color: '#888888' }}>
              <a href="#how" className="hover:text-white transition-colors">How it works</a>
              <a href="#features" className="hover:text-white transition-colors">Features</a>
              <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
              <a href="#about" className="hover:text-white transition-colors">About</a>
              <a href="#contact" className="hover:text-white transition-colors">Contact</a>
            </div>
            <p className="text-xs" style={{ color: '#555555' }}>© 2026 Grant Tracker</p>
          </div>
        </div>
      </footer>

    </div>
  )
}
