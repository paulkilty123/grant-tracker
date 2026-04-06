
import { useState } from "react"
import { Rocket, GraduationCap, Users, MapPin, Calendar, Clock, ChevronRight, Star, Award, BookOpen, Network, Zap, Globe, Building2, ArrowRight, CheckCircle, Filter, Search, X, Briefcase, TrendingUp, Heart } from "lucide-react"

const PROGRAMMES = [
  {
    id: 1,
    title: "SSE Fellowship Programme",
    provider: "School for Social Entrepreneurs",
    type: "fellowship",
    badge: "Fellowship",
    badgeColour: "bg-violet-50 text-violet-700 border-violet-200",
    tagline: "Learning, bursary and peer network for social entrepreneurs ready to scale",
    whatYouGet: ["£3,000–£5,000 bursary", "10-month learning programme", "Expert mentors", "Alumni network of 5,000+"],
    whoItsFor: "Trading social enterprises or CICs looking to grow",
    stage: ["trading", "scaling"],
    format: "Blended",
    location: "UK-wide (regional cohorts)",
    nextCohort: "Applications open May 2026",
    duration: "10 months",
    cohortSize: "25 per cohort",
    sectors: ["Social Enterprise", "Leadership", "Scaling"],
    isRolling: false,
    isOnline: false,
    funderType: "support_programme",
    applyUrl: "#",
  },
  {
    id: 2,
    title: "Bethnal Green Ventures",
    provider: "Bethnal Green Ventures",
    type: "accelerator",
    badge: "Accelerator",
    badgeColour: "bg-orange-50 text-orange-700 border-orange-200",
    tagline: "Europe's leading tech for good accelerator — seed investment and intense support",
    whatYouGet: ["£20,000 investment", "3-month intensive programme", "Follow-on investor network", "Co-working space"],
    whoItsFor: "Early-stage tech for good startups, pre-seed",
    stage: ["early", "pre-seed"],
    format: "In-person",
    location: "London",
    nextCohort: "Cohort opens January 2027",
    duration: "3 months",
    cohortSize: "10 ventures",
    sectors: ["Technology", "Social Impact", "Climate"],
    isRolling: false,
    isOnline: false,
    funderType: "accelerator",
    applyUrl: "#",
  },
  {
    id: 3,
    title: "Hatch Enterprise Launchpad",
    provider: "Hatch Enterprise",
    type: "support_programme",
    badge: "Support Programme",
    badgeColour: "bg-indigo-50 text-indigo-700 border-indigo-200",
    tagline: "Free business support and community for early-stage social enterprises",
    whatYouGet: ["Free workshops & training", "1:1 business coaching", "Peer community", "Resources library"],
    whoItsFor: "Pre-start and early-stage social entrepreneurs",
    stage: ["pre-start", "early"],
    format: "Online & in-person",
    location: "London (+ online)",
    nextCohort: "Rolling intake",
    duration: "Ongoing",
    cohortSize: null,
    sectors: ["Social Enterprise", "Entrepreneurship"],
    isRolling: true,
    isOnline: true,
    funderType: "support_programme",
    applyUrl: "#",
  },
  {
    id: 4,
    title: "ChangemakerXchange Fellowship",
    provider: "ChangemakerXchange / Ashoka",
    type: "fellowship",
    badge: "Fellowship",
    badgeColour: "bg-violet-50 text-violet-700 border-violet-200",
    tagline: "International network for young changemakers building cross-sector solutions",
    whatYouGet: ["Travel bursary", "Global summit access", "Peer learning network", "Mentorship from Ashoka Fellows"],
    whoItsFor: "Young changemakers aged 18–35 with active projects",
    stage: ["early", "trading"],
    format: "International residentials",
    location: "International",
    nextCohort: "Applications open October 2026",
    duration: "12 months",
    cohortSize: "50 fellows globally",
    sectors: ["Youth", "Social Enterprise", "International"],
    isRolling: false,
    isOnline: false,
    funderType: "support_programme",
    applyUrl: "#",
  },
  {
    id: 5,
    title: "Zinc VC Mission Cohort",
    provider: "Zinc VC",
    type: "accelerator",
    badge: "Accelerator",
    badgeColour: "bg-orange-50 text-orange-700 border-orange-200",
    tagline: "11-month venture-building programme creating companies that solve social problems",
    whatYouGet: ["£25,000 stipend", "11-month intensive", "Seed investment pathway", "Team formation support"],
    whoItsFor: "Individuals with sector expertise, not yet a company",
    stage: ["pre-start", "early"],
    format: "In-person",
    location: "London",
    nextCohort: "Cohort 7 opens September 2026",
    duration: "11 months",
    cohortSize: "30 individuals",
    sectors: ["Health", "Employment", "Education"],
    isRolling: false,
    isOnline: false,
    funderType: "accelerator",
    applyUrl: "#",
  },
  {
    id: 6,
    title: "UnLtd Development Award",
    provider: "UnLtd",
    type: "fellowship",
    badge: "Award",
    badgeColour: "bg-amber-50 text-amber-700 border-amber-200",
    tagline: "Funding and support for established social entrepreneurs growing their impact",
    whatYouGet: ["Up to £15,000", "Business support package", "UnLtd network access", "Profile raising"],
    whoItsFor: "Trading social ventures with 2+ years of operation",
    stage: ["trading", "scaling"],
    format: "Blended",
    location: "UK-wide",
    nextCohort: "Rolling — next window June 2026",
    duration: "12 months support",
    cohortSize: null,
    sectors: ["Social Enterprise", "Community", "Innovation"],
    isRolling: false,
    isOnline: false,
    funderType: "support_programme",
    applyUrl: "#",
  },
]

const TYPE_ICONS = {
  accelerator: Rocket,
  fellowship: Star,
  support_programme: GraduationCap,
}

const STAGE_LABELS = {
  "pre-start": { label: "Pre-start", colour: "bg-rose-50 text-rose-700" },
  early: { label: "Early stage", colour: "bg-amber-50 text-amber-700" },
  trading: { label: "Trading", colour: "bg-emerald-50 text-emerald-700" },
  scaling: { label: "Scaling", colour: "bg-blue-50 text-blue-700" },
  "pre-seed": { label: "Pre-seed", colour: "bg-purple-50 text-purple-700" },
}

const FILTER_TYPES = ["All", "Accelerator", "Fellowship", "Support Programme", "Award"]
const FILTER_STAGES = ["All stages", "Pre-start", "Early stage", "Trading", "Scaling"]

export default function ProgrammesMockup() {
  const [selected, setSelected] = useState(null)
  const [activeType, setActiveType] = useState("All")
  const [activeStage, setActiveStage] = useState("All stages")
  const [search, setSearch] = useState("")

  const programme = PROGRAMMES.find(p => p.id === selected)

  const filtered = PROGRAMMES.filter(p => {
    if (activeType !== "All" && p.badge !== activeType) return false
    if (activeStage !== "All stages") {
      const stageKey = Object.entries(STAGE_LABELS).find(([, v]) => v.label === activeStage)?.[0]
      if (stageKey && !p.stage.includes(stageKey)) return false
    }
    if (search && !p.title.toLowerCase().includes(search.toLowerCase()) && !p.provider.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: "#faf7f2", minHeight: "100vh", display: "flex" }}>

      {/* Sidebar */}
      <div style={{ width: 220, background: "#1f5c52", display: "flex", flexDirection: "column", padding: "24px 0", flexShrink: 0 }}>
        <div style={{ padding: "0 20px 24px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          <span style={{ color: "#e8ddd0", fontFamily: "'DM Serif Display', serif", fontSize: 18, fontWeight: 700 }}>Grant Tracker</span>
        </div>
        <nav style={{ padding: "16px 0", flex: 1 }}>
          {[
            { label: "Dashboard", icon: "◈", active: false },
            { label: "Search Grants", icon: "◎", active: false },
            { label: "Programmes", icon: "◆", active: true },
            { label: "My Pipeline", icon: "◇", active: false },
            { label: "Deadlines", icon: "◉", active: false },
            { label: "Local Grants", icon: "◍", active: false },
          ].map(item => (
            <div key={item.label} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 20px",
              background: item.active ? "rgba(255,255,255,0.12)" : "transparent",
              borderLeft: item.active ? "3px solid #e8a030" : "3px solid transparent",
              cursor: "pointer", color: item.active ? "#faf7f2" : "rgba(255,255,255,0.6)",
              fontSize: 14, fontWeight: item.active ? 600 : 400,
            }}>
              <span style={{ fontSize: 12 }}>{item.icon}</span>
              {item.label}
              {item.label === "Programmes" && (
                <span style={{ marginLeft: "auto", background: "#e8a030", color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99 }}>NEW</span>
              )}
            </div>
          ))}
        </nav>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "36px 32px" }}>

          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <Rocket style={{ color: "#2d8a7a", width: 22, height: 22 }} />
              <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: "#1f5c52", margin: 0 }}>
                Programmes & Accelerators
              </h1>
            </div>
            <p style={{ color: "#6b7280", fontSize: 15, margin: 0 }}>
              Not looking for a grant? Explore structured support, fellowships and accelerators — intensive programmes that grow organisations and people.
            </p>
          </div>

          {/* What's different callout */}
          <div style={{ background: "#e8f4f1", border: "1px solid #2d8a7a30", padding: "14px 18px", marginBottom: 24, display: "flex", gap: 12, alignItems: "flex-start" }}>
            <Zap style={{ color: "#2d8a7a", width: 18, height: 18, flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ margin: 0, fontSize: 13, color: "#1f5c52", fontWeight: 600 }}>Programmes are different from grants</p>
              <p style={{ margin: "3px 0 0", fontSize: 13, color: "#374151" }}>
                The value isn't always cash — it's mentorship, networks, credibility and structured learning. Many offer a bursary alongside non-financial support. Great for early-stage organisations that need more than money.
              </p>
            </div>
          </div>

          {/* Filters + search */}
          <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
              <Search style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", width: 15, height: 15 }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search programmes…"
                style={{ width: "100%", paddingLeft: 36, paddingRight: 12, height: 38, border: "1px solid #e5e7eb", background: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {FILTER_TYPES.map(t => (
                <button key={t} onClick={() => setActiveType(t)} style={{
                  padding: "6px 12px", fontSize: 13, fontWeight: 500, cursor: "pointer",
                  background: activeType === t ? "#1f5c52" : "#fff",
                  color: activeType === t ? "#fff" : "#6b7280",
                  border: "1px solid " + (activeType === t ? "#1f5c52" : "#e5e7eb"),
                  transition: "all 0.15s",
                }}>{t}</button>
              ))}
            </div>
            <select
              value={activeStage}
              onChange={e => setActiveStage(e.target.value)}
              style={{ padding: "6px 12px", fontSize: 13, border: "1px solid #e5e7eb", background: "#fff", color: "#374151", cursor: "pointer", height: 38 }}
            >
              {FILTER_STAGES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          {/* Results count */}
          <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 16 }}>{filtered.length} programmes found</p>

          {/* Programme cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map(p => {
              const Icon = TYPE_ICONS[p.funderType] ?? GraduationCap
              return (
                <div
                  key={p.id}
                  onClick={() => setSelected(p.id)}
                  style={{
                    background: "#fff",
                    border: "1px solid #e8ddd0",
                    padding: "20px 22px",
                    cursor: "pointer",
                    transition: "border-color 0.15s, box-shadow 0.15s",
                    borderLeft: selected === p.id ? "3px solid #2d8a7a" : "3px solid transparent",
                    boxShadow: selected === p.id ? "0 2px 12px rgba(0,0,0,0.06)" : "none",
                  }}
                >
                  <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                    {/* Icon */}
                    <div style={{ width: 44, height: 44, background: "#f0faf8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon style={{ color: "#2d8a7a", width: 20, height: 20 }} />
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", border: "1px solid", letterSpacing: "0.03em" }} className={p.badgeColour}>
                          {p.badge}
                        </span>
                        {p.isRolling && (
                          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" }}>
                            Rolling intake
                          </span>
                        )}
                        {p.stage.map(s => (
                          <span key={s} style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px" }} className={STAGE_LABELS[s]?.colour}>
                            {STAGE_LABELS[s]?.label}
                          </span>
                        ))}
                      </div>

                      <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: "#1f5c52", margin: "0 0 2px", lineHeight: 1.25 }}>
                        {p.title}
                      </h3>
                      <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 8px" }}>{p.provider}</p>
                      <p style={{ fontSize: 14, color: "#374151", margin: "0 0 12px", lineHeight: 1.5 }}>{p.tagline}</p>

                      {/* What you get pills */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                        {p.whatYouGet.map((w, i) => (
                          <span key={i} style={{ fontSize: 12, padding: "3px 10px", background: "#faf7f2", border: "1px solid #e8ddd0", color: "#374151", display: "flex", alignItems: "center", gap: 4 }}>
                            <CheckCircle style={{ width: 11, height: 11, color: "#2d8a7a" }} />
                            {w}
                          </span>
                        ))}
                      </div>

                      {/* Meta row */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13, color: "#6b7280" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <MapPin style={{ width: 13, height: 13 }} />{p.location}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Clock style={{ width: 13, height: 13 }} />{p.duration}
                        </span>
                        {p.cohortSize && (
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <Users style={{ width: 13, height: 13 }} />{p.cohortSize}
                          </span>
                        )}
                        <span style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 600, color: p.isRolling ? "#2d8a7a" : "#1f5c52" }}>
                          <Calendar style={{ width: 13, height: 13 }} />{p.nextCohort}
                        </span>
                      </div>
                    </div>

                    <ChevronRight style={{ color: "#d1d5db", width: 18, height: 18, flexShrink: 0, marginTop: 4 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {programme && (
        <div style={{ width: 380, background: "#fff", borderLeft: "1px solid #e8ddd0", overflow: "auto", flexShrink: 0 }}>
          <div style={{ position: "sticky", top: 0, background: "#faf7f2", borderBottom: "1px solid #e8ddd0", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.05em", textTransform: "uppercase" }}>Programme details</span>
            <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 4 }}>
              <X style={{ width: 16, height: 16 }} />
            </button>
          </div>

          <div style={{ padding: "24px 20px" }}>
            {/* Header */}
            <div style={{ marginBottom: 20 }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", border: "1px solid", display: "inline-block", marginBottom: 10 }} className={programme.badgeColour}>
                {programme.badge}
              </span>
              <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: "#1f5c52", margin: "0 0 4px", lineHeight: 1.2 }}>
                {programme.title}
              </h2>
              <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>{programme.provider}</p>
            </div>

            {/* Key facts grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, background: "#faf7f2", padding: 16, marginBottom: 20 }}>
              {[
                { label: "Format", value: programme.format, icon: Globe },
                { label: "Duration", value: programme.duration, icon: Clock },
                { label: "Location", value: programme.location, icon: MapPin },
                { label: "Cohort size", value: programme.cohortSize ?? "Open", icon: Users },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 3px" }}>{label}</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "#1f5c52", fontWeight: 600 }}>
                    <Icon style={{ width: 13, height: 13, color: "#2d8a7a" }} />
                    {value}
                  </div>
                </div>
              ))}
            </div>

            {/* Next cohort callout */}
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: "12px 14px", marginBottom: 20, display: "flex", gap: 8, alignItems: "center" }}>
              <Calendar style={{ color: "#3b82f6", width: 16, height: 16, flexShrink: 0 }} />
              <div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#1e40af" }}>Next opportunity</p>
                <p style={{ margin: "2px 0 0", fontSize: 13, color: "#1d4ed8" }}>{programme.nextCohort}</p>
              </div>
            </div>

            {/* Tagline */}
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>About this programme</h3>
              <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.6, margin: 0 }}>{programme.tagline}</p>
            </div>

            {/* What you get */}
            <div style={{ marginBottom: 20, paddingTop: 16, borderTop: "1px solid #f3f4f6" }}>
              <h3 style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 10px" }}>What you get</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {programme.whatYouGet.map((w, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, fontSize: 14, color: "#374151" }}>
                    <CheckCircle style={{ width: 16, height: 16, color: "#2d8a7a", flexShrink: 0, marginTop: 1 }} />
                    {w}
                  </div>
                ))}
              </div>
            </div>

            {/* Who it's for */}
            <div style={{ marginBottom: 20, paddingTop: 16, borderTop: "1px solid #f3f4f6" }}>
              <h3 style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>Who it's for</h3>
              <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.5, margin: "0 0 10px" }}>{programme.whoItsFor}</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {programme.stage.map(s => (
                  <span key={s} style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px" }} className={STAGE_LABELS[s]?.colour}>
                    {STAGE_LABELS[s]?.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Sectors */}
            <div style={{ marginBottom: 24, paddingTop: 16, borderTop: "1px solid #f3f4f6" }}>
              <h3 style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>Focus areas</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {programme.sectors.map(s => (
                  <span key={s} style={{ fontSize: 12, padding: "3px 10px", background: "#f5f3ff", color: "#6d28d9", border: "1px solid #ddd6fe" }}>{s}</span>
                ))}
              </div>
            </div>

            {/* CTAs */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 16, borderTop: "1px solid #f3f4f6" }}>
              <a href={programme.applyUrl} style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                background: "#1f5c52", color: "#fff", padding: "11px 16px",
                fontSize: 14, fontWeight: 600, textDecoration: "none", transition: "background 0.15s",
              }}>
                Find out more <ArrowRight style={{ width: 15, height: 15 }} />
              </a>
              <button style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                background: "transparent", color: "#e07040", padding: "10px 16px",
                fontSize: 14, fontWeight: 600, border: "1px solid #e07040", cursor: "pointer",
              }}>
                + Add to Pipeline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
