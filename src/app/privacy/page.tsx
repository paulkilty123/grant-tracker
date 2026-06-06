import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import LogoMark from '@/components/icons/LogoMark'

export const metadata = {
  title: 'Privacy policy — Grant Tracker',
  description: 'How Grant Tracker collects, uses, and protects your personal data.',
}

const UI = 'var(--font-space-grotesk), Space Grotesk, sans-serif'
const BODY = 'var(--font-dm-sans), Plus Jakarta Sans, sans-serif'

export default function PrivacyPage() {
  return (
    <div style={{ background: '#FAFAF7', minHeight: '100vh', fontFamily: BODY, color: '#2C2C2A' }}>

      {/* NAV */}
      <nav style={{ background: 'white', borderBottom: '0.5px solid rgba(23,52,4,0.08)', padding: '18px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" className="no-underline" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <LogoMark size={22} />
            <span style={{ fontFamily: UI, fontWeight: 700, fontSize: 18, color: '#173404', letterSpacing: '-0.02em' }}>GrantTracker</span>
          </Link>
          <Link href="/" className="no-underline" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: UI, fontSize: 13, fontWeight: 600, color: '#173404' }}>
            <ArrowLeft size={14} /> Back home
          </Link>
        </div>
      </nav>

      {/* CONTENT */}
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '64px 24px 96px' }}>
        <h1 style={{ fontFamily: UI, fontSize: 'clamp(36px, 5vw, 48px)', fontWeight: 700, letterSpacing: '-0.025em', color: '#173404', margin: 0, lineHeight: 1.05 }}>
          Privacy policy
        </h1>
        <p style={{ marginTop: 12, marginBottom: 40, fontSize: 14, color: '#5F5E5A' }}>
          <strong style={{ color: '#2C2C2A' }}>Last updated:</strong> 4 June 2026
        </p>

        <div style={{ fontSize: 16, lineHeight: 1.65, color: '#2C2C2A' }}>
          <p>
            This privacy policy explains how Grant Tracker collects, uses, and protects your personal data. Grant Tracker is operated by Paul Kilty as a sole trader, based in Brighton, United Kingdom.
          </p>
          <p>
            If you have any questions about this policy or how we handle your data, please email <a href="mailto:hello@granttracker.co.uk" style={{ color: '#3B6D11', fontWeight: 600 }}>hello@granttracker.co.uk</a>.
          </p>

          <Heading>Who we are</Heading>
          <p>
            Grant Tracker is a service that helps UK charities, community interest companies, social enterprises, co-operatives, and impact-focused organisations discover and manage funding opportunities.
          </p>
          <p>For the purposes of UK data protection law, the data controller is:</p>
          <p style={{ background: '#F1F7E4', borderRadius: 12, padding: '16px 20px', margin: '16px 0' }}>
            Paul Kilty, sole trader, trading as Grant Tracker<br />
            Email: <a href="mailto:hello@granttracker.co.uk" style={{ color: '#3B6D11', fontWeight: 600 }}>hello@granttracker.co.uk</a>
          </p>

          <Heading>What data we collect</Heading>
          <p>We collect the following categories of personal data:</p>
          <p><strong>Account data.</strong> When you create an account, we collect your first name, organisation name, email address, and an encrypted version of your password.</p>
          <p><strong>Profile data.</strong> When you complete your organisation profile, you may provide additional information including your organisation type, sectors and beneficiaries you serve, geographic focus, and information about your funding history. This data is used to match you with relevant funding opportunities.</p>
          <p><strong>Application data.</strong> If you apply to join the founding cohort, we collect the responses you provide on the application form, including your contact details and the information you share about your organisation and fundraising context.</p>
          <p><strong>Usage data.</strong> We collect aggregate, anonymised data about how the service is used, such as which pages are visited and which features are most useful. We use this to improve the service. We do not use this data to identify individual users.</p>
          <p><strong>Communications data.</strong> If you email us or respond to our messages, we keep a record of the correspondence.</p>
          <p>We do not knowingly collect data from children, and the service is not directed at people under 18.</p>

          <Heading>How we use your data</Heading>
          <p>We use your personal data for the following purposes:</p>
          <p>To provide the service. This includes creating and managing your account, matching you with funding opportunities based on your profile, sending you alerts about deadlines you have set, and storing the funding pipeline you build.</p>
          <p>To communicate with you. This includes responding to your questions, sending occasional product updates, and contacting you for monthly cohort check-ins if you are a founding cohort member.</p>
          <p>To improve the service. We use anonymised usage data to understand which features are working and where the product needs to improve.</p>
          <p>To comply with our legal obligations. This includes responding to lawful requests from regulators and authorities, and maintaining records where required by law.</p>

          <Heading>Legal basis for processing</Heading>
          <p>Under UK GDPR, we rely on the following legal bases:</p>
          <p><strong>Contract.</strong> Most of our processing is necessary to provide the service you have signed up for. This covers account management, profile data, and the core matching and tracking functions.</p>
          <p><strong>Legitimate interests.</strong> We rely on legitimate interests for activities such as improving the service, responding to your enquiries, and contacting cohort members for feedback. We have considered the impact on you and believe these uses are proportionate.</p>
          <p><strong>Consent.</strong> Where you have given consent, for example to receive marketing communications or to allow analytics cookies, we rely on that consent. You can withdraw consent at any time.</p>
          <p><strong>Legal obligation.</strong> Where we are required by law to retain or disclose data, we rely on that legal obligation.</p>

          <Heading>Who we share your data with</Heading>
          <p>We share your data only with the following categories of recipient, and only as necessary:</p>
          <p><strong>Service providers.</strong> We use trusted third-party providers to run the service. These are:</p>
          <ul style={{ paddingLeft: 22, margin: '8px 0 16px' }}>
            <li style={{ marginBottom: 8 }}><strong>Supabase</strong> stores your account data, profile data, and pipeline data. Supabase is a data processor acting on our instructions. Their privacy policy is at <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#3B6D11', fontWeight: 600 }}>supabase.com/privacy</a>.</li>
            <li style={{ marginBottom: 8 }}><strong>Vercel</strong> hosts the website and processes the technical requests needed to load pages. Vercel acts as a data processor. Their privacy policy is at <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: '#3B6D11', fontWeight: 600 }}>vercel.com/legal/privacy-policy</a>.</li>
            <li><strong>Upstash</strong> provides the rate-limit counters used by our MCP server (see &ldquo;MCP, OAuth, and API access&rdquo; below). Upstash stores short-lived per-IP and per-key request counts; no profile or pipeline data is sent to Upstash. Their privacy policy is at <a href="https://upstash.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#3B6D11', fontWeight: 600 }}>upstash.com/privacy</a>.</li>
          </ul>
          <p>We do not sell your personal data to anyone. We do not share your organisation&apos;s data with funders, other organisations, or third parties without your explicit permission.</p>
          <p><strong>Legal disclosures.</strong> We may disclose your data if required by law, court order, or to protect our legal rights, but only to the extent necessary.</p>

          <Heading>MCP, OAuth, and API access</Heading>
          <p>
            Grant Tracker operates a read-only Model Context Protocol (MCP) server at <a href="https://granttracker.co.uk/mcp" style={{ color: '#3B6D11', fontWeight: 600 }}>granttracker.co.uk/mcp</a>. The MCP exposes our funding catalogue to AI agents — including Claude, ChatGPT, Gemini, and any other MCP-compatible client — so that an agent you use can answer your funding questions on your behalf. Connecting an AI agent is opt-in.
          </p>
          <p>You can connect in one of two ways:</p>
          <ul style={{ paddingLeft: 22, margin: '8px 0 16px' }}>
            <li style={{ marginBottom: 8 }}>by generating a Grant Tracker MCP API key from your account, and pasting it into the agent&apos;s connector settings, or</li>
            <li>by completing the OAuth 2.0 consent flow that an MCP-compatible client initiates when it adds Grant Tracker as a connector. This uses Dynamic Client Registration, which means the client registers itself with us automatically the first time it connects.</li>
          </ul>
          <p>
            <strong>What we store when you connect.</strong> When you generate an API key, we store a one-way hash of the key (we do not retain the key itself), the date of issuance, and the version of the MCP terms you accepted. When you complete the OAuth flow, we store the registration record for the AI client, the access and refresh tokens issued to that client, the user identifier the client is acting on behalf of, and a record of your consent. We do not store your AI-client conversation history or anything else from inside the agent.
          </p>
          <p>
            <strong>What we log when the MCP is used.</strong> When an AI agent makes a request to the MCP on your behalf, we may log the tool that was called, the parameters passed (for example, search filters or opportunity IDs), the authentication identifier on the request (API key hash, or OAuth client and user ID), the source IP address, the response status, and the response time. We use these logs to operate rate limiting, to debug issues, and to measure service quality. They are not shared with the AI client and are not used to identify individuals beyond the authentication identifier already on the request.
          </p>
          <p>
            <strong>Third-party AI clients.</strong> The AI client you use to connect to Grant Tracker (for example, Claude operated by Anthropic) is a separate company with its own privacy policy and its own handling of your conversation history. When the client calls Grant Tracker via MCP, the responses we return are passed back into that client&apos;s context. We have no control over how the client stores, retains, or further processes that data — that relationship is between you and the client. Before connecting, you should be comfortable with the AI client&apos;s privacy practices for the content of your queries and our responses.
          </p>
          <p>
            <strong>Revoking access.</strong> You can revoke an API key at any time from your Grant Tracker account; revocation is enforced on the next request. To revoke an OAuth connection, disconnect Grant Tracker from inside the AI client you connected through. After revocation, retention follows the rules in &ldquo;How long we keep your data&rdquo; below.
          </p>

          <Heading>Where your data is stored</Heading>
          <p>Our service providers operate data centres in the United Kingdom, the European Union, and the United States. Where data is transferred outside the UK, the providers we use rely on appropriate safeguards such as Standard Contractual Clauses or UK Adequacy Decisions to ensure your data remains protected to UK GDPR standards.</p>

          <Heading>How long we keep your data</Heading>
          <p>We keep your account and profile data for as long as your account is active. If you close your account, we will delete or anonymise your personal data within 30 days, except where we are required by law to keep it for longer.</p>
          <p>Application data from people who applied to the founding cohort but were not accepted is kept for up to 12 months in case future cohort spots open up, and then deleted.</p>
          <p>Email correspondence is kept for up to 24 months unless there is a specific reason to retain it longer.</p>
          <p>MCP API key hashes and OAuth client and token records are kept for as long as the credential is active. After you revoke an API key or disconnect an OAuth client, we keep the record for a further 12 months for fraud-prevention and rate-limit-consistency purposes, and then delete it. MCP request logs are kept for up to 12 months and then deleted or anonymised.</p>

          <Heading>Cookies and analytics</Heading>
          <p>We use a small number of essential cookies that are necessary for the service to work, such as remembering that you are signed in.</p>
          <p>We may also use a privacy-respecting analytics tool to understand how the service is used in aggregate. If we do, we will ask for your consent through a cookie banner before any non-essential cookies are set, and you can change your choice at any time.</p>
          <p>We do not use advertising cookies, third-party trackers, or session recording tools.</p>

          <Heading>Your rights</Heading>
          <p>Under UK GDPR, you have the following rights in relation to your personal data:</p>
          <p>The right to be informed about how we use your data, which is the purpose of this policy.</p>
          <p>The right of access. You can ask us for a copy of the personal data we hold about you.</p>
          <p>The right to rectification. You can ask us to correct inaccurate or incomplete data.</p>
          <p>The right to erasure. You can ask us to delete your data, subject to certain exceptions.</p>
          <p>The right to restrict processing. You can ask us to limit how we use your data.</p>
          <p>The right to data portability. You can ask us to provide your data in a portable format.</p>
          <p>The right to object. You can object to processing based on legitimate interests.</p>
          <p>The right to withdraw consent at any time, where we are relying on consent.</p>
          <p>To exercise any of these rights, please email <a href="mailto:hello@granttracker.co.uk" style={{ color: '#3B6D11', fontWeight: 600 }}>hello@granttracker.co.uk</a>. We will respond within one month.</p>
          <p>If you are not satisfied with how we have handled your data, you have the right to complain to the Information Commissioner&apos;s Office (ICO), the UK data protection regulator. You can contact them at <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" style={{ color: '#3B6D11', fontWeight: 600 }}>ico.org.uk</a> or on 0303 123 1113.</p>

          <Heading>Changes to this policy</Heading>
          <p>We may update this policy from time to time. If we make significant changes, we will let you know by email or through a notice on the service. The &ldquo;last updated&rdquo; date at the top of this page will always show when the policy was last changed.</p>

          <Heading>Contact us</Heading>
          <p>If you have any questions about this privacy policy or how we handle your data, please email <a href="mailto:hello@granttracker.co.uk" style={{ color: '#3B6D11', fontWeight: 600 }}>hello@granttracker.co.uk</a>.</p>
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
