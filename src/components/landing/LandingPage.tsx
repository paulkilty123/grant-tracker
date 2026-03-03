'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Menu, X, Target, ClipboardList, Bell, User, Check, Heart, Users, Lightbulb, Mail, MessageSquare } from 'lucide-react'
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
              { icon: Target, stat: 'AI Match', label: 'learns from your feedback' },
              { icon: ClipboardList, stat: 'Pipeline', label: 'tracks every application' },
              { icon: Bell, stat: 'Alerts', label: 'when new matches appear' },
              { icon: User, stat: 'Personalisation', label: 'matched to your mission' },
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

      {/* ══ COVERAGE ════════════════════════════════════════════════════════ */}
      <section id="coverage" className="py-24 bg-forest/[0.03]">
        <div className="max-w-6xl mx-auto px-6">

          {/* Heading */}
          <motion.div {...fadeInView(0)} className="text-center mb-16">
            <span className="inline-block mb-3 rounded-full bg-forest/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-forest">
              UK Coverage
            </span>
            <h2 className="text-4xl md:text-5xl mb-4">
              Every layer of UK funding,<br />
              <span className="text-gradient-warm italic">in one place</span>
            </h2>
            <p className="mx-auto max-w-2xl text-mid text-lg">
              From hyperlocal community trusts to national lottery programmes — 800+ opportunities spanning every region of England, Scotland, Wales and Northern Ireland.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

            {/* ── UK Map ── */}
            <motion.div {...fadeInView(0)} className="flex flex-col items-center">
              <div className="relative w-56 md:w-64">
                <svg viewBox="0 0 220 320" xmlns="http://www.w3.org/2000/svg" className="w-full drop-shadow-lg">
                  <defs>
                    <filter id="mapShadow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#2D5A3D" floodOpacity="0.20"/>
                    </filter>
                    <filter id="dotGlow" x="-100%" y="-100%" width="300%" height="300%">
                      <feGaussianBlur stdDeviation="2.5" result="blur"/>
                      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                    </filter>
                  </defs>

                  {/* ── Great Britain (main body) — geographic path from Natural Earth 50m ── */}
                  <path
                    d="M120.0,260.7 L118.7,261.7 L114.2,262.7 L112.3,263.7 L108.9,266.0 L108.3,266.3 L103.2,265.7 L99.4,262.7 L97.0,261.5 L96.0,261.3 L94.9,261.7 L92.7,262.1 L90.5,262.0 L91.6,260.6 L93.2,259.8 L89.7,259.3 L88.7,258.9 L87.6,257.9 L84.9,257.8 L83.6,258.0 L81.4,259.3 L77.9,260.7 L73.7,258.8 L72.9,257.9 L72.9,256.3 L72.3,255.0 L71.1,254.6 L72.6,253.0 L74.4,251.8 L78.3,250.7 L84.4,248.1 L87.7,247.0 L90.8,245.1 L92.1,243.9 L93.0,242.3 L93.9,240.3 L95.3,238.7 L94.0,238.3 L93.4,237.1 L93.6,235.8 L94.1,234.8 L93.7,233.4 L92.7,231.9 L92.8,230.8 L93.0,229.6 L90.6,229.7 L88.2,230.1 L86.0,230.9 L83.9,232.0 L82.0,232.3 L82.0,231.3 L82.9,230.2 L85.0,228.6 L87.3,227.2 L88.1,226.1 L88.7,225.0 L89.9,224.0 L92.8,222.1 L98.5,220.1 L99.4,220.0 L101.6,220.2 L103.8,219.9 L105.7,219.1 L107.6,219.0 L111.9,221.2 L110.6,217.8 L112.5,217.0 L115.3,220.0 L116.3,220.3 L118.5,219.9 L117.6,219.4 L116.7,219.4 L115.4,218.9 L114.4,217.9 L112.5,214.9 L112.7,213.1 L113.8,211.2 L115.2,209.4 L114.1,209.1 L113.2,208.4 L112.9,206.6 L113.3,205.1 L115.7,203.7 L116.3,201.6 L116.7,199.3 L116.3,198.3 L113.9,198.5 L112.7,198.9 L111.7,199.6 L110.6,199.5 L107.7,197.0 L106.0,195.0 L103.0,190.9 L102.6,188.5 L105.0,183.2 L108.7,179.7 L113.1,178.5 L112.3,178.3 L105.6,178.3 L103.4,178.7 L101.3,180.1 L100.2,180.5 L99.0,180.7 L97.9,181.4 L96.8,182.4 L95.7,183.0 L93.5,182.8 L92.4,183.0 L91.6,182.5 L91.0,181.5 L90.1,181.3 L89.2,181.6 L87.2,182.8 L85.2,183.6 L82.7,182.8 L79.5,181.3 L78.8,181.8 L78.1,183.2 L77.7,185.3 L75.5,183.5 L73.5,181.0 L72.8,179.5 L72.8,177.7 L73.8,177.0 L75.0,177.7 L76.7,173.5 L80.1,168.1 L81.3,166.5 L82.1,164.4 L82.0,163.0 L81.2,161.9 L78.1,159.3 L78.1,157.1 L78.4,154.7 L79.3,153.2 L79.7,152.9 L83.9,153.0 L82.2,152.2 L79.0,150.0 L79.1,149.2 L79.8,147.1 L79.5,147.4 L78.8,148.3 L77.4,150.6 L76.6,151.1 L74.3,151.7 L73.9,152.8 L73.5,153.1 L72.3,153.2 L72.0,154.2 L71.7,154.3 L71.4,153.2 L71.4,151.3 L71.9,149.6 L72.7,148.2 L76.1,145.2 L74.4,146.1 L70.7,149.0 L68.8,150.8 L68.3,151.5 L68.1,152.0 L68.1,152.6 L69.0,155.9 L68.7,157.4 L65.5,167.3 L64.9,168.3 L64.4,168.8 L63.8,168.9 L62.3,168.7 L61.5,168.0 L61.5,167.2 L61.9,165.9 L63.2,161.2 L63.8,159.9 L64.7,158.7 L66.5,156.5 L66.5,156.4 L65.2,156.8 L64.7,156.7 L64.3,156.2 L64.5,149.9 L65.5,147.8 L65.9,144.7 L66.8,142.1 L67.8,140.1 L68.7,137.7 L69.8,136.6 L70.2,134.9 L71.4,133.1 L72.5,131.2 L71.9,131.4 L65.4,136.3 L63.7,137.2 L61.5,137.0 L59.7,136.4 L58.3,135.2 L57.7,133.0 L56.1,132.9 L54.7,132.5 L54.7,132.2 L56.5,131.0 L59.5,130.6 L62.3,128.6 L59.8,127.2 L60.0,126.8 L62.1,125.7 L64.9,121.8 L65.5,118.3 L64.1,116.6 L63.6,115.6 L61.1,114.3 L60.6,112.8 L60.9,111.9 L61.7,111.0 L63.0,110.4 L65.1,109.7 L63.2,109.0 L62.5,108.2 L62.0,107.1 L62.0,106.4 L63.0,103.3 L63.5,102.1 L64.6,100.5 L69.5,100.6 L70.0,99.9 L70.6,99.8 L73.1,100.5 L72.7,99.8 L68.6,96.0 L68.3,95.2 L69.4,93.2 L69.5,92.3 L69.3,91.3 L69.7,90.5 L71.0,90.2 L74.9,90.2 L75.9,89.9 L75.5,88.8 L74.5,87.5 L74.4,86.4 L74.6,85.5 L74.6,83.5 L74.8,82.6 L75.7,81.3 L76.5,80.9 L77.5,80.7 L79.7,81.1 L80.5,81.7 L81.4,82.9 L82.1,82.8 L84.8,81.5 L85.6,81.3 L86.7,82.8 L91.3,81.6 L97.5,81.0 L101.3,80.2 L105.2,79.9 L108.9,79.0 L112.7,79.4 L112.9,79.9 L112.7,80.7 L111.7,82.7 L111.9,85.0 L111.7,85.8 L111.2,86.6 L109.8,88.2 L106.0,90.5 L99.2,95.7 L95.1,98.3 L94.5,99.6 L94.3,101.3 L96.6,101.7 L97.6,102.2 L97.1,103.1 L93.5,106.1 L92.4,108.9 L95.2,108.8 L97.4,108.3 L101.9,106.6 L106.2,105.3 L108.2,105.2 L112.2,106.2 L113.1,106.3 L114.8,105.8 L116.5,105.7 L128.0,106.0 L131.2,105.4 L133.4,106.2 L135.2,107.9 L136.9,111.2 L136.8,111.7 L135.8,113.2 L133.9,115.0 L132.2,117.6 L131.8,119.0 L131.5,120.5 L130.9,121.8 L127.8,128.3 L124.6,131.9 L123.2,134.4 L121.4,136.4 L119.8,137.7 L118.0,138.5 L112.9,139.4 L111.5,140.0 L109.8,141.2 L107.9,141.7 L110.0,141.6 L112.1,141.0 L115.9,140.8 L120.4,142.9 L119.9,144.6 L118.2,146.0 L114.2,146.2 L110.4,149.2 L108.7,150.1 L107.0,150.6 L104.7,150.4 L100.7,149.7 L98.9,148.8 L100.5,150.2 L102.3,150.9 L112.9,152.6 L113.5,152.4 L116.8,150.6 L121.3,150.6 L129.9,153.9 L132.3,156.4 L135.8,159.9 L137.7,161.3 L139.2,162.6 L140.0,164.5 L141.7,170.7 L143.5,176.7 L146.0,183.2 L147.1,184.9 L148.6,186.2 L156.1,189.1 L157.7,190.0 L160.6,192.8 L163.4,195.7 L166.0,198.0 L168.8,199.8 L167.4,200.7 L166.5,202.2 L167.2,204.2 L168.3,206.1 L170.5,209.2 L172.6,212.5 L171.8,212.0 L171.1,211.7 L170.0,211.8 L169.0,211.7 L167.1,210.6 L165.2,209.3 L161.6,209.8 L159.7,209.6 L157.9,209.6 L161.2,210.4 L164.8,210.4 L172.8,216.0 L175.5,219.3 L177.1,223.6 L176.0,225.5 L174.3,226.8 L172.7,228.2 L171.2,229.8 L175.6,232.2 L176.6,232.1 L177.6,231.8 L178.5,231.0 L180.1,229.0 L180.9,228.4 L183.7,228.1 L186.0,228.2 L188.3,228.7 L190.3,228.5 L194.4,229.4 L196.4,230.1 L201.7,233.5 L202.7,235.4 L203.3,237.8 L203.4,240.4 L202.5,242.9 L201.5,245.0 L200.8,247.8 L200.4,248.9 L199.8,249.6 L197.0,251.9 L195.2,252.8 L194.5,252.4 L193.6,252.4 L193.6,253.0 L194.4,254.1 L194.5,255.5 L192.8,256.4 L191.1,256.9 L188.4,256.3 L184.5,258.2 L187.3,259.1 L187.9,260.2 L187.2,261.9 L185.5,262.8 L183.5,263.1 L181.6,263.2 L179.9,263.6 L178.4,264.4 L180.3,264.0 L181.7,264.4 L182.6,265.9 L183.3,266.3 L187.2,266.9 L189.5,266.9 L194.1,266.6 L196.3,266.6 L197.1,266.9 L197.1,268.1 L196.8,271.2 L196.2,271.8 L190.1,274.3 L188.8,276.1 L188.5,277.1 L184.9,277.0 L183.3,278.1 L180.4,278.8 L178.2,279.7 L176.0,280.7 L174.2,281.0 L166.5,279.7 L161.9,279.9 L155.5,280.9 L153.9,280.7 L151.5,279.7 L149.0,279.1 L146.2,278.8 L143.6,277.8 L145.2,279.6 L141.7,281.3 L140.2,281.6 L138.6,281.6 L135.2,282.1 L132.0,281.8 L132.5,283.1 L133.3,284.1 L132.7,284.5 L132.0,284.7 L126.1,283.9 L125.2,284.0 L124.5,284.7 L122.3,284.4 L120.2,283.1 L118.0,282.3 L115.7,281.9 L113.8,282.0 L106.2,284.0 L104.6,286.0 L103.8,288.7 L102.8,291.2 L100.9,293.1 L98.8,293.3 L96.8,292.0 L93.0,290.6 L91.6,289.6 L91.2,289.5 L90.8,289.9 L89.3,290.3 L87.7,290.3 L85.4,290.7 L81.2,291.9 L79.5,292.7 L75.9,294.9 L75.1,295.5 L73.8,297.7 L71.8,298.1 L69.9,296.7 L67.8,296.2 L65.7,296.7 L64.3,297.4 L63.7,296.8 L63.6,295.6 L65.3,294.1 L69.6,292.9 L73.3,290.0 L75.2,288.2 L75.9,287.2 L76.9,286.5 L78.0,286.3 L78.6,285.2 L83.9,280.6 L84.4,279.6 L84.6,277.8 L85.0,276.0 L89.3,274.8 L91.3,271.0 L91.9,270.7 L97.9,270.0 L102.3,270.1 L106.7,270.8 L108.9,270.9 L111.2,270.6 L112.9,269.6 L116.0,265.9 L117.7,264.2 L119.7,262.8 L121.5,261.1 L124.5,257.9 L122.5,259.0 L120.0,260.7 Z"
                    fill="#2D5A3D"
                    filter="url(#mapShadow)"
                  />

                  {/* ── Northern Ireland ── */}
                  <path
                    d="M53.0,200.5 L51.5,200.4 L50.3,200.8 L49.6,201.2 L48.9,201.2 L46.9,201.3 L44.9,201.3 L44.6,200.6 L45.0,198.6 L44.5,198.1 L42.7,197.8 L42.0,197.4 L40.9,196.0 L40.7,195.3 L40.6,194.5 L39.5,193.3 L38.2,192.5 L37.3,192.4 L35.8,193.8 L34.5,195.2 L35.0,195.8 L35.4,196.7 L34.6,197.4 L32.5,198.8 L32.2,199.4 L31.6,199.7 L30.6,199.3 L28.0,199.4 L26.9,199.1 L25.5,198.1 L22.2,197.3 L21.6,195.6 L21.0,195.3 L17.2,192.3 L16.7,191.3 L17.2,190.7 L18.6,189.8 L23.4,188.3 L24.1,187.7 L24.2,187.2 L22.8,186.6 L21.6,185.9 L21.2,185.5 L21.1,185.1 L21.9,184.6 L23.3,184.5 L24.4,184.8 L25.3,184.3 L26.9,183.9 L27.9,183.3 L28.9,181.8 L29.8,180.5 L29.9,179.8 L30.8,177.3 L31.2,176.6 L34.2,175.0 L34.9,175.9 L36.4,176.1 L37.8,175.3 L39.3,172.6 L40.4,172.5 L41.6,172.7 L44.0,172.4 L48.2,171.2 L50.1,171.1 L52.8,171.8 L54.7,171.8 L56.5,173.6 L57.5,176.6 L59.6,179.5 L62.5,182.1 L62.6,183.6 L61.6,184.4 L59.4,185.4 L59.5,186.5 L60.8,186.0 L62.1,185.7 L65.1,186.0 L66.1,187.1 L66.8,188.7 L67.2,190.1 L66.9,191.6 L66.1,191.1 L65.3,189.8 L64.4,189.2 L63.4,188.9 L63.8,190.7 L63.6,193.1 L64.1,193.4 L65.5,193.4 L64.6,195.9 L62.7,196.6 L60.4,196.8 L59.9,197.7 L59.5,198.8 L58.3,200.5 L56.8,201.5 L54.9,201.3 L53.0,200.5 Z"
                    fill="#2D5A3D" opacity="0.85"
                    filter="url(#mapShadow)"
                  />

                  {/* ── Outer Hebrides ── */}
                  <path
                    d="M53.4,87.0 L51.0,91.9 L50.1,92.0 L49.2,93.3 L46.7,94.6 L49.0,94.6 L49.6,95.1 L49.6,96.0 L49.2,96.6 L46.2,98.8 L44.3,99.7 L42.2,102.0 L41.1,102.0 L40.0,103.5 L39.1,104.1 L38.6,104.1 L38.0,103.8 L36.7,102.4 L39.1,100.9 L39.4,100.2 L41.0,99.3 L40.9,99.1 L38.2,97.9 L37.2,97.1 L37.3,96.7 L38.6,95.8 L38.0,95.7 L37.5,95.2 L36.9,95.0 L36.6,94.5 L36.5,93.4 L36.7,92.1 L37.5,91.6 L37.8,91.0 L38.1,90.8 L39.2,91.1 L40.5,92.1 L41.8,91.7 L43.5,91.9 L43.5,91.7 L42.3,89.3 L42.5,88.8 L43.2,88.2 L46.9,86.5 L51.5,83.6 L52.7,83.1 L53.0,83.5 L53.5,85.0 L53.4,87.0 Z"
                    fill="#2D5A3D" opacity="0.9"
                  />

                  {/* ── Inner Hebrides (Islay / Jura area) ── */}
                  <path
                    d="M54.5,110.8 L54.4,112.1 L54.1,113.5 L54.5,115.0 L54.6,116.1 L55.4,116.5 L55.9,116.9 L59.4,117.5 L62.7,117.3 L63.4,117.8 L63.4,118.5 L62.9,119.2 L61.1,120.7 L58.8,122.9 L58.1,123.4 L57.4,123.4 L56.9,123.2 L56.5,119.1 L54.1,119.7 L52.2,119.6 L51.1,119.1 L50.3,118.2 L48.8,115.7 L44.4,114.7 L43.2,113.4 L42.8,112.6 L43.0,112.1 L43.9,111.1 L45.0,111.5 L45.8,111.3 L46.2,110.8 L46.2,110.4 L45.6,109.6 L45.6,109.3 L50.0,108.2 L50.4,106.4 L51.4,106.3 L52.5,106.8 L54.1,108.7 L54.5,110.8 Z"
                    fill="#2D5A3D" opacity="0.9"
                  />

                  {/* ── Islay ── */}
                  <path
                    d="M61.4,142.2 L53.9,143.7 L51.3,143.6 L51.0,142.8 L51.5,142.4 L53.6,141.9 L54.5,138.3 L51.3,136.7 L51.1,136.2 L51.4,135.4 L51.7,135.1 L53.7,134.2 L54.5,134.1 L55.2,134.2 L56.6,135.1 L58.2,137.1 L60.2,137.5 L61.7,138.3 L61.4,142.2 Z"
                    fill="#2D5A3D" opacity="0.9"
                  />

                  {/* ── Shetland Islands ── */}
                  <path
                    d="M145.7,24.0 L146.1,26.1 L147.0,25.5 L148.5,27.6 L149.3,27.6 L150.5,26.7 L150.2,28.6 L149.0,33.8 L148.6,34.7 L148.4,36.3 L148.1,36.6 L147.7,39.7 L146.9,40.8 L146.2,43.2 L145.9,43.5 L144.8,42.5 L145.9,38.7 L146.3,36.5 L146.0,35.4 L145.4,34.4 L143.8,34.3 L142.4,34.8 L142.2,34.2 L142.1,33.4 L141.7,33.1 L139.9,33.1 L139.4,32.9 L139.0,32.2 L139.0,31.5 L140.7,31.1 L142.2,31.3 L144.5,30.0 L143.0,26.0 L141.1,25.6 L140.7,25.2 L141.1,24.6 L142.1,24.2 L143.7,22.1 L144.7,21.8 L145.8,21.8 L145.7,24.0 Z"
                    fill="#2D5A3D" opacity="0.9"
                  />

                  {/* ── City dots — positions from Mercator projection ── */}
                  {/* London */}
                  <circle cx="168.5" cy="263.6" r="5.5" fill="#C4973A" filter="url(#dotGlow)"/>
                  {/* Manchester */}
                  <circle cx="128.9" cy="215.2" r="4.5" fill="#C4973A" filter="url(#dotGlow)"/>
                  {/* Birmingham */}
                  <circle cx="134.5" cy="239.7" r="4" fill="#C4973A" filter="url(#dotGlow)"/>
                  {/* Edinburgh */}
                  <circle cx="110.0" cy="152.7" r="4" fill="#C4973A" filter="url(#dotGlow)"/>
                  {/* Cardiff */}
                  <circle cx="110.0" cy="263.6" r="3.5" fill="#C4973A" filter="url(#dotGlow)"/>
                  {/* Belfast */}
                  <circle cx="59.1" cy="187.6" r="3.5" fill="#C4973A" filter="url(#dotGlow)"/>
                  {/* Glasgow */}
                  <circle cx="90.2" cy="155.3" r="3.5" fill="#E8C97A"/>
                  {/* Leeds */}
                  <circle cx="141.1" cy="207.7" r="3" fill="#E8C97A"/>
                  {/* Bristol */}
                  <circle cx="121.3" cy="264.8" r="3" fill="#E8C97A"/>
                  {/* Newcastle */}
                  <circle cx="139.8" cy="178.1" r="3" fill="#E8C97A"/>
                  {/* Norwich */}
                  <circle cx="194.9" cy="236.5" r="2.5" fill="#E8C97A" opacity="0.8"/>
                  {/* Sheffield */}
                  <circle cx="142.6" cy="218.2" r="2.5" fill="#E8C97A" opacity="0.8"/>
                </svg>

                {/* Map legend */}
                <div className="mt-5 flex flex-col gap-2 px-1">
                  <div className="flex items-center gap-2 text-xs text-mid">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#C4973A] shrink-0" />
                    <span>Major funding hubs</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-mid">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#E8C97A] shrink-0" />
                    <span>Regional grant centres</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-mid">
                    <div className="h-2.5 w-2.5 rounded-full bg-forest/40 shrink-0" />
                    <span>England · Scotland · Wales · N. Ireland</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* ── Grant type cards ── */}
            <div>
              <motion.div {...fadeInView(0.1)} className="mb-6">
                <h3 className="text-2xl md:text-3xl leading-snug">
                  Five layers of funding<br />
                  <span className="text-mid font-normal text-xl">to match your organisation</span>
                </h3>
              </motion.div>

              <div className="space-y-3">
                {[
                  {
                    emoji: '🏛️',
                    title: 'National & Government',
                    desc: 'Arts Council England, National Lottery, Sport England, Innovate UK — UK-wide eligibility and larger award sizes.',
                    badge: '£1k – £1M+',
                    delay: 0.15,
                  },
                  {
                    emoji: '🌍',
                    title: 'Regional & Community Foundations',
                    desc: 'County and city-level funders across all four nations. Lower competition, community-first priorities.',
                    badge: '£500 – £50k',
                    delay: 0.25,
                  },
                  {
                    emoji: '🏢',
                    title: 'Corporate Foundations',
                    desc: 'Lloyds Bank, Barclays, Aviva and 50+ more — sector-themed funding tied to a company\'s community strategy.',
                    badge: '£1k – £100k',
                    delay: 0.35,
                  },
                  {
                    emoji: '🏡',
                    title: 'Small Trusts & Family Foundations',
                    desc: 'Hundreds of hyperlocal trusts with county or parish-level remits. Faster decisions, less competition.',
                    badge: '£500 – £20k',
                    delay: 0.45,
                  },
                  {
                    emoji: '🚀',
                    title: 'Accelerators & Challenge Funds',
                    desc: 'UnLtd, Nesta and DCMS programmes pairing direct grants with mentoring, peer networks and capacity building.',
                    badge: '£1k – £150k',
                    delay: 0.55,
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
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-sm font-semibold text-charcoal">{item.title}</span>
                        <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[11px] font-medium text-forest/80">{item.badge}</span>
                      </div>
                      <p className="text-xs text-mid leading-relaxed">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

          </div>
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
      <section id="compare" className="max-w-4xl mx-auto px-6 pb-24 scroll-mt-20">
        <motion.div {...fadeInView()} className="text-center mb-12">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
            📊 Compare
          </span>
          <h2 className="mt-4 text-3xl md:text-4xl">How Grant Tracker compares</h2>
          <p className="mt-3 text-mid max-w-xl mx-auto">More than a database — AI matching, a full pipeline, and free to start.</p>
        </motion.div>
        <motion.div {...fadeInView(0.15)}>
          <div className="rounded-2xl border border-warm bg-white overflow-hidden shadow-warm">
            {/* Header */}
            <div className="grid grid-cols-3 gap-0 border-b border-warm bg-warm/30 px-6 py-4">
              <div className="text-sm font-medium text-mid">Feature</div>
              <div className="text-center text-sm font-bold text-forest">Grant Tracker</div>
              <div className="text-center text-sm font-medium text-mid">Traditional Grant Database</div>
            </div>
            {/* Rows */}
            {[
              { feature: '800+ UK grants database',   gt: true,  other: true  },
              { feature: 'AI match scoring',          gt: true,  other: false },
              { feature: 'Learns from your feedback', gt: true,  other: false },
              { feature: 'Live web research',         gt: true,  other: false },
              { feature: 'Visual pipeline board',     gt: true,  other: false },
              { feature: 'Deadline tracking',         gt: true,  other: false },
              { feature: 'Built for UK charities',    gt: true,  other: true  },
            ].map((row, i) => (
              <div
                key={row.feature}
                className={`grid grid-cols-3 gap-0 px-6 py-3.5 ${i < 6 ? 'border-b border-warm' : ''}`}
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

      {/* ══ ABOUT ══════════════════════════════════════════════════════════════ */}
      <section id="about" className="max-w-4xl mx-auto px-6 pb-24 scroll-mt-20">
        <motion.div {...fadeInView()} className="text-center mb-12">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
            🌱 About
          </span>
          <h2 className="mt-4 text-3xl md:text-4xl">
            Built for the people<br />
            <span className="italic">doing the work</span>
          </h2>
          <p className="mt-3 text-mid max-w-lg mx-auto">
            Grant Tracker exists to help mission-driven organisations spend less time searching for funding and more time delivering impact.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            {
              emoji: '🏛️',
              gradient: 'from-forest/20 to-teal-100',
              title: 'Charities',
              desc: 'From national organisations to grassroots groups — find grants tailored to your cause and structure.',
            },
            {
              emoji: '🤝',
              gradient: 'from-amber-100 to-orange-100',
              title: 'Community Groups',
              desc: 'Local projects, faith groups, and resident-led initiatives deserve funding too. We surface the hyper-local pots others miss.',
            },
            {
              emoji: '🌱',
              gradient: 'from-emerald-100 to-teal-50',
              title: 'Social Enterprises',
              desc: 'Trading for good? Search social loans, competitions and blended finance alongside traditional grants.',
            },
            {
              emoji: '🎓',
              gradient: 'from-sky-100 to-indigo-50',
              title: 'CICs & Not-for-Profits',
              desc: "Whether you're a CIC, CIO or unincorporated — eligibility filters adapt so you only see what you can apply for.",
            },
          ].map((v, i) => (
            <motion.div
              key={v.title}
              {...fadeInView(i * 0.1)}
              className="rounded-2xl border border-warm bg-white p-6 text-center shadow-warm hover:shadow-lg transition-shadow duration-300"
            >
              <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${v.gradient}`}>
                <span className="text-2xl">{v.emoji}</span>
              </div>
              <h3 className="mt-4 font-serif text-lg text-charcoal">{v.title}</h3>
              <p className="mt-2 text-sm text-mid leading-relaxed">{v.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Founder story */}
        <motion.div {...fadeInView(0.2)} className="mt-16 rounded-3xl border border-warm bg-white p-10 shadow-warm max-w-2xl mx-auto">
          <blockquote className="font-serif text-xl text-forest font-semibold leading-snug mb-6 border-l-4 border-sage pl-5">
            &ldquo;Finding the right grant has always been harder than it should be. The tools that existed were too expensive, too generic, and built for organisations with a dedicated grants team — not for the people actually doing the work.&rdquo;
          </blockquote>
          <div className="space-y-4 text-mid text-sm leading-relaxed">
            <p>
              Grant Tracker was built from direct experience of the sector — sifting through outdated databases, missing hyper-local funders that never appear in national searches, and juggling applications across spreadsheets and inboxes.
            </p>
            <p>
              Existing tools ranged from £150 to £1,000+ a year, pricing out the small charities and community groups they were meant to serve. Grant Tracker was built to change that — simple enough for any founder, trustee or community organiser, and built around how UK funding actually works.
            </p>
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
