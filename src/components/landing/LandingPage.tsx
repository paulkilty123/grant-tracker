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

// TODO: Replace with Typeform/Notion form URL before launch
const COHORT_URL = '/auth/signup'

const navLinks = [
  { label: 'How it works', href: '#how' },
  { label: 'Features', href: '#features' },
  { label: 'Founding cohort', href: '#cohort', cohort: true },
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
    title: 'CICs & social enterprises',
    desc: "Most funding databases were built with registered charities in mind. If you're a CIC or trading social enterprise, Grant Tracker matches funding to your legal structure and filters out grants you're not eligible to apply for.",
    Icon: Shield, iconBg: '#EAF3DE', iconColor: '#3B6D11',
  },
  {
    title: 'Charities & CIOs',
    desc: "Trusts, foundations, lottery and government programmes matched to your cause, size and geography. Results are filtered to what your organisation can actually apply for.",
    Icon: Landmark, iconBg: '#E6F1FB', iconColor: '#0C447C',
  },
  {
    title: 'Co-operatives & community groups',
    desc: "Whether you're worker-led, community-owned or unincorporated, funding is matched to how your organisation is set up, not just what you do.",
    Icon: TreePine, iconBg: '#FAECE7', iconColor: '#993C1D',
  },
  {
    title: 'Impact founders',
    desc: "Early-stage, pre-revenue or working as an individual. Accelerators, fellowships and awards matched to your sector, stage and team.",
    Icon: Lightbulb, iconBg: '#FAEEDA', iconColor: '#854F0B',
  },
]

const stats = [
  { value: '500+', label: 'Funding and support opportunities' },
  { value: '4', label: 'Funding types. Grants, programmes, investment and more' },
  { value: '12', label: 'Impact sectors covered' },
  { value: 'Free', label: 'During beta. Founding cohort access' },
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
    <div className="flex items-center gap-2 bg-[#F5F1E8] px-3 py-2.5 mb-4 border border-warm/40">
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
                <span key={tag} className="bg-[#F5F1E8] px-2 py-0.5 text-[11px] text-mid">{tag}</span>
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
              <div key={i} className="bg-[#F5F1E8] p-2.5">
                <div className="h-2 w-3/4 bg-charcoal/10" />
                <div className="mt-1.5 h-1.5 w-1/2 bg-charcoal/5" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
    <div className="bg-[#F5F1E8] border border-warm/60 p-3.5">
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
        <div key={s.label} className={`p-3 ${s.accent ? 'bg-forest/8 border border-forest/20' : 'bg-[#F5F1E8]'}`} style={s.accent ? { background: 'rgba(45,107,74,0.08)' } : {}}>
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
    <div className="bg-[#F5F1E8] border border-warm/60 p-3.5">
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
  const [activeSection, setActiveSection] = useState<string>('')

  useEffect(() => {
    const sectionIds = ['how', 'features', 'cohort', 'about', 'contact']
    const observers: IntersectionObserver[] = []
    sectionIds.forEach(id => {
      const el = document.getElementById(id)
      if (!el) return
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveSection(id) },
        { rootMargin: '-40% 0px -55% 0px' }
      )
      obs.observe(el)
      observers.push(obs)
    })
    return () => observers.forEach(o => o.disconnect())
  }, [])

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
          <a href="/" className="text-2xl font-bold text-[#2C2C2A] tracking-tight no-underline" style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}>
            GrantTracker
          </a>
          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-10">
            {navLinks.map((link) => {
              const sectionId = link.href.replace('#', '')
              const isActive = activeSection === sectionId
              return (
                <a
                  key={link.label}
                  href={link.href}
                  className="font-medium text-base transition-colors pb-1 flex items-center gap-1.5"
                  style={{
                    fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif',
                    color: (link as any).cohort ? '#173404' : isActive ? '#2C2C2A' : '#5F5E5A',
                    borderBottom: isActive ? '2px solid #8ECB3C' : '2px solid transparent',
                    transition: 'color 0.2s, border-color 0.2s',
                  }}
                >
                  {(link as any).cohort && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#8ECB3C' }} />}
                  {link.label}
                </a>
              )
            })}
          </nav>
          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-8">
            <Link href="/auth/login" className="text-[#2C2C2A] font-semibold text-base hover:opacity-80 transition-opacity no-underline" style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}>
              Sign in
            </Link>
            <Link href={COHORT_URL} className="bg-[#8ECB3C] text-[#173404] px-8 py-3 rounded-full font-bold text-base hover:opacity-90 transition-all no-underline">
              Apply to join
            </Link>
          </div>
          {/* Mobile */}
          <div className="flex md:hidden items-center gap-3">
            <Link href={COHORT_URL} className="bg-[#8ECB3C] text-[#173404] px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-all no-underline">Apply to join</Link>
            <button onClick={() => setMobileOpen(o => !o)} className="p-1 text-[#2C2C2A]" aria-label="Toggle menu">
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
                <a key={link.label} href={link.href} className="text-sm text-[#5F5E5A]" onClick={() => setMobileOpen(false)}>{link.label}</a>
              ))}
              <div className="flex flex-col gap-2 pt-2">
                <Link href="/auth/login" onClick={() => setMobileOpen(false)} className="text-center text-sm text-[#5F5E5A] py-2 border border-slate-200 rounded-full">Sign in</Link>
                <Link href={COHORT_URL} onClick={() => setMobileOpen(false)} className="bg-[#8ECB3C] text-[#173404] rounded-full text-center text-sm font-bold py-2 hover:opacity-90 transition-colors">Apply to join</Link>
              </div>
            </div>
          </motion.div>
        )}
      </motion.nav>

      {/* HERO */}
      <section className="relative overflow-hidden" style={{ background: '#FAFAF7', minHeight: '100vh' }}>
        <div className="relative z-10 mx-auto max-w-7xl px-6 md:px-8 grid lg:grid-cols-2 gap-16 lg:gap-12 items-start" style={{ paddingTop: 'clamp(100px, 14vw, 128px)', paddingBottom: '80px' }}>

          {/* Left: text */}
          <motion.div {...fadeUp(0)} className="flex flex-col justify-start">
            {/* Cohort status pill */}
            <div className="flex items-center gap-2 bg-[#E6F1FB] text-[#0C447C] px-4 py-2.5 rounded-full w-fit mb-10">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#8ECB3C' }} />
              <p className="font-bold text-xs tracking-wide uppercase">
                Founding cohort, applications open
              </p>
            </div>
            {/* Headline */}
            <h1
              className="font-bold leading-[1.05] text-[#2C2C2A] mb-10"
              style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif', fontSize: 'clamp(48px, 6.5vw, 88px)', letterSpacing: '-0.04em' }}
            >
              Funding,<br/>
              <span style={{ color: '#8ECB3C' }}>matched</span><br/>
              for you.
            </h1>
            {/* Subtext */}
            <p className="text-[#5F5E5A] leading-relaxed font-medium text-lg max-w-lg mb-10">
              Matched to your structure, sector and geography — across grants, programmes, social investment and in-kind support.
            </p>
            {/* CTAs */}
            <div className="flex flex-wrap gap-4 mb-4">
              <Link
                href={COHORT_URL}
                className="text-[#173404] px-9 py-4 rounded-full font-bold text-base hover:opacity-95 transition-all no-underline"
                style={{ background: 'linear-gradient(180deg, #8ECB3C 0%, #639922 100%)', boxShadow: '0 10px 20px -5px rgba(132, 204, 22, 0.3)' }}
              >
                Apply to join
              </Link>
              <a href="#how" className="bg-[#F1F0EA] text-[#2C2C2A] px-9 py-4 rounded-full font-bold text-base hover:bg-[#E4E2DA] transition-all">
                How it works
              </a>
            </div>
            <p className="text-sm" style={{ color: '#8A8986' }}>
              We&apos;re hand-picking 20&ndash;30 founding users. Free during beta.
            </p>
          </motion.div>

          {/* Right: UI card */}
          <motion.div {...fadeUp(0.2)} className="relative lg:pl-8 flex items-start pt-4">
            <div className="bg-white rounded-3xl p-8 w-full" style={{ boxShadow: '0 40px 100px -20px rgba(0,0,0,0.08)' }}>
              {/* Card header */}
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-2xl font-bold text-[#2C2C2A] tracking-tight" style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}>Digital Inclusion Fund</h3>
                  <p className="text-[#5F5E5A] font-medium mt-0.5 text-sm">Active Grant Application</p>
                </div>
                <div className="bg-[#C0DD97] px-4 py-1.5 rounded-full flex items-center gap-1.5 flex-shrink-0">
                  <span className="w-2 h-2 rounded-full bg-[#8ECB3C] animate-pulse" />
                  <span className="text-[#2C2C2A] font-bold text-xs tracking-tight">Pipeline: Draft</span>
                </div>
              </div>
              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div className="bg-[#F1F0EA] rounded-2xl p-5">
                  <p className="text-[#5F5E5A] text-[11px] font-bold uppercase tracking-wider mb-1">Matching Score</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-5xl font-bold text-[#8ECB3C]" style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}>94%</span>
                    <span className="text-[#5F5E5A] font-bold text-sm">Match</span>
                  </div>
                  <div className="mt-4">
                    <div className="h-1.5 w-full bg-[#E4E2DA] rounded-full overflow-hidden">
                      <div className="h-full bg-[#8ECB3C] rounded-full" style={{ width: '94%' }} />
                    </div>
                  </div>
                  <p className="text-[11px] text-[#5F5E5A] mt-3 font-semibold italic">Based on Youth Fund criteria</p>
                </div>
                <div className="bg-[#E6F1FB] rounded-2xl p-5">
                  <p className="text-[#0C447C] text-[11px] font-bold uppercase tracking-wider mb-1">Requested Funding</p>
                  <div className="flex items-baseline">
                    <span className="text-4xl font-bold text-[#2C2C2A]" style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}>£25,000</span>
                  </div>
                  <div className="mt-6 flex items-center gap-1.5">
                    <BadgeCheck className="w-4 h-4 text-[#0C447C]" />
                    <span className="text-[11px] font-bold text-[#0C447C] uppercase tracking-tight">Verified UK Funder</span>
                  </div>
                </div>
              </div>
              {/* List rows */}
              <div className="space-y-3">
                {[
                  { Icon: Users, label: 'Community Reach', sub: 'Social impact focus', iconBg: '#E6F1FB', iconColor: '#0C447C', tag: 'High Priority', tagStyle: { background: '#FAC775', color: '#412402' } },
                  { Icon: TrendingUp, label: 'Social Investment', sub: 'Sustainable growth model', iconBg: 'rgba(206,188,139,0.4)', iconColor: '#854F0B', tag: 'High Priority', tagStyle: { background: '#FAC775', color: '#412402' } },
                  { Icon: Rocket, label: 'Incubation Programme', sub: 'Capacity building', iconBg: 'rgba(190,242,100,0.4)', iconColor: '#639922', tag: 'Phase 1', tagStyle: { color: '#8ECB3C', fontWeight: '800', letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '11px' } },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between p-4 bg-[#F1F0EA] rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full flex items-center justify-center w-12 h-12 flex-shrink-0" style={{ background: row.iconBg }}>
                        <row.Icon className="w-5 h-5" style={{ color: row.iconColor }} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#2C2C2A]">{row.label}</p>
                        <p className="text-xs text-[#5F5E5A]">{row.sub}</p>
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
                        <span key={s} className="text-[10px] px-2 py-0.5 font-medium" style={{ background: '#FAEEDA', color: '#854F0B' }}>
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

      {/* STATS */}
      <section className="py-16 md:py-20" style={{ background: '#173404' }}>
        <div className="mx-auto max-w-6xl px-6 md:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 md:gap-14">
            {stats.map((s, i) => (
              <motion.div key={s.label} {...fadeInView(i * 0.1)}>
                <p className="leading-none mb-3" style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 500, fontSize: 'clamp(40px, 4vw, 56px)', color: '#8ECB3C', letterSpacing: '-0.02em' }}>{s.value}</p>
                <p style={{ fontSize: 15, color: '#C0DD97', lineHeight: 1.5 }}>{s.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="py-20 md:py-28 bg-white">
        <div className="mx-auto max-w-7xl px-6 md:px-8">

          {/* Header row */}
          <motion.div {...fadeInView(0)} className="grid lg:grid-cols-2 gap-8 items-end mb-14">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: '#8ECB3C' }}>Process</p>
              <h2 className="font-bold leading-tight" style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif', fontSize: 'clamp(32px, 4.5vw, 56px)', letterSpacing: '-0.03em', color: '#2C2C2A' }}>
                Setup, search and<br/>
                <span style={{ color: '#8ECB3C' }}>track what matters</span>
              </h2>
            </div>
            <div className="lg:pb-2">
              <p className="text-[#5F5E5A] text-base leading-relaxed max-w-sm">
                GrantTracker streamlines your funding journey from initial discovery to successful submission — matched to your organisation.
              </p>
            </div>
          </motion.div>

          {/* Cards — tonal green ladder */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {([
              { num: '01', title: 'Setup your profile', desc: 'List your impact, mission and target groups.', Icon: Users, bg: '#F4F9ED', numOpacity: 0.35, textOpacity: 0.6 },
              { num: '02', title: 'Search & match', desc: 'Discover opportunities matched to you.', Icon: Search, bg: '#EAF3DE', numOpacity: 0.38, textOpacity: 0.7 },
              { num: '03', title: 'Track opportunities', desc: 'Add to pipeline, get deadline alerts and apply.', Icon: TrendingUp, bg: '#C0DD97', numOpacity: 0.5, textOpacity: 0.78 },
              { num: '04', title: 'Submit & win', desc: 'Increase your win-rate with strongly aligned applications.', Icon: Award, bg: '#8ECB3C', numOpacity: 0.55, textOpacity: 0.82 },
            ] as const).map((step, i) => (
              <motion.div
                key={step.title}
                {...fadeInView(i * 0.08)}
                className="rounded-3xl p-7 flex flex-col min-h-[260px]"
                style={{ background: step.bg }}
              >
                <span className="text-4xl font-bold mb-6" style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif', color: '#173404', opacity: step.numOpacity }}>{step.num}</span>
                <h3 className="font-bold text-lg mb-3 leading-snug" style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif', color: '#173404' }}>{step.title}</h3>
                <p className="text-sm leading-relaxed flex-1" style={{ color: '#173404', opacity: step.textOpacity }}>{step.desc}</p>
                <div className="mt-6">
                  <step.Icon className="w-6 h-6" style={{ color: '#173404', opacity: 0.7 }} />
                </div>
              </motion.div>
            ))}
          </div>

        </div>
      </section>

      {/* FUNDING TYPES */}
      <section className="py-20 md:py-28" style={{ background: '#FAFAF7' }}>
        <div className="mx-auto max-w-7xl px-6 md:px-8">

          {/* Header row — matches Process section */}
          <motion.div {...fadeInView(0)} className="grid lg:grid-cols-2 gap-8 items-end mb-14">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: '#8ECB3C' }}>Funding Types</p>
              <h2 className="font-bold leading-tight" style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif', fontSize: 'clamp(32px, 4.5vw, 56px)', letterSpacing: '-0.03em', color: '#2C2C2A' }}>
                Not just grants,<br/><span style={{ color: '#8ECB3C' }}>the full picture.</span>
              </h2>
            </div>
            <div className="lg:pb-2">
              <p className="text-[#5F5E5A] text-base leading-relaxed max-w-sm">
                Not every organisation needs a grant. We surface the full funding landscape matched to your structure and stage.
              </p>
            </div>
          </motion.div>

          {/* 2x2 grid */}
          <div className="grid md:grid-cols-2 gap-4">
            {([
              {
                badge: '£300 – £500k+', badgeColor: '#3B6D11', badgeBg: '#EAF3DE',
                title: 'Grants',
                desc: 'Trusts, foundations, National Lottery, Innovate UK, arts councils and government programmes.',
                Icon: Landmark, iconColor: '#3B6D11', iconBg: '#EAF3DE', decoBg: 'rgba(148,207,53,0.10)',
              },
              {
                badge: 'Support + mentoring', badgeColor: '#993C1D', badgeBg: '#FAECE7',
                title: 'Programmes',
                desc: 'Accelerators, incubators, fellowships and structured programmes with mentoring, networks and workspace.',
                Icon: Rocket, iconColor: '#993C1D', iconBg: '#FAECE7', decoBg: 'rgba(251,146,60,0.10)',
              },
              {
                badge: '£20k – £3m', badgeColor: '#0C447C', badgeBg: '#E6F1FB',
                title: 'Social investment',
                desc: 'Patient capital, loans and blended finance from Big Issue Invest, Charity Bank, Resonance and others.',
                Icon: TrendingUp, iconColor: '#0C447C', iconBg: '#E6F1FB', decoBg: 'rgba(181,212,244,0.12)',
              },
              {
                badge: 'Skills, space, time', badgeColor: '#854F0B', badgeBg: '#FAEEDA',
                title: 'In-kind support',
                desc: 'Mentoring, training and workspace. Often overlooked, high value, especially at an early stage.',
                Icon: HeartHandshake, iconColor: '#854F0B', iconBg: '#FAEEDA', decoBg: 'rgba(250,199,117,0.10)',
              },
            ] as const).map((card, i) => (
              <motion.div
                key={card.title}
                {...fadeInView(i * 0.07)}
                className="relative bg-white rounded-3xl group"
                style={{ boxShadow: '0 2px 16px rgba(0,0,0,0.05)', border: '0.5px solid rgba(23,52,4,0.08)', padding: 18, overflow: 'hidden' }}
              >
                {/* Soft decorative circle behind icon */}
                <div
                  style={{ position: 'absolute', top: -20, right: -20, width: 130, height: 130, borderRadius: '50%', background: card.decoBg, opacity: 0.85, pointerEvents: 'none', zIndex: 0 }}
                />
                {/* Icon centred in its circle */}
                <div
                  style={{ position: 'absolute', top: 23, right: 23, width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
                >
                  <card.Icon className="w-7 h-7" style={{ color: card.iconColor }} />
                </div>
                {/* Badge */}
                <span
                  className="inline-block px-3 py-0.5 rounded-full font-medium text-[10px] mb-4 relative z-10 uppercase tracking-wider"
                  style={{ color: card.badgeColor, background: card.badgeBg, letterSpacing: '0.02em' }}
                >
                  {card.badge}
                </span>
                {/* Title */}
                <h3
                  className="font-bold mb-3 relative z-10"
                  style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif', fontSize: '1.375rem', color: '#2C2C2A' }}
                >
                  {card.title}
                </h3>
                {/* Description */}
                <p className="text-sm leading-relaxed max-w-md relative z-10" style={{ color: '#5F5E5A' }}>{card.desc}</p>
              </motion.div>
            ))}
          </div>

        </div>
      </section>

      {/* FEATURES */}
      <div id="features">
        <section className="py-20 md:py-28 bg-white">
          <div className="mx-auto max-w-7xl px-6 md:px-8">
            <div className="grid lg:grid-cols-2 gap-16 items-center">

              {/* Left: copy */}
              <motion.div {...fadeInView(0)}>
                <p className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: '#8ECB3C' }}>Features</p>
                <h2 className="font-bold leading-tight mb-5" style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif', fontSize: 'clamp(32px, 4.5vw, 56px)', letterSpacing: '-0.03em', color: '#2C2C2A' }}>
                  Search &amp; track,<br/><span style={{ color: '#8ECB3C' }}>in one place.</span>
                </h2>
                <ul className="space-y-6 mb-10">
                  {[
                    { title: 'Intelligent matching', desc: 'Profile-based matching across grants, programmes, investment and in-kind support.' },
                    { title: 'Eligibility check', desc: "Seven-step filter removes grants you can't apply for, by structure, size, stage and more." },
                    { title: 'Structured funder data', desc: 'Funders tagged by legal structure, sector, stage and eligibility. Deeper than keyword search.' },
                    { title: 'Funder briefs', desc: "Insider context on each funder's priorities, timing and quirks." },
                    { title: 'Pipeline & deadlines', desc: 'Track from identified to submitted, with alerts up to 14 days before deadlines.' },
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-4">
                      <span className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full" style={{ background: '#EAF3DE' }}>
                        <Check className="w-3.5 h-3.5" style={{ color: '#3B6D11' }} />
                      </span>
                      <div className="pt-0.5">
                        <p className="font-bold text-[#2C2C2A] text-base leading-snug mb-1">{item.title}</p>
                        <p className="text-sm text-[#5F5E5A] leading-relaxed">{item.desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <Link href={COHORT_URL} className="inline-flex items-center gap-3 bg-[#8ECB3C] text-[#173404] px-7 py-4 rounded-full font-bold text-base hover:opacity-90 transition-all no-underline">
                  Apply to join <ArrowRight className="w-4 h-4" />
                </Link>
              </motion.div>

              {/* Right: description + scattered feature cards */}
              <div className="hidden lg:flex flex-col gap-0">
                <div className="relative" style={{ height: '560px' }}>

                  {/* Dashboard — back right */}
                  <motion.div {...fadeInView(0.1)} className="absolute" style={{ width: '240px', top: '20px', right: '0px', zIndex: 1 }}>
                    <div className="bg-white rounded-2xl p-4" style={{ transform: 'rotate(7deg)', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(132,204,22,0.15)' }}>
                          <LayoutGrid className="w-3.5 h-3.5" style={{ color: '#8ECB3C' }} />
                        </div>
                        <p className="text-[11px] font-bold text-[#2C2C2A] uppercase tracking-wider">Dashboard</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="rounded-xl p-2.5" style={{ background: '#F1F0EA' }}>
                          <p className="text-[17px] font-bold text-[#2C2C2A] leading-tight">42k</p>
                          <p className="text-[9px] text-[#5F5E5A] uppercase tracking-wide font-medium">Won</p>
                        </div>
                        <div className="rounded-xl p-2.5" style={{ background: 'rgba(132,204,22,0.15)' }}>
                          <p className="text-[17px] font-bold leading-tight" style={{ color: '#8ECB3C' }}>68%</p>
                          <p className="text-[9px] uppercase tracking-wide font-medium" style={{ color: '#8ECB3C' }}>Success</p>
                        </div>
                      </div>
                      <p className="text-[9px] text-[#5F5E5A] mb-2">Funding won — last 7 months</p>
                      <div className="flex items-end gap-1" style={{ height: '40px' }}>
                        {[40, 25, 55, 35, 70, 60, 85].map((h, i) => (
                          <div key={i} className="flex-1 rounded-sm" style={{ height: `${h}%`, background: i === 6 ? '#8ECB3C' : 'rgba(132,204,22,0.35)' }} />
                        ))}
                      </div>
                    </div>
                  </motion.div>

                  {/* Pipeline — front left */}
                  <motion.div {...fadeInView(0.05)} className="absolute" style={{ width: '220px', top: '60px', left: '0px', zIndex: 3 }}>
                    <div className="bg-white rounded-2xl p-4" style={{ transform: 'rotate(-8deg)', boxShadow: '0 8px 32px rgba(0,0,0,0.10)' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(234,88,12,0.12)' }}>
                          <ArrowRight className="w-3.5 h-3.5" style={{ color: '#D85A30' }} />
                        </div>
                        <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#D85A30' }}>Pipeline</p>
                      </div>
                      <p className="text-[26px] font-bold text-[#2C2C2A] leading-tight" style={{ fontFamily: 'var(--font-space-grotesk), sans-serif' }}>£187,500</p>
                      <p className="text-[11px] font-medium mb-3" style={{ color: '#D85A30' }}>7 active opportunities</p>
                      <div className="flex flex-col gap-1.5">
                        {['Identified', 'Applying', 'Submitted'].map((label) => (
                          <div key={label} className="flex items-center justify-between rounded-xl px-2.5 py-1.5" style={{ background: '#F1F0EA' }}>
                            <span className="text-[10px] text-[#2C2C2A]">{label}</span>
                            <div className="w-2 h-2 rounded-full" style={{ background: label === 'Applying' ? '#8ECB3C' : '#E4E2DA' }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>

                  {/* Search — centre, largest, front */}
                  <motion.div {...fadeInView(0.08)} className="absolute" style={{ width: '290px', top: '110px', left: 'calc(50% - 145px)', zIndex: 5 }}>
                    <div className="bg-white rounded-2xl p-5" style={{ transform: 'rotate(-1deg)', boxShadow: '0 16px 48px rgba(0,0,0,0.12)' }}>
                      <p className="text-[11px] font-bold uppercase tracking-wider mb-2.5" style={{ color: '#639922' }}>Search</p>
                      <div className="flex items-center gap-2 rounded-full px-3 py-2 mb-3" style={{ background: '#F1F0EA' }}>
                        <Search className="w-3 h-3 text-[#5F5E5A] flex-shrink-0" />
                        <span className="text-[11px] text-[#5F5E5A]">community garden...</span>
                      </div>
                      <div className="flex flex-col">
                        {[
                          { name: 'Community Growing Grants', pct: 94, barColor: '#639922', pctColor: '#639922' },
                          { name: 'Green Spaces Fund',        pct: 87, barColor: '#8A8986',  pctColor: '#8A8986' },
                          { name: 'Urban Nature Programme',   pct: 79, barColor: '#BA7517',  pctColor: '#BA7517' },
                        ].map((r, i) => (
                          <div key={r.name} className={`flex items-center justify-between gap-2 py-2 ${i < 2 ? 'border-b border-[#F1F0EA]' : ''}`}>
                            <p className="text-[11px] font-semibold text-[#2C2C2A] leading-tight">{r.name}</p>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <div className="w-10 h-1.5 rounded-full overflow-hidden" style={{ background: '#E8E0D1' }}>
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
                        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(99,153,34,0.12)' }}>
                          <Award className="w-3.5 h-3.5" style={{ color: '#639922' }} />
                        </div>
                        <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#639922' }}>Awarded</p>
                      </div>
                      <p className="text-[13px] font-semibold text-[#2C2C2A] leading-snug mb-1">London Community Foundation</p>
                      <p className="text-[11px] text-[#5F5E5A] mb-3">Grow to Give — Community Growing</p>
                      <div className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: 'rgba(99,153,34,0.10)' }}>
                        <span className="text-[11px] text-[#5F5E5A]">Grant awarded</span>
                        <span className="text-[15px] font-bold" style={{ color: '#639922' }}>£8,000</span>
                      </div>
                    </div>
                  </motion.div>

                  {/* Alerts — front bottom left */}
                  <motion.div {...fadeInView(0.1)} className="absolute" style={{ width: '240px', top: '330px', left: '10px', zIndex: 4 }}>
                    <div className="bg-white rounded-2xl p-4" style={{ transform: 'rotate(-3deg)', boxShadow: '0 8px 32px rgba(0,0,0,0.10)' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="relative w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#F1F0EA' }}>
                          <Bell className="w-3.5 h-3.5 text-[#5F5E5A]" />
                          <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-coral-saturated border border-white" />
                        </div>
                        <p className="text-[11px] font-bold text-[#2C2C2A] uppercase tracking-wider">Alerts</p>
                      </div>
                      <div className="flex flex-col">
                        {[
                          { name: 'Youth Fund 2025',        org: 'Paul Hamlyn Foundation', days: '2d',  urgent: true  },
                          { name: 'Green Spaces Grant',     org: 'National Lottery',       days: '8d',  urgent: false },
                          { name: 'Digital Inclusion Fund', org: 'DCMS',                   days: '14d', urgent: false },
                        ].map((a, i) => (
                          <div key={a.name} className={`flex items-center justify-between gap-2 py-2 ${i < 2 ? 'border-b border-[#F1F0EA]' : ''}`}>
                            <div>
                              <p className="text-[11px] font-semibold text-[#2C2C2A] leading-tight">{a.name}</p>
                              <p className="text-[10px] text-[#5F5E5A]">{a.org}</p>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0" style={a.urgent ? { background: '#C0DD97', color: '#2C2C2A' } : { background: '#F1F0EA', color: '#5F5E5A' }}>{a.days}</span>
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
      <section id="about" className="py-16 md:py-20" style={{ background: '#FAFAF7' }}>
        <div className="mx-auto max-w-6xl px-6">
          {/* Split panel: cream left / forest right */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderRadius: 14, overflow: 'hidden' }} className="max-lg:\!grid-cols-1">

            {/* LEFT: cream panel */}
            <motion.div {...fadeInView(0)} style={{ background: '#F5F1E8', padding: '56px 44px' }}>
              <p style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 500, fontSize: 12, color: '#8ECB3C', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>About</p>
              <h2 style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 'clamp(32px, 4.5vw, 56px)', lineHeight: 1.05, letterSpacing: '-0.03em', color: '#2C2C2A', margin: '0 0 28px 0' }}>
                Built from<br /><span style={{ color: '#8ECB3C' }}>the inside.</span>
              </h2>
              <blockquote style={{ position: 'relative', paddingLeft: '42px', paddingRight: '12px', marginTop: 8 }}>
                <span className="select-none" style={{ position: 'absolute', left: 0, top: 2, fontSize: '58px', color: '#8ECB3C', fontFamily: "'Fraunces', Georgia, serif", lineHeight: 0.7, fontWeight: 500 }}>&ldquo;</span>
                <p style={{ fontFamily: "'Fraunces', Georgia, serif", fontWeight: 400, fontSize: 18, color: '#2C2C2A', lineHeight: 1.55, letterSpacing: '-0.005em', margin: '0 0 16px 0' }}>
                  I&apos;ve spent 20 years in the social enterprise and charity sector, co-founding a youth music organisation, leading development strategy at local charities, and driving fundraising across a global co-working network.
                </p>
                <p style={{ fontFamily: "'Fraunces', Georgia, serif", fontWeight: 400, fontSize: 18, color: '#2C2C2A', lineHeight: 1.55, letterSpacing: '-0.005em', margin: '0 0 4px 0' }}>
                  The frustration was the same every time: a fragmented funding ecosystem that forced people like me to spend more time hunting opportunities than delivering impactful work.
                </p>
                <div className="select-none" style={{ textAlign: 'right', fontFamily: "'Fraunces', Georgia, serif", fontSize: '58px', color: '#8ECB3C', lineHeight: 0.5, fontWeight: 500, marginTop: 16, paddingRight: 4 }}>&rdquo;</div>
              </blockquote>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 13, fontWeight: 500, color: '#5F5E5A', marginTop: 18 }}>Paul Kilty, founder</p>
            </motion.div>

            {/* RIGHT: dark forest panel */}
            <motion.div {...fadeInView(0.1)} style={{ background: '#173404', padding: '56px 44px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: '#8ECB3C', borderRadius: 14, padding: '32px 32px 26px' }}>
                <p style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 500, fontSize: 'clamp(48px, 5vw, 64px)', color: '#173404', letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 12 }}>£8bn+</p>
                <p style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 11.5, color: '#173404', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.8 }}>Awarded by UK trusts &amp; foundations annually</p>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(142,203,60,0.2)', borderRadius: 14, padding: '32px 32px 30px', marginBottom: 28 }}>
                <p style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 500, fontSize: 19, color: 'white', letterSpacing: '-0.01em', marginBottom: 14 }}>Filtered for you.</p>
                <p style={{ fontSize: 14.5, color: '#C0DD97', lineHeight: 1.65 }}>
                  There are thousands of UK funders, but only a fraction fit your organisation. Grant Tracker filters by your legal structure, sector, location and stage, so you only see what you can actually apply for.
                </p>
              </div>

              {/* Example filter chain */}
              <div style={{ marginTop: 4 }}>
                <p style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 500, fontSize: 11.5, color: '#8ECB3C', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>An example</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                  {(() => {
                    const ghostPill = (label: string) => (
                      <span key={label} style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 16px', background: 'transparent', border: '0.5px solid rgba(142,203,60,0.35)', borderRadius: 20, fontFamily: 'var(--font-space-grotesk)', fontSize: 13, fontWeight: 500, color: '#C0DD97', letterSpacing: '-0.005em', whiteSpace: 'nowrap' }}>{label}</span>
                    )
                    const chevron = (i: number) => (
                      <svg key={`c${i}`} width="10" height="14" viewBox="0 0 10 14" fill="none" stroke="#8ECB3C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}><polyline points="2 2 8 7 2 12"/></svg>
                    )
                    return [
                      ghostPill('CIC'), chevron(0),
                      ghostPill('Arts & culture'), chevron(1),
                      ghostPill('London'), chevron(2),
                      ghostPill('Early-stage'), chevron(3),
                      <span key="result" style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 16px', background: '#8ECB3C', border: '0.5px solid #8ECB3C', borderRadius: 20, fontFamily: 'var(--font-space-grotesk)', fontSize: 13, fontWeight: 500, color: '#173404', letterSpacing: '-0.005em', whiteSpace: 'nowrap' }}>£10k Arts Grant</span>
                    ]
                  })()}
                </div>
              </div>

            </motion.div>

          </div>
        </div>
      </section>

      {/* ABOUT — Block 2: Who it's for */}
      <section className="py-20 md:py-28 bg-white">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid lg:grid-cols-2 gap-8 items-end mb-14">
            <motion.div {...fadeInView(0)}>
              <p className="text-sm font-semibold tracking-widest uppercase mb-4" style={{ color: '#8ECB3C', fontFamily: 'var(--font-space-grotesk)' }}>Who it&apos;s for</p>
              <h2 className="leading-tight" style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 'clamp(32px, 4.5vw, 56px)', letterSpacing: '-0.03em', color: '#2C2C2A' }}>
                Funding matched to<br/><span style={{ color: '#8ECB3C' }}>your structure.</span>
              </h2>
            </motion.div>
            <motion.div {...fadeInView(0.1)}>
              <p className="text-base leading-relaxed" style={{ color: '#5F5E5A' }}>
                Whether you're a CIC, impact founder, grassroots charity or community group, find funding you can actually apply for.
              </p>
            </motion.div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {audiences.map((card, i) => (
              <motion.div
                key={card.title}
                {...fadeInView(i * 0.08)}
                className="flex items-start gap-4 p-6 bg-white rounded-2xl"
                style={{ border: '0.5px solid rgba(23,52,4,0.08)', boxShadow: '0 1px 6px rgba(23,52,4,0.04)' }}
              >
                {/* Icon in rounded square */}
                <div
                  className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{ background: card.iconBg }}
                >
                  <card.Icon className="w-7 h-7" style={{ color: card.iconColor }} />
                </div>
                {/* Content */}
                <div className="flex-1 pt-0.5">
                  <h3 className="font-bold mb-2" style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: '1.05rem', color: '#2C2C2A' }}>
                    {card.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: '#5F5E5A' }}>{card.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ABOUT — Block 3: Values + AI */}
      <section className="py-20 md:py-28" style={{ background: '#FAFAF7' }}>
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid lg:grid-cols-2 gap-8 items-end mb-14">
            <motion.div {...fadeInView(0)}>
              <p className="text-sm font-semibold tracking-widest uppercase mb-4" style={{ color: '#8ECB3C', fontFamily: 'var(--font-space-grotesk)' }}>Values</p>
              <h2 className="leading-tight" style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 'clamp(32px, 4.5vw, 56px)', letterSpacing: '-0.03em', color: '#2C2C2A' }}>
                How we <span style={{ color: '#8ECB3C' }}>work.</span>
              </h2>
            </motion.div>
            <motion.div {...fadeInView(0.1)}>
              <p className="text-base leading-relaxed" style={{ color: '#5F5E5A' }}>
                A few principles that shape every decision we make.
              </p>
            </motion.div>
          </div>

          {/* Three value cards - distinct colours */}
          <div className="grid md:grid-cols-3 gap-4 mb-4">
            {([
              {
                label: 'Honest',
                body: "We don't inflate match scores or dress up poor-fit grants. If something isn't right for you, we'd rather tell you than waste your time.",
                bg: '#EAF3DE', titleColor: '#173404', bodyColor: '#3B6D11',
              },
              {
                label: 'Practical',
                body: "Every feature exists because it makes the funding process easier. We don't add complexity for the sake of it.",
                bg: '#E6F1FB', titleColor: '#0C447C', bodyColor: 'rgba(12,68,124,0.85)',
              },
              {
                label: 'Accessible',
                body: "Good funding intelligence shouldn't only reach organisations with big budgets. Grant Tracker will always be priced to stay within reach of smaller ones.",
                bg: '#F5F1E8', titleColor: '#2C2C2A', bodyColor: '#5F5E5A',
              },
            ] as const).map((v, i) => (
              <motion.div key={v.label} {...fadeInView(i * 0.08)} className="rounded-3xl p-8 flex flex-col" style={{ background: v.bg }}>
                <p className="text-4xl font-bold mb-4" style={{ fontFamily: 'var(--font-space-grotesk)', color: v.titleColor, letterSpacing: '-0.02em' }}>{v.label}</p>
                <p className="text-base leading-relaxed flex-1" style={{ color: v.bodyColor }}>{v.body}</p>
              </motion.div>
            ))}
          </div>

          {/* AI approach — full-width card */}
          <motion.div {...fadeInView(0.1)} className="rounded-3xl p-10 md:p-12 bg-white" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <div className="grid lg:grid-cols-2 gap-8 items-start">
              <div>
                <h2 className="font-bold leading-tight" style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 'clamp(32px, 4.5vw, 56px)', letterSpacing: '-0.03em', color: '#2C2C2A' }}>
                  We use AI so you can spend less time searching.<br />
                  <span style={{ color: '#8ECB3C' }}>Not less time thinking.</span>
                </h2>
              </div>
              <div className="space-y-4">
                <p className="text-base leading-relaxed" style={{ color: '#5F5E5A' }}>
                  Funders are inundated with misaligned AI-written applications. We don&apos;t want to make the problem worse. So it&apos;s more important than ever to find the right match, and for your authentic voice to come through. That&apos;s how you stand out.
                </p>
                <p className="text-base leading-relaxed" style={{ color: '#5F5E5A' }}>
                  Grant Tracker uses AI where it genuinely helps: matching your profile to the right opportunities, building intelligence about how funders make decisions, and cutting the time you spend searching.
                </p>
              </div>
            </div>
          </motion.div>

        </div>
      </section>

      {/* APPLICATION / COHORT */}
      <section id="cohort" className="py-20 md:py-28" style={{ background: '#FAFAF7' }}>
        <div className="mx-auto max-w-6xl px-6">
          <motion.div {...fadeInView(0)}>
            <p className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: '#8ECB3C', fontFamily: 'var(--font-space-grotesk)' }}>Founding cohort</p>
            <h2 className="mb-4 leading-tight" style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 'clamp(32px, 4.5vw, 56px)', letterSpacing: '-0.03em', color: '#2C2C2A' }}>
              Building this with a <span style={{ color: '#8ECB3C' }}>small group.</span>
            </h2>
            <p className="text-base leading-relaxed mb-10 max-w-xl" style={{ color: '#5F5E5A' }}>
              We&apos;re hand-picking 20&ndash;30 organisations for the founding cohort. If that sounds like you, we&apos;d love to hear from you.
            </p>
            <div className="grid md:grid-cols-2 gap-4 items-stretch">
              {/* Who we're looking for */}
              <div className="rounded-3xl p-8 bg-white flex flex-col" style={{ border: '0.5px solid rgba(23,52,4,0.08)', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                <p className="text-base font-semibold mb-5" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#2C2C2A' }}>Who we&apos;re looking for</p>
                <div className="flex flex-col flex-1">
                  {([
                    { text: 'CICs and social enterprises', sub: 'Whether you&apos;re early-stage or scaling, from trust grants to blended social investment', dot: 'lime' },
                    { text: 'Small charities and CIOs', sub: "Where fundraising is one person&apos;s many jobs, not a whole team", dot: 'lime' },
                    { text: 'Co-operatives and community groups', sub: 'Worker-led, community-owned, or unincorporated', dot: 'lime' },
                    { text: 'Impact founders', sub: 'Early-stage, pre-revenue, or working as an individual', dot: 'lime' },
                    { text: 'Willing to give real feedback', sub: 'Occasional calls and messages as we build. This is the main thing we ask', dot: 'coral' },
                  ] as const).map((item, i, arr) => (
                    <div key={i} className="flex items-start gap-3 py-3" style={{ borderBottom: i < arr.length - 1 ? '0.5px solid rgba(23,52,4,0.08)' : 'none' }}>
                      <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: item.dot === 'coral' ? '#D85A30' : '#8ECB3C' }} />
                      <div>
                        <p className="text-sm font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#2C2C2A' }} dangerouslySetInnerHTML={{ __html: item.text }} />
                        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: '#8A8986' }} dangerouslySetInnerHTML={{ __html: item.sub }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* The exchange */}
              <div className="rounded-3xl p-8 flex flex-col" style={{ background: '#F5F1E8', border: '0.5px solid rgba(23,52,4,0.08)' }}>
                <p className="text-base font-semibold mb-5" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#2C2C2A' }}>The exchange</p>
                <div className="flex flex-col flex-1">
                  {[
                    { title: 'Free access during beta', sub: 'Full product access while we build together' },
                    { title: 'Free first year after launch', sub: 'You keep full access for 12 months, on us' },
                    { title: 'Founding rate from year two', sub: 'A permanently lower price for sticking with us' },
                    { title: 'Direct line to the founder', sub: 'Your feedback shapes what we build next' },
                  ].map((item, i, arr) => (
                    <div key={i} className="flex items-start gap-3 py-3" style={{ borderBottom: i < arr.length - 1 ? '0.5px solid rgba(23,52,4,0.14)' : 'none' }}>
                      <span className="text-sm font-bold flex-shrink-0 mt-0.5" style={{ color: '#639922' }}>&#10003;</span>
                      <div>
                        <p className="text-sm font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#2C2C2A' }}>{item.title}</p>
                        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: '#5F5E5A' }}>{item.sub}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6">
                  <Link href={COHORT_URL} className="inline-flex items-center gap-2 bg-[#8ECB3C] text-[#173404] px-6 py-3 rounded-full font-bold text-sm hover:opacity-90 transition-all no-underline">
                    Apply to join <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="py-20 md:py-28" style={{ background: "#FAFAF7" }}>
        <div className="mx-auto max-w-6xl px-6">
          <motion.div {...fadeInView(0)} className="grid lg:grid-cols-2 gap-16 items-start">
            <div>
              <p className="text-sm font-semibold tracking-widest uppercase mb-4" style={{ color: '#8ECB3C', fontFamily: 'var(--font-space-grotesk)' }}>Contact</p>
              <h2 className="mb-6 leading-tight" style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 'clamp(32px, 4.5vw, 56px)', letterSpacing: '-0.03em', color: '#2C2C2A' }}>
                Get in <span style={{ color: '#8ECB3C' }}>touch.</span>
              </h2>
              <p className="text-base leading-relaxed mb-10" style={{ color: '#5F5E5A' }}>Have a question, partnership idea, or just want to say hello? We&apos;d love to hear from you.</p>
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 rounded-xl items-center justify-center flex-shrink-0" style={{ background: '#F1F7E4' }}>
                    <Mail size={18} style={{ color: '#8ECB3C' }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold mb-0.5" style={{ color: '#2C2C2A', fontFamily: 'var(--font-space-grotesk)' }}>Email us</p>
                    <a href="mailto:hello@granttracker.co.uk" className="text-sm hover:underline" style={{ color: '#8ECB3C' }}>hello@granttracker.co.uk</a>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 rounded-xl items-center justify-center flex-shrink-0" style={{ background: '#F1F7E4' }}>
                    <MessageSquare size={18} style={{ color: '#8ECB3C' }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold mb-0.5" style={{ color: '#2C2C2A', fontFamily: 'var(--font-space-grotesk)' }}>Response time</p>
                    <p className="text-sm" style={{ color: '#5F5E5A' }}>Usually within 24 hours</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-3xl p-8 md:p-10" style={{ background: '#FAFAF7' }}>
              <ContactForm />
            </div>
          </motion.div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="pt-20 md:pt-28 pb-16 md:pb-24 text-center" style={{ background: '#173404' }}>
        <div className="mx-auto max-w-6xl px-6">
          <motion.div {...fadeInView(0)}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-7 text-xs font-semibold uppercase tracking-wider" style={{ background: 'rgba(142,203,60,0.15)', color: '#C0DD97', fontFamily: 'var(--font-space-grotesk)' }}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#8ECB3C' }} />
              Founding cohort, applications open
            </div>
            <h2 className="mb-5 leading-tight" style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 'clamp(32px, 5vw, 56px)', letterSpacing: '-0.025em', color: '#FFFFFF' }}>
              Help us build <span style={{ color: '#8ECB3C' }}>something better.</span>
            </h2>
            <p className="mx-auto mb-8 max-w-md text-base leading-relaxed" style={{ color: '#C0DD97' }}>
              We&apos;re hand-picking 20&ndash;30 organisations for the founding cohort. Free during beta, free first year after launch.
            </p>
            <Link
              href={COHORT_URL}
              className="inline-flex items-center gap-2 rounded-full px-9 py-4 text-base font-bold transition-opacity hover:opacity-90 no-underline"
              style={{ background: '#8ECB3C', color: '#173404', fontFamily: 'var(--font-space-grotesk)' }}
            >
              Apply to join <ArrowRight className="w-4 h-4" />
            </Link>
            <p className="mt-5 text-sm" style={{ color: '#97C459' }}>Applications reviewed within a week</p>
          </motion.div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="px-6 py-8" style={{ background: '#0F2502' }}>
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between" style={{ paddingBottom: '20px', borderBottom: '0.5px solid rgba(192,221,151,0.15)', marginBottom: '20px' }}>
            <a href="/" className="flex items-center gap-2 no-underline">
              <span className="text-lg font-bold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#FFFFFF', letterSpacing: '-0.02em' }}>GrantTracker</span>
            </a>
            <div className="flex flex-wrap gap-5 text-xs font-medium" style={{ color: '#97C459', fontFamily: 'var(--font-space-grotesk)' }}>
              <a href="#how" className="hover:text-white transition-colors">How it works</a>
              <a href="#features" className="hover:text-white transition-colors">Features</a>
              <a href="#cohort" className="hover:text-white transition-colors">Founding cohort</a>
              <a href="#about" className="hover:text-white transition-colors">About</a>
              <a href="#contact" className="hover:text-white transition-colors">Contact</a>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:justify-between text-xs" style={{ color: '#97C459' }}>
            <span>Built for the UK social impact sector.</span>
            <span>&copy; 2026 Grant Tracker</span>
          </div>
        </div>
      </footer>

    </div>
  )
}
