import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import LogoMark from '@/components/icons/LogoMark'

export const metadata = {
  title: 'Terms of service — Grant Tracker',
  description: 'The terms governing your use of Grant Tracker.',
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
            <span style={{ fontFamily: UI, fontWeight: 700, fontSize: 18, color: '#173404', letterSpacing: '-0.025em' }}>GrantTracker</span>
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
          <strong style={{ color: '#2C2C2A' }}>Last updated:</strong> 28 April 2026
        </p>

        <div style={{ fontSize: 16, lineHeight: 1.65, color: '#2C2C2A' }}>
          <p>
            These terms govern your use of Grant Tracker. By creating an account or otherwise using the service, you agree to these terms. If you do not agree, please do not use the service.
          </p>
          <p>
            If you have any questions about these terms, please email <a href="mailto:hello@granttracker.co.uk" style={{ color: '#3B6D11', fontWeight: 600 }}>hello@granttracker.co.uk</a>.
          </p>

          <Heading>Who we are</Heading>
          <p>
            Grant Tracker is operated by Paul Kilty as a sole trader, based in Brighton, United Kingdom. In these terms, &ldquo;we&rdquo;, &ldquo;us&rdquo;, and &ldquo;our&rdquo; refer to Paul Kilty trading as Grant Tracker. &ldquo;You&rdquo; and &ldquo;your&rdquo; refer to the person using the service or the organisation they represent.
          </p>

          <Heading>What Grant Tracker is</Heading>
          <p>
            Grant Tracker is a service that helps UK charities, community interest companies, social enterprises, co-operatives, and impact-focused organisations discover and manage funding opportunities. The service includes a database of funding opportunities, matching tools, a pipeline manager, deadline alerts, and related features.
          </p>

          <Heading>Founding cohort</Heading>
          <p>
            During the founding cohort phase, the service is offered free of charge to invited members. Founding cohort terms are set out on the application page at <Link href="/apply" style={{ color: '#3B6D11', fontWeight: 600 }}>granttracker.co.uk/apply</Link> and form part of these terms for cohort members. In summary:
          </p>
          <ul style={{ paddingLeft: 22, margin: '8px 0 16px' }}>
            <li style={{ marginBottom: 8 }}>Founding cohort members get free access during beta and for six months after paid signups open.</li>
            <li style={{ marginBottom: 8 }}>Cohort members who remain active receive a permanent founding rate, set lower than the standard subscription, for as long as they stay with Grant Tracker.</li>
            <li>Cohort benefits depend on staying active and engaged. If you go quiet for six months, cohort status lapses and standard pricing applies.</li>
          </ul>
          <p>These cohort-specific terms sit alongside the general terms below.</p>

          <Heading>Your account</Heading>
          <p>To use the service you must create an account. You must provide accurate information, keep your password secure, and not share your account with others. You are responsible for activity that happens under your account.</p>
          <p>You must be at least 18 years old to create an account. The service is intended for use by UK organisations engaged in social impact work, broadly defined. We may decline an application or close an account at our discretion if we believe the service is being used outside its intended purpose.</p>
          <p>You can close your account at any time by emailing <a href="mailto:hello@granttracker.co.uk" style={{ color: '#3B6D11', fontWeight: 600 }}>hello@granttracker.co.uk</a>. We will delete or anonymise your personal data within 30 days, subject to any legal requirements to retain certain records.</p>

          <Heading>Acceptable use</Heading>
          <p>When using the service, you agree not to:</p>
          <ul style={{ paddingLeft: 22, margin: '8px 0 16px' }}>
            <li style={{ marginBottom: 8 }}>Use the service for any unlawful purpose, or in a way that breaches anyone else&apos;s rights.</li>
            <li style={{ marginBottom: 8 }}>Attempt to access parts of the service you are not authorised to access, or interfere with how the service works.</li>
            <li style={{ marginBottom: 8 }}>Scrape, copy, or extract data from the service for use in a competing product or for redistribution.</li>
            <li style={{ marginBottom: 8 }}>Reverse engineer, decompile, or attempt to derive the source code of the service.</li>
            <li style={{ marginBottom: 8 }}>Upload or transmit any content that is illegal, defamatory, or harmful.</li>
            <li>Use the service to send unsolicited communications to third parties.</li>
          </ul>
          <p>We may suspend or close accounts that breach these rules. Where we can, we will let you know first and give you a chance to put things right.</p>

          <Heading>Funding data and your decisions</Heading>
          <p>Grant Tracker aggregates information about funding opportunities from a variety of public and partner sources. We work hard to keep this information accurate and up to date, but we cannot guarantee that every detail is correct at any given moment. Funder eligibility, deadlines, and amounts can change without notice.</p>
          <p>You are responsible for your own funding decisions. Before applying for any opportunity surfaced through the service, you should verify the details directly with the funder. Grant Tracker is a tool to help you find and manage opportunities, not a substitute for your own due diligence.</p>
          <p>We are not a funder, and using Grant Tracker does not guarantee that you will receive funding. We do not take a commission, finder&apos;s fee, or any cut of grants you secure through the service.</p>

          <Heading>Your data</Heading>
          <p>We take privacy seriously. Our <Link href="/privacy" style={{ color: '#3B6D11', fontWeight: 600 }}>privacy policy</Link> explains what data we collect, how we use it, and the rights you have over it. By using the service, you agree to the practices set out in the privacy policy.</p>
          <p>Your organisation&apos;s data stays private to your account. We do not share it with funders, other organisations, or third parties without your explicit permission.</p>

          <Heading>Your content</Heading>
          <p>If you upload content to the service, such as notes, organisation descriptions, or pipeline data, you keep ownership of that content. You give us a limited licence to store, display, and process that content as needed to provide the service to you. This licence ends when you delete the content or close your account.</p>
          <p>You are responsible for making sure you have the right to upload any content you put into the service.</p>

          <Heading>Our intellectual property</Heading>
          <p>The Grant Tracker name, logo, design, software, and the structure and organisation of the funding database are owned by Paul Kilty trading as Grant Tracker. You may not copy, modify, redistribute, or commercially exploit any of these without our written permission.</p>
          <p>You may, of course, use the funding information surfaced to you through the service for your own internal purposes, such as preparing applications and managing your fundraising.</p>

          <Heading>Service availability</Heading>
          <p>We aim to keep the service running reliably, but we cannot guarantee uninterrupted access. The service may be unavailable from time to time for maintenance, updates, or due to circumstances outside our control. We will try to give advance notice of planned downtime where reasonable.</p>
          <p>We may change, add, or remove features as the product develops. During the founding cohort phase in particular, you should expect the service to evolve based on cohort feedback.</p>

          <Heading>Pricing and payment</Heading>
          <p>During the founding cohort phase, the service is free for invited members. Pricing for paid signups will be confirmed before paid plans open. Founding cohort members will be notified in advance of any changes to their access terms, and will receive the founding rate set out on the application page.</p>
          <p>If you are on a paid plan in future, full payment terms will be set out at the point of subscription.</p>

          <Heading>Liability</Heading>
          <p>We do our best to provide a useful, reliable service, but to the maximum extent permitted by UK law:</p>
          <p>The service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. We do not guarantee that it will be uninterrupted, error-free, or that it will meet your specific needs.</p>
          <p>We are not liable for indirect, consequential, or special losses, including loss of funding opportunities, loss of profit, or loss of goodwill.</p>
          <p>Our total liability to you for any claim arising out of or in connection with the service is limited to either £100 or the amount you have paid us in the 12 months before the claim, whichever is greater.</p>
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
          <p>If you have any questions about these terms, please email <a href="mailto:hello@granttracker.co.uk" style={{ color: '#3B6D11', fontWeight: 600 }}>hello@granttracker.co.uk</a>.</p>
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
