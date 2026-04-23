import Link from 'next/link'
import Script from 'next/script'
import { ArrowLeft } from 'lucide-react'

export const metadata = {
  title: 'Apply to join the founding cohort — Grant Tracker',
  description: 'Join the Grant Tracker founding cohort. Around 20–30 organisations who help shape the product and get free access during beta.',
}

const UI = "var(--font-space-grotesk), Space Grotesk, sans-serif"
const BODY = "var(--font-dm-sans), Plus Jakarta Sans, sans-serif"
const SERIF = "'Fraunces', Georgia, serif"

export default function ApplyPage() {
  return (
    <div style={{ background: '#FAFAF7', minHeight: '100vh', fontFamily: BODY, color: '#2C2C2A' }}>

      {/* NAV */}
      <nav style={{ background: 'white', borderBottom: '0.5px solid rgba(23,52,4,0.08)', padding: '18px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ fontFamily: UI, fontWeight: 700, fontSize: 24, letterSpacing: '-0.03em', color: '#2C2C2A', textDecoration: 'none' }}>GrantTracker</Link>
          <Link href="/" style={{ fontFamily: UI, fontSize: 13.5, color: '#5F5E5A', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ArrowLeft size={14} /> Back to home
          </Link>
        </div>
      </nav>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px' }}>

        {/* HERO */}
        <div style={{ padding: '72px 0 48px' }}>
          <div style={{ fontFamily: UI, fontWeight: 500, fontSize: 11.5, color: '#8ECB3C', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 18, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 6, height: 6, background: '#8ECB3C', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
            Founding cohort, applications open
          </div>
          <h1 style={{ fontFamily: UI, fontWeight: 500, fontSize: 44, lineHeight: 1.08, letterSpacing: '-0.025em', color: '#2C2C2A', marginBottom: 28 }}>
            Help me build <span style={{ color: '#8ECB3C' }}>something better.</span>
          </h1>
          <div>
            <p style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 19, lineHeight: 1.6, color: '#2C2C2A', marginBottom: 18, letterSpacing: '-0.005em' }}>
              Hi, I&apos;m Paul. I&apos;ve spent the last twenty years in the social enterprise and charity sector, and I&apos;ve built Grant Tracker because I got tired of watching good people spend more time hunting for funding than doing the work the funding was meant to support.
            </p>
            <p style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 19, lineHeight: 1.6, color: '#2C2C2A', marginBottom: 18, letterSpacing: '-0.005em' }}>
              Before launching properly, I want to build it with a small group of real users. Not a waitlist or marketing funnel, but a genuine founding cohort — around 20 to 30 organisations — whose feedback shapes how Grant Tracker works, who get to try new features first, and who benefit from being here first.
            </p>
            <p style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 19, lineHeight: 1.6, color: '#2C2C2A', letterSpacing: '-0.005em' }}>
              If that sounds interesting, I&apos;d love to hear from you.
            </p>
          </div>
          <div style={{ fontFamily: BODY, fontSize: 14, color: '#5F5E5A', marginTop: 32 }}>
            <strong style={{ fontWeight: 500, color: '#2C2C2A' }}>Paul Kilty</strong>, founder
          </div>
        </div>

        {/* WHO I'M LOOKING FOR */}
        <section style={{ padding: '0 0 56px' }}>
          <h2 style={{ fontFamily: UI, fontWeight: 500, fontSize: 28, lineHeight: 1.15, letterSpacing: '-0.02em', color: '#2C2C2A', marginBottom: 20 }}>
            Who I&apos;m <span style={{ color: '#8ECB3C' }}>looking for.</span>
          </h2>
          <p style={{ fontSize: 16, color: '#5F5E5A', lineHeight: 1.65, marginBottom: 16 }}>
            Grant Tracker is built for UK organisations doing social impact work. For the founding cohort specifically, I&apos;m prioritising organisations where I can genuinely learn from how you use the product, and where the product can genuinely help you.
          </p>
          <p style={{ fontSize: 16, color: '#5F5E5A', lineHeight: 1.65, marginBottom: 0 }}>
            That means I&apos;m most interested in hearing from:
          </p>
          <ul style={{ listStyle: 'none', margin: '20px 0 0', padding: 0 }}>
            {[
              'CICs and social enterprises, from early-stage through to those scaling up with social investment',
              "Small charities and CIOs where fundraising is one person's many jobs, not a whole team",
              'Co-operatives and community groups, including worker-led, community-owned, and unincorporated groups',
              'Impact founders — early-stage, pre-revenue, or working as an individual',
            ].map((item, i) => (
              <li key={i} style={{ position: 'relative', paddingLeft: 20, marginBottom: 12, fontSize: 16, color: '#5F5E5A', lineHeight: 1.6 }}>
                <span style={{ position: 'absolute', left: 0, top: 10, width: 6, height: 6, background: '#8ECB3C', borderRadius: '50%', display: 'inline-block' }} />
                {item}
              </li>
            ))}
          </ul>
          <p style={{ fontSize: 16, color: '#5F5E5A', lineHeight: 1.65, marginTop: 24 }}>
            You don&apos;t need to fit neatly into one of these. If you&apos;re doing impact work in the UK and looking for funding, tell me about you.
          </p>
        </section>

        {/* WHAT I'M COMMITTING TO */}
        <section style={{ padding: '0 0 56px' }}>
          <div style={{ background: '#F5F1E8', borderRadius: 14, padding: '40px 36px' }}>
            <h2 style={{ fontFamily: UI, fontWeight: 500, fontSize: 28, lineHeight: 1.15, letterSpacing: '-0.02em', color: '#2C2C2A', marginBottom: 14 }}>
              What I&apos;m <span style={{ color: '#8ECB3C' }}>committing to.</span>
            </h2>
            <p style={{ fontSize: 16, color: '#5F5E5A', lineHeight: 1.65, marginBottom: 0 }}>
              If you&apos;re part of the founding cohort, here&apos;s what you get from me:
            </p>
            <ul style={{ listStyle: 'none', margin: '20px 0 0', padding: 0 }}>
              {[
                { title: 'Free access during beta.', body: 'Full product, no limits, no payment details required.' },
                { title: 'Free first year after launch.', body: 'Twelve months of full access on me, as a thank you for being here first.' },
                { title: 'Founding rate from year two.', body: 'A permanently lower price for active cohort members, for as long as you stay with Grant Tracker.' },
                { title: 'A direct line to me.', body: "When something's not working, when you have an idea, when you want to talk to someone who can actually change the product — that's me." },
              ].map((item, i) => (
                <li key={i} style={{ position: 'relative', paddingLeft: 28, marginBottom: 16, fontSize: 16, color: '#5F5E5A', lineHeight: 1.6 }}>
                  <span style={{ position: 'absolute', left: 0, top: 2, color: '#639922', fontWeight: 500, fontSize: 17, lineHeight: 1 }}>✓</span>
                  <strong style={{ color: '#2C2C2A', fontWeight: 500 }}>{item.title}</strong> {item.body}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* THE ONE THING I'M ASKING */}
        <section style={{ padding: '0 0 56px' }}>
          <div style={{ background: '#E8DFC8', borderRadius: 14, padding: '40px 36px' }}>
            <h2 style={{ fontFamily: UI, fontWeight: 500, fontSize: 24, lineHeight: 1.15, letterSpacing: '-0.02em', color: '#173404', marginBottom: 20 }}>
              The one thing I&apos;m asking.
            </h2>
            <p style={{ fontSize: 16, color: '#2C2C2A', lineHeight: 1.65, marginBottom: 16 }}>
              In return, I&apos;m asking for one real thing: <strong style={{ color: '#2C2C2A', fontWeight: 500 }}>your feedback.</strong>
            </p>
            <p style={{ fontSize: 16, color: '#2C2C2A', lineHeight: 1.65, marginBottom: 16 }}>
              Occasional conversations about what&apos;s working and what isn&apos;t. A reply when I ask a question. Willingness to try something that&apos;s still being built, and tell me honestly when it doesn&apos;t work.
            </p>
            <p style={{ fontSize: 16, color: '#2C2C2A', lineHeight: 1.65, marginBottom: 16 }}>
              You&apos;ll also be the first to see new features and shape them before they go live.
            </p>
            <p style={{ fontSize: 16, color: '#2C2C2A', lineHeight: 1.65, marginBottom: 20 }}>
              That&apos;s the whole deal. If you&apos;re willing to give that, I&apos;d love to have you in the cohort.
            </p>
            <p style={{ fontSize: 14.5, color: '#5F5E5A', lineHeight: 1.6 }}>
              Being in the cohort means staying in touch. If we lose contact, the cohort benefits lapse.
            </p>
          </div>
        </section>

        {/* APPLICATION FORM */}
        <section style={{ padding: '0 0 56px' }}>
          <div style={{ background: 'white', border: '0.5px solid rgba(23,52,4,0.08)', borderRadius: 14, padding: '40px 36px' }}>
            <h2 style={{ fontFamily: UI, fontWeight: 500, fontSize: 28, lineHeight: 1.15, letterSpacing: '-0.02em', color: '#2C2C2A', marginBottom: 12 }}>
              Apply to <span style={{ color: '#8ECB3C' }}>join.</span>
            </h2>
            <p style={{ fontSize: 16, color: '#5F5E5A', lineHeight: 1.65, marginBottom: 28 }}>
              A few questions about you and your organisation. I read every application personally.
            </p>
            {/* Tally form embed */}
            <div style={{ margin: '0 -4px' }}>
              <iframe
                src="https://tally.so/embed/ODj4Ea?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1"
                loading="lazy"
                width="100%"
                height="2673"
                frameBorder="0"
                marginHeight={0}
                marginWidth={0}
                title="Apply to the Grant Tracker founding cohort"
                style={{ display: 'block' }}
              />
            </div>
            <Script
              src="https://tally.so/widgets/embed.js"
              strategy="lazyOnload"
            />
          </div>
        </section>

        {/* WHAT HAPPENS NEXT */}
        <section style={{ padding: '0 0 56px' }}>
          <h3 style={{ fontFamily: UI, fontWeight: 500, fontSize: 18, color: '#2C2C2A', marginBottom: 14, letterSpacing: '-0.01em' }}>What happens next</h3>
          <ol style={{ listStyle: 'none', padding: 0 }}>
            {[
              'I read every application personally, usually within a week.',
              "If you're a good fit for the founding cohort, I'll email you with next steps and an invite to set up your account.",
              "If now isn't the right time, I'll still reply. You'll hear back either way.",
            ].map((step, i) => (
              <li key={i} style={{ position: 'relative', paddingLeft: 38, marginBottom: 16, fontSize: 15, color: '#5F5E5A', lineHeight: 1.6 }}>
                <span style={{ position: 'absolute', left: 0, top: 2, width: 24, height: 24, background: '#EAF3DE', color: '#3B6D11', fontFamily: UI, fontWeight: 500, fontSize: 12, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </section>

        {/* FAQ */}
        <section style={{ padding: '0 0 72px' }}>
          <h2 style={{ fontFamily: UI, fontWeight: 500, fontSize: 28, lineHeight: 1.15, letterSpacing: '-0.02em', color: '#2C2C2A', marginBottom: 28 }}>
            A few <span style={{ color: '#8ECB3C' }}>questions.</span>
          </h2>
          {[
            {
              q: 'How long will the beta last?',
              a: "Honest answer: I don't know exactly. Long enough that I can genuinely improve the product based on cohort feedback, short enough that it doesn't drag. Probably three to six months, but I'd rather get it right than rush.",
            },
            {
              q: "What if I don't hear back?",
              a: "You will. I commit to replying to every application, usually within a week. If it's been longer, please email me directly at hello@granttracker.co.uk.",
            },
            {
              q: 'What if the founding cohort is full?',
              a: "If applications close before you apply, I'll let you know and keep you on a waitlist for any open spots. And I'll let you know when we launch properly.",
            },
            {
              q: 'Is my data safe?',
              a: "Yes. Your organisation data stays private to your account. Cohort members are never shared with funders, other organisations, or third parties without explicit permission.",
            },
          ].map((item, i, arr) => (
            <div key={i} style={{ padding: '20px 0', borderTop: '0.5px solid rgba(23,52,4,0.08)', ...(i === arr.length - 1 ? { borderBottom: '0.5px solid rgba(23,52,4,0.08)' } : {}) }}>
              <p style={{ fontFamily: UI, fontWeight: 500, fontSize: 16, color: '#2C2C2A', marginBottom: 8, letterSpacing: '-0.005em', lineHeight: 1.5 }}>{item.q}</p>
              <p style={{ fontSize: 15, color: '#5F5E5A', lineHeight: 1.6, marginBottom: 0 }}>{item.a}</p>
            </div>
          ))}
        </section>

      </div>

      {/* FOOTER */}
      <footer style={{ background: '#0F2502', padding: '32px 40px 28px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 20, borderBottom: '0.5px solid rgba(192,221,151,0.15)', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
            <span style={{ fontFamily: UI, fontWeight: 500, fontSize: 18, color: 'white', letterSpacing: '-0.02em' }}>GrantTracker</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, fontFamily: UI, fontSize: 12.5, color: '#97C459', fontWeight: 500 }}>
              <Link href="/#how" style={{ color: 'inherit', textDecoration: 'none' }}>How it works</Link>
              <Link href="/#features" style={{ color: 'inherit', textDecoration: 'none' }}>Features</Link>
              <Link href="/#cohort" style={{ color: 'inherit', textDecoration: 'none' }}>Founding cohort</Link>
              <Link href="/#about" style={{ color: 'inherit', textDecoration: 'none' }}>About</Link>
              <Link href="/#contact" style={{ color: 'inherit', textDecoration: 'none' }}>Contact</Link>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#97C459', flexWrap: 'wrap', gap: 6 }}>
            <span>Built for the UK social impact sector.</span>
            <span>&copy; 2026 Grant Tracker</span>
          </div>
        </div>
      </footer>

    </div>
  )
}
