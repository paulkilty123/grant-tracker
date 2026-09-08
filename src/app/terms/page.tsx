import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import LogoMark from '@/components/icons/LogoMark'

export const metadata = {
  title: 'Terms of service — Shoots',
  description: 'The terms governing your use of Shoots.',
}

const UI = 'var(--font-space-grotesk), Space Grotesk, sans-serif'
const BODY = 'var(--font-dm-sans), Plus Jakarta Sans, sans-serif'

export default function TermsPage() {
  return (
    <div style={{ background: '#FAFAF7', minHeight: '100vh', fontFamily: BODY, color: '#2C2C2A' }}>

      {/* NAV */}
      <nav style={{ background: 'white', borderBottom: '0.5px solid rgba(23,52,4,0.08)', padding: '18px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" className="no-underline" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <LogoMark size={22} />
            <span style={{ fontFamily: UI, fontWeight: 500, fontSize: 18, color: 'var(--deep, #1D3C3E)', letterSpacing: '-0.01em', textTransform: 'lowercase' }}>Shoots</span>
          </Link>
          <Link href="/" className="no-underline" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: UI, fontSize: 13, fontWeight: 600, color: '#173404' }}>
            <ArrowLeft size={14} /> Back home
          </Link>
        </div>
      </nav>

      {/* CONTENT */}
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '64px 24px 96px' }}>
        <h1 style={{ fontFamily: UI, fontSize: 'clamp(36px, 5vw, 48px)', fontWeight: 700, letterSpacing: '-0.025em', color: '#173404', margin: 0, lineHeight: 1.05 }}>
          Terms of service
        </h1>
        <p style={{ marginTop: 12, marginBottom: 40, fontSize: 14, color: '#5F5E5A' }}>
          <strong style={{ color: '#2C2C2A' }}>Last updated:</strong> 10 September 2026
        </p>
        <p style={{ marginTop: -28, marginBottom: 40, fontSize: 14, color: '#5F5E5A' }}>
          In August 2026 Grant Tracker became Shoots. This is a change of name only;
          nothing about how we handle your data changed.
        </p>

        <div style={{ fontSize: 16, lineHeight: 1.65, color: '#2C2C2A' }}>
          <p>
            These terms govern your use of Shoots. By creating an account or otherwise using the service, you agree to these terms. If you do not agree, please do not use the service.
          </p>
          <p>
            If you have any questions about these terms, please email <a href="mailto:hello@shootsfunding.co.uk" style={{ color: '#3B6D11', fontWeight: 600 }}>hello@shootsfunding.co.uk</a>.
          </p>

          <Heading>Who we are</Heading>
          <p>
            Shoots is operated by Paul Kilty as a sole trader, based in Brighton, United Kingdom. In these terms, &ldquo;we&rdquo;, &ldquo;us&rdquo;, and &ldquo;our&rdquo; refer to Paul Kilty trading as Shoots. &ldquo;You&rdquo; and &ldquo;your&rdquo; refer to the person using the service or the organisation they represent.
          </p>

          <Heading>What Shoots is</Heading>
          <p>
            Shoots is a service that helps UK charities, community interest companies, social enterprises, co-operatives, and impact-focused organisations discover and manage funding opportunities. The service includes a catalogue of funding opportunities, eligibility matching, saved opportunities and deadlines, a pipeline manager, application tools, and related features. Which features you can use depends on your plan, as set out on our pricing page.
          </p>

          <Heading>Free trial</Heading>
          <p>Every new organisation starts with a free trial of the Apply plan, currently 14 days, with full access to the catalogue and no payment details required. At the end of the trial you choose a plan. If you do not subscribe, your account moves to a limited state: search is closed, your saved opportunities are listed by name but cannot be opened, and your organisation profile and pipeline are kept intact for you to return to. Nothing is deleted when a trial ends.</p>
          <p>One free trial is available per organisation. We may decline a further trial for an organisation that has already had one, and we may end a trial early where we believe the service is being used outside its intended purpose.</p>

          <Heading>Founding cohort</Heading>
          <p>
            Before public launch, a small founding cohort of invited organisations helped shape the service. The terms offered to them are set out on the application page at <Link href="/apply" style={{ color: '#3B6D11', fontWeight: 600 }}>shootsfunding.co.uk/apply</Link> and form part of these terms for cohort members. In summary:
          </p>
          <ul style={{ paddingLeft: 22, margin: '8px 0 16px' }}>
            <li style={{ marginBottom: 8 }}>Founding cohort members have free access until 10 March 2027.</li>
            <li style={{ marginBottom: 8 }}>Cohort members who remain active receive a founding rate, set lower than the standard subscription, on the terms set out on the application page.</li>
            <li>Cohort benefits depend on staying active and engaged. If you go quiet for six months, cohort status lapses and standard pricing applies.</li>
          </ul>
          <p>The founding cohort is closed to new members. These cohort-specific terms sit alongside the general terms below.</p>

          <Heading>Your account</Heading>
          <p>To use the service you must create an account. You must provide accurate information, keep your password secure, and not share your account with others. You are responsible for activity that happens under your account.</p>
          <p>You must be at least 18 years old to create an account. The service is intended for use by UK organisations engaged in social impact work, broadly defined. We may decline an application or close an account at our discretion if we believe the service is being used outside its intended purpose.</p>
          <p>You can close your account at any time by emailing <a href="mailto:hello@shootsfunding.co.uk" style={{ color: '#3B6D11', fontWeight: 600 }}>hello@shootsfunding.co.uk</a>. We will delete or anonymise your personal data within 30 days, subject to any legal requirements to retain certain records.</p>

          <Heading>Connecting AI agents</Heading>
          <p>Shoots can be connected to AI agents, such as Claude, through our Model Context Protocol (MCP) server. When you connect an agent, it acts under your account, and activity it carries out is treated as activity by you. You are responsible for the agents you connect, including staying within our usage limits, and you can revoke a connection at any time from inside the AI client.</p>
          <p>Our <Link href="/privacy" style={{ color: '#3B6D11', fontWeight: 600 }}>privacy policy</Link> explains what we store and log when an agent is connected and used.</p>

          <Heading>Acceptable use</Heading>
          <p>When using the service, you agree not to:</p>
          <ul style={{ paddingLeft: 22, margin: '8px 0 16px' }}>
            <li style={{ marginBottom: 8 }}>Use the service for any unlawful purpose, or in a way that breaches anyone else&apos;s rights.</li>
            <li style={{ marginBottom: 8 }}>Attempt to access parts of the service you are not authorised to access, or interfere with how the service works.</li>
            <li style={{ marginBottom: 8 }}>Scrape, copy, or extract data from the service for use in a competing product or for redistribution.</li>
            <li style={{ marginBottom: 8 }}>Use an AI agent or automated client to extract data from the service in bulk, to circumvent usage limits, or for any purpose the &ldquo;scrape, copy, or extract&rdquo; rule above would prohibit if done directly.</li>
            <li style={{ marginBottom: 8 }}>Reverse engineer, decompile, or attempt to derive the source code of the service.</li>
            <li style={{ marginBottom: 8 }}>Upload or transmit any content that is illegal, defamatory, or harmful.</li>
            <li>Use the service to send unsolicited communications to third parties.</li>
          </ul>
          <p>We may suspend or close accounts that breach these rules. Where we can, we will let you know first and give you a chance to put things right.</p>

          <Heading>Funding data and your decisions</Heading>
          <p>Shoots aggregates information about funding opportunities from a variety of public and partner sources. We work hard to keep this information accurate and up to date, but we cannot guarantee that every detail is correct at any given moment. Funder eligibility, deadlines, and amounts can change without notice.</p>
          <p>You are responsible for your own funding decisions. Before applying for any opportunity surfaced through the service, you should verify the details directly with the funder. Shoots is a tool to help you find and manage opportunities, not a substitute for your own due diligence.</p>
          <p>We are not a funder, and using Shoots does not guarantee that you will receive funding. We do not take a commission, finder&apos;s fee, or any cut of grants you secure through the service.</p>

          <Heading>Your data</Heading>
          <p>We take privacy seriously. Our <Link href="/privacy" style={{ color: '#3B6D11', fontWeight: 600 }}>privacy policy</Link> explains what data we collect, how we use it, and the rights you have over it. By using the service, you agree to the practices set out in the privacy policy.</p>
          <p>Your organisation&apos;s data stays private to your account. We do not share it with funders, other organisations, or third parties without your explicit permission.</p>

          <Heading>Your content</Heading>
          <p>If you upload content to the service, such as notes, organisation descriptions, or pipeline data, you keep ownership of that content. You give us a limited licence to store, display, and process that content as needed to provide the service to you. This licence ends when you delete the content or close your account.</p>
          <p>You are responsible for making sure you have the right to upload any content you put into the service.</p>

          <Heading>Our intellectual property</Heading>
          <p>The Shoots name, logo, design, software, and the structure and organisation of the funding database are owned by Paul Kilty trading as Shoots. You may not copy, modify, redistribute, or commercially exploit any of these without our written permission.</p>
          <p>You may, of course, use the funding information surfaced to you through the service for your own internal purposes, such as preparing applications and managing your fundraising.</p>

          <Heading>Service availability</Heading>
          <p>We aim to keep the service running reliably, but we cannot guarantee uninterrupted access. The service may be unavailable from time to time for maintenance, updates, or due to circumstances outside our control. We will try to give advance notice of planned downtime where reasonable.</p>
          <p>We may change, add, or remove features as the product develops. If we remove a feature that is central to the plan you pay for, we will tell you in advance, and you may cancel before the change takes effect.</p>

          <Heading>Plans and pricing</Heading>
          <p>Shoots is offered on subscription plans. The plans, what each includes, and the current prices are set out on our <Link href="/#pricing" style={{ color: '#3B6D11', fontWeight: 600 }}>pricing page</Link>. The price you pay is the price shown when you subscribe. Plans are billed monthly or annually, in advance, in pounds sterling.</p>
          <p>Where we offer a launch or introductory price, the period it lasts and the price that applies afterwards are stated alongside it when you subscribe. When that period ends, your subscription continues at the standard price for your plan unless you cancel.</p>
          <p>The Team plan is priced for each organisation by agreement. Where a Team plan is agreed, any written terms specific to that agreement sit alongside these terms.</p>
          <p>We may change our prices. If a change affects a subscription you already hold, we will give you at least 30 days&apos; notice by email before it takes effect, and you may cancel before then.</p>

          <Heading>Payment</Heading>
          <p>Payments are taken by card through Stripe, our payment provider. By subscribing you authorise us to charge your card at the start of each billing period until you cancel. We do not see or store your full card details; Stripe holds them under its own security standards.</p>
          <p>If a payment fails, we will let you know and retry it. If it continues to fail, your subscription ends and your account moves to the limited state described under &ldquo;Free trial&rdquo;. Your data is kept, and you can subscribe again at any time.</p>
          <p>Receipts for each payment are sent to your account email address.</p>

          <Heading>Cancellation and refunds</Heading>
          <p>You can cancel your subscription at any time from your account page. Your plan stays active until the end of the period you have paid for, and you are not charged again after that. We do not give partial refunds for the unused part of a billing period.</p>
          <p>There is one exception. If you ask within 30 days of your first payment, we will refund that payment in full, no questions asked. Email <a href="mailto:hello@shootsfunding.co.uk" style={{ color: '#3B6D11', fontWeight: 600 }}>hello@shootsfunding.co.uk</a> and we will do the rest. The guarantee applies once per organisation, to the first paid subscription, and we may decline a refund where we believe it is being abused.</p>
          <p>When a subscription ends, your account moves to the limited state described under &ldquo;Free trial&rdquo;. Your organisation profile, saved opportunities, pipeline and applications are kept. On a paid plan you can export your data from your account page; on any plan, email us and we will send you a copy. If an account stays without a subscription for 12 months, we may close it after giving you notice by email.</p>

          <Heading>Liability</Heading>
          <p>We do our best to provide a useful, reliable service, but to the maximum extent permitted by UK law:</p>
          <p>The service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. We do not guarantee that it will be uninterrupted, error-free, or that it will meet your specific needs.</p>
          <p>We are not liable for indirect, consequential, or special losses, including loss of funding opportunities, loss of profit, or loss of goodwill.</p>
          <p>Our total liability to you for any claim arising out of or in connection with the service is limited to either £100 or the amount you have paid us in the 6 months before the claim, whichever is greater.</p>
          <p>Nothing in these terms limits or excludes liability that cannot be limited or excluded under UK law, including liability for death or personal injury caused by negligence, or for fraud.</p>

          <Heading>Indemnity</Heading>
          <p>You agree to indemnify us against any claims, losses, or costs arising from your breach of these terms or your misuse of the service.</p>

          <Heading>Ending these terms</Heading>
          <p>You can stop using the service at any time by closing your account.</p>
          <p>We may suspend or close your account if you breach these terms, if we are required to by law, or if we decide to stop offering the service. Where possible, we will give reasonable notice.</p>
          <p>If your account is closed, the rights and licences granted to you under these terms end. Sections that should reasonably survive termination, such as those covering liability and intellectual property, will continue to apply.</p>

          <Heading>Changes to these terms</Heading>
          <p>We may update these terms from time to time. If we make significant changes, we will let you know by email or through a notice on the service. The &ldquo;last updated&rdquo; date at the top of this page will always show when the terms were last changed.</p>
          <p>If you continue to use the service after changes take effect, you accept the updated terms.</p>

          <Heading>Governing law</Heading>
          <p>These terms are governed by the laws of England and Wales. Any disputes will be subject to the exclusive jurisdiction of the courts of England and Wales.</p>

          <Heading>Contact us</Heading>
          <p>If you have any questions about these terms, please email <a href="mailto:hello@shootsfunding.co.uk" style={{ color: '#3B6D11', fontWeight: 600 }}>hello@shootsfunding.co.uk</a>.</p>
        </div>
      </main>
    </div>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontFamily: UI, fontSize: 22, fontWeight: 700, color: '#173404', letterSpacing: '-0.015em', marginTop: 36, marginBottom: 12 }}>
      {children}
    </h2>
  )
}
