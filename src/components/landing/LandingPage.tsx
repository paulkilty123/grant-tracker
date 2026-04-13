'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { Menu, X, Check, Search, Calendar, TrendingUp, Activity, Clock, Mail, MessageSquare, Bell, LayoutGrid, ArrowRight, Award, CheckCircle, BadgeCheck, Users, Rocket } from 'lucide-react'
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
  { title: 'CICs', desc: 'Matched funding that understands your structure, not just charity-focused results.' },
  { title: 'Charities & CIOs', desc: 'Trusts, foundations and government programmes matched to your cause, size and geography.' },
  { title: 'Co-operatives & CBS', desc: 'Grants and community finance that fits your mutual structure.' },
  { title: 'Social Enterprises', desc: 'Ltd company with a mission? Matched opportunities without needing CIC or charity status.' },
  { title: 'Impact Founders', desc: 'Accelerators, grants and programmes matched to your stage, sector and team.' },
  { title: 'Community Groups', desc: 'Local and national funding matched to your size, area and cause.' },
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
            {navLinks.map((link, i) => (
              i === 0 ? (
                <div key={link.label} className="relative flex flex-col items-center">
                  <a href={link.href} className="text-[#1A1A1A] font-semibold text-base" style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}>{link.label}</a>
                  <div className="absolute -bottom-2 w-full h-[3px] bg-[#84CC16] rounded-full" />
                </div>
              ) : (
                <a key={link.label} href={link.href} className="text-[#525252] hover:text-[#1A1A1A] transition-colors font-medium text-base" style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}>{link.label}</a>
              )
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
      <section id="how" className="py-16 md:py-20">
        <div className="mx-auto max-w-5xl px-6">
          <motion.div {...fadeInView(0)} className="mb-16">
            <p className="text-sm font-semibold text-coral uppercase tracking-wider">How it works</p>
            <h2 className="mt-3 font-serif text-4xl md:text-5xl leading-tight max-w-lg">Setup, search and track what matters.</h2>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-warm rounded-xl overflow-hidden">
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
      <section className="py-16 md:py-20 bg-[#1C1C2E]">
        <div className="mx-auto max-w-5xl px-6">
          <motion.div {...fadeInView(0)} className="mb-16">
            <p className="text-sm font-semibold text-coral uppercase tracking-wider">Funding Types</p>
            <h2 className="mt-3 font-serif text-4xl md:text-5xl leading-tight max-w-lg text-cream">Not just grants, the full picture.</h2>
          </motion.div>
          <div className="grid sm:grid-cols-2 gap-px bg-white/10 rounded-xl overflow-hidden">
            {fundingTypes.map((t, i) => (
              <motion.div key={t.title} {...fadeInView(i * 0.05)} className="bg-[#1C1C2E] p-8">
                <span className="text-xs font-semibold text-coral uppercase tracking-wider">{t.range}</span>
                <h3 className="mt-3 font-serif text-xl text-cream">{t.title}</h3>
                <p className="mt-3 text-sm text-cream/50 leading-relaxed">{t.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <div id="features">
        <section className="py-16 md:py-24 bg-white">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid lg:grid-cols-2 gap-16 items-center">

              {/* Left: copy */}
              <motion.div {...fadeInView(0)}>
                <p className="text-sm font-semibold text-coral uppercase tracking-wider mb-3">Features</p>
                <h2 className="font-serif text-3xl leading-tight md:text-4xl mb-4">From search to submission, in one place.</h2>
                <p className="text-mid leading-relaxed mb-8">Find funding, track every application and never miss a deadline — all matched to your organisation&apos;s profile.</p>
                <ul className="space-y-4">
                  {[
                    'Profile-based matching across grants, programmes, investment and in-kind support',
                    'Live search ranked by structure, sector, geography and mission',
                    'Pipeline tracking from first contact to submission',
                    'Deadline alerts for grants closing within 14 days',
                    'Dashboard summary of pipeline value and upcoming deadlines',
                  ].map((b, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-charcoal">
                      <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-coral/10 text-coral text-xs font-bold shrink-0">✓</span>
                      <span className="leading-relaxed">{b}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>

              {/* Right: scattered feature cards */}
              <div className="relative hidden lg:block" style={{ height: '580px' }}>

                {/* Dashboard — back right */}
                <motion.div {...fadeInView(0.1)} className="absolute" style={{ width: '240px', top: '20px', right: '0px', zIndex: 1 }}>
                  <div className="bg-white rounded-xl border border-warm/80 p-4" style={{ transform: 'rotate(7deg)', boxShadow: '0 4px 20px rgba(26,46,43,0.08)' }}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-7 h-7 rounded-full bg-warm flex items-center justify-center flex-shrink-0">
                        <LayoutGrid className="w-3.5 h-3.5 text-mid" />
                      </div>
                      <p className="text-[11px] font-bold text-charcoal uppercase tracking-wider">Dashboard</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-[#f5f2ed] rounded-lg p-2.5">
                        <p className="text-[17px] font-bold text-charcoal leading-tight">42k</p>
                        <p className="text-[9px] text-mid uppercase tracking-wide font-medium">Won</p>
                      </div>
                      <div className="bg-[#f5f2ed] rounded-lg p-2.5">
                        <p className="text-[17px] font-bold text-charcoal leading-tight">68%</p>
                        <p className="text-[9px] text-mid uppercase tracking-wide font-medium">Success</p>
                      </div>
                    </div>
                    <p className="text-[9px] text-mid mb-2">Funding won — last 7 months</p>
                    <div className="flex items-end gap-1" style={{ height: '40px' }}>
                      {[40, 25, 55, 35, 70, 60, 85].map((h, i) => (
                        <div key={i} className="flex-1 bg-coral/60 rounded-sm" style={{ height: `${h}%` }} />
                      ))}
                    </div>
                  </div>
                </motion.div>

                {/* Pipeline — front left */}
                <motion.div {...fadeInView(0.05)} className="absolute" style={{ width: '230px', top: '60px', left: '0px', zIndex: 3 }}>
                  <div className="bg-white rounded-xl border border-warm/80 p-4" style={{ transform: 'rotate(-8deg)', boxShadow: '0 8px 32px rgba(26,46,43,0.12)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-full bg-coral/15 flex items-center justify-center flex-shrink-0">
                        <ArrowRight className="w-3.5 h-3.5 text-coral" />
                      </div>
                      <p className="text-[11px] font-bold text-coral uppercase tracking-wider">Pipeline</p>
                    </div>
                    <p className="font-serif text-[26px] font-bold text-charcoal leading-tight">£187,500</p>
                    <p className="text-[11px] text-coral font-medium mb-3">7 active opportunities</p>
                    <div className="flex flex-col gap-1.5">
                      {[
                        { label: 'Identified', dots: [false, false, false] },
                        { label: 'Applying',   dots: [true,  true] },
                        { label: 'Submitted',  dots: [false, false] },
                      ].map((stage) => (
                        <div key={stage.label} className="flex items-center justify-between bg-[#f5f2ed] rounded-lg px-2.5 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <div className="w-3.5 h-3.5 rounded-full border border-mid/30 flex items-center justify-center flex-shrink-0">
                              <div className="w-1.5 h-1.5 rounded-full bg-mid/30" />
                            </div>
                            <span className="text-[10px] text-charcoal">{stage.label}</span>
                          </div>
                          <div className="flex gap-1">
                            {stage.dots.map((active, i) => (
                              <div key={i} className={`w-2 h-2 rounded-full ${active ? 'bg-coral/70' : 'bg-mid/25'}`} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>

                {/* Search — centre, largest, front */}
                <motion.div {...fadeInView(0.08)} className="absolute" style={{ width: '300px', top: '100px', left: 'calc(50% - 150px)', zIndex: 5 }}>
                  <div className="bg-white rounded-xl border border-warm/80 p-5" style={{ transform: 'rotate(-1deg)', boxShadow: '0 14px 44px rgba(26,46,43,0.14)' }}>
                    <p className="text-[11px] font-bold text-charcoal uppercase tracking-wider mb-2.5">Search</p>
                    <div className="flex items-center gap-2 bg-[#f5f2ed] rounded-full px-3 py-2 mb-3 border border-warm/40">
                      <Search className="w-3 h-3 text-mid flex-shrink-0" />
                      <span className="text-[11px] text-mid">community garden...</span>
                    </div>
                    <div className="flex flex-col">
                      {[
                        { name: 'Community Growing Grants', amount: null,   pct: 94, color: 'bg-forest' },
                        { name: 'Green Spaces Fund',        amount: '£10k', pct: 87, color: 'bg-forest/70' },
                        { name: 'Urban Nature Programme',   amount: '£15k', pct: 79, color: 'bg-amber-400' },
                      ].map((r, i) => (
                        <div key={r.name} className={`flex items-center justify-between gap-2 py-2 ${i < 2 ? 'border-b border-warm/40' : ''}`}>
                          <div>
                            <p className="text-[11px] font-semibold text-charcoal leading-tight">{r.name}</p>
                            {r.amount && <p className="text-[10px] text-mid">{r.amount}</p>}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <div className="w-10 h-1.5 bg-warm rounded-full overflow-hidden">
                              <div className={`h-full ${r.color} rounded-full`} style={{ width: `${r.pct}%` }} />
                            </div>
                            <span className="text-[10px] font-bold text-charcoal">{r.pct}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>

                {/* Awarded — bottom right */}
                <motion.div {...fadeInView(0.12)} className="absolute" style={{ width: '220px', top: '340px', right: '0px', zIndex: 2 }}>
                  <div className="bg-white rounded-xl border border-warm/80 p-4" style={{ transform: 'rotate(4deg)', boxShadow: '0 8px 32px rgba(26,46,43,0.10)' }}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-7 h-7 rounded-full bg-forest/10 flex items-center justify-center flex-shrink-0">
                        <Award className="w-3.5 h-3.5 text-forest" />
                      </div>
                      <p className="text-[11px] font-bold text-forest uppercase tracking-wider">Awarded</p>
                    </div>
                    <p className="text-[13px] font-semibold text-charcoal leading-snug mb-1">London Community Foundation</p>
                    <p className="text-[11px] text-mid mb-3">Grow to Give — Community Growing</p>
                    <div className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'rgba(45,107,74,0.08)' }}>
                      <span className="text-[11px] text-mid">Grant awarded</span>
                      <span className="text-[15px] font-bold text-forest">£8,000</span>
                    </div>
                  </div>
                </motion.div>

                {/* Alerts — front bottom left */}
                <motion.div {...fadeInView(0.1)} className="absolute" style={{ width: '250px', top: '320px', left: '10px', zIndex: 4 }}>
                  <div className="bg-white rounded-xl border border-warm/80 p-4" style={{ transform: 'rotate(-3deg)', boxShadow: '0 8px 32px rgba(26,46,43,0.12)' }}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="relative w-7 h-7 rounded-full bg-warm flex items-center justify-center flex-shrink-0">
                        <Bell className="w-3.5 h-3.5 text-mid" />
                        <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-red-400 border border-white" />
                      </div>
                      <p className="text-[11px] font-bold text-charcoal uppercase tracking-wider">Alerts</p>
                    </div>
                    <div className="flex flex-col">
                      {[
                        { name: 'Youth Fund 2025',        org: 'Paul Hamlyn Foundation', days: '2d',  urgent: true  },
                        { name: 'Green Spaces Grant',     org: 'National Lottery',       days: '8d',  urgent: false },
                        { name: 'Digital Inclusion Fund', org: 'DCMS',                   days: '14d', urgent: false },
                      ].map((a, i) => (
                        <div key={a.name} className={`flex items-center justify-between gap-2 py-2 ${i < 2 ? 'border-b border-warm/40' : ''}`}>
                          <div>
                            <p className="text-[11px] font-semibold text-charcoal leading-tight">{a.name}</p>
                            <p className="text-[10px] text-mid">{a.org}</p>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${a.urgent ? 'bg-coral text-white' : 'bg-warm text-mid'}`}>{a.days}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>

              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ABOUT — dark founder story */}
      <section id="about" className="py-16 md:py-24 bg-[#1C1C2E]">
        <div className="mx-auto max-w-3xl px-6">
          <motion.div {...fadeInView(0)} className="mb-16">
            <p className="text-sm font-semibold text-coral uppercase tracking-wider">About</p>
            <h2 className="mt-3 font-serif text-4xl md:text-5xl leading-tight text-cream">Built from the inside.</h2>
          </motion.div>
          <motion.div {...fadeInView(0.05)}>
            <blockquote className="border-l-2 border-sage pl-6 mb-8">
              <p className="text-lg text-cream/80 leading-relaxed font-serif italic mb-4">
                &ldquo;I&apos;ve worked in the social enterprise and charity sector for 20 years as a fundraiser
                and social entrepreneur, from co-founding a youth radio station to working at local
                charities and leading on fundraising at Impact Hub.
              </p>
              <p className="text-lg text-cream/80 leading-relaxed font-serif italic">
                Throughout all of it, I was consistently frustrated by the same thing: a fragmented
                funding ecosystem that forced people like me to spend a disproportionate amount of
                time hunting opportunities rather than delivering impactful work.&rdquo;
              </p>
              <footer className="mt-5 text-base font-semibold text-cream/50 not-italic">Paul Kilty, founder</footer>
            </blockquote>
            <p className="text-base text-cream/70 leading-relaxed">
              Not just a smarter search, a tool built to understand your organisation and discover
              the opportunities most worth your time.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ABOUT — why it exists, who it's for, values, AI */}
      <section className="py-16 md:py-20 bg-cream">
        <div className="mx-auto max-w-5xl px-6">

          {/* Why it exists */}
          <div className="grid md:grid-cols-2 gap-12 mb-16 items-center">
            <motion.div {...fadeInView(0)}>
              <h3 className="font-serif text-2xl font-bold text-charcoal mb-5">Why it exists</h3>
              <div className="space-y-4">
                <p className="text-base leading-relaxed text-mid">
                  The UK has thousands of active funders, but finding the right ones is effectively
                  a full-time job. Most charities, CICs and social enterprises can&apos;t afford
                  that — and they shouldn&apos;t have to.
                </p>
                <p className="text-base leading-relaxed text-mid">
                  Grant Tracker matches you to grants, programmes, investments and in-kind support
                  so you can spend that time delivering.
                </p>
              </div>
            </motion.div>
            <motion.div {...fadeInView(0.1)} className="flex flex-col items-center justify-center text-center py-8">
              <p className="font-serif text-7xl md:text-8xl leading-none text-forest">£8bn<span className="text-gold">+</span></p>
              <p className="mt-4 text-sm font-semibold text-mid uppercase tracking-wider max-w-[180px]">awarded by UK trusts &amp; foundations annually</p>
            </motion.div>
          </div>

          {/* Who it's for */}
          <motion.div {...fadeInView(0.05)} className="mb-16">
            <h3 className="font-serif text-2xl font-bold text-charcoal mb-8">Who it&apos;s for</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-warm/60 rounded-xl overflow-hidden">
              {audiences.map((v, i) => (
                <motion.div key={v.title} {...fadeInView(i * 0.06)} className="bg-white p-8">
                  <h4 className="font-serif text-xl mb-2">{v.title}</h4>
                  <p className="text-sm text-mid leading-relaxed">{v.desc}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Our values + Our approach to AI — side by side */}
          <div className="grid md:grid-cols-2 gap-16 items-start">

            <motion.div {...fadeInView(0.05)}>
              <h3 className="font-serif text-2xl font-bold text-charcoal mb-6">Our values</h3>
              <div className="space-y-6">
                {[
                  { label: 'Honest', body: "We don't inflate match scores or dress up poor-fit grants. If something isn't right for you, we'd rather tell you than waste your time." },
                  { label: 'Practical', body: "Every feature exists because it makes the funding process easier. We don't add complexity for the sake of it." },
                  { label: 'Accessible', body: "Good funding intelligence shouldn't only be available to organisations with big budgets. Grant Tracker is priced so that smaller charities and social enterprises can afford it." },
                ].map((v, i) => (
                  <motion.div key={v.label} {...fadeInView(i * 0.07)} className="flex gap-4">
                    <div className="w-1.5 h-1.5 rounded-full bg-forest mt-2 flex-shrink-0" />
                    <div>
                      <p className="text-base font-bold text-charcoal mb-1">{v.label}</p>
                      <p className="text-base leading-relaxed text-mid">{v.body}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div {...fadeInView(0.1)}>
              <h3 className="font-serif text-2xl font-bold text-charcoal mb-6">Our approach to AI</h3>
              <div className="space-y-4">
                <p className="text-base leading-relaxed text-mid">
                  We recognise funders are increasingly inundated with AI-generated applications that
                  are bland, generic and interchangeable. The last thing we want is to make that
                  problem worse.
                </p>
                <p className="text-base leading-relaxed text-mid">
                  We encourage that your voice, story and evidence is authentically communicated so
                  funders take notice. Sure, AI can play a supporting role to refine your language,
                  and sharpen your argument, but always in service of something genuinely yours.
                  Not instead of it.
                </p>
                <p className="text-base leading-relaxed text-mid">
                  Grant Tracker uses AI where it genuinely helps: matching your profile to the right
                  opportunities, building intelligence about how funders make decisions, and cutting
                  down the time you spend searching. This is better for funders and applicants.
                </p>
              </div>
            </motion.div>

          </div>

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
                className={`relative p-8 flex flex-col ${plan.popular ? 'bg-[#121f2b] text-cream' : 'bg-cream'}`}
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
                  className={`mt-8 block rounded-xl text-center py-3 text-sm font-semibold transition-colors ${plan.popular ? 'bg-coral text-white hover:bg-coral-light' : 'bg-[#121f2b] text-white hover:bg-[#121f2b]/90'}`}
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
                  <div className="flex h-10 w-10 items-center justify-center bg-[#121f2b] text-white font-semibold text-sm">{t.initials}</div>
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
              <Link href="/auth/signup" className="bg-coral text-white rounded-xl px-10 py-3.5 text-base font-semibold hover:opacity-90 transition-colors">Start for free</Link>
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
