# MCP legal copy — for phase 6 and the rebrand pass

Three pieces: the rewritten privacy policy MCP section, two additions to the terms,
and the signup consent copy for the OAuth authorize page. British English, sentence
case, no em dashes, matching the existing voice of both documents.

Placeholders to confirm before shipping: the final endpoint path on shootsfunding.co.uk
(assumed `https://www.shootsfunding.co.uk/api/mcp/v1/mcp`) and the new contact address
(assumed `hello@shootsfunding.co.uk`).

---

## 1. Privacy policy — replace the "MCP, OAuth, and API access" section

Replaces the existing section in full. Changes from the current version: "read-only"
corrected to describe actual read and write access, the endpoint URL corrected,
account creation during connection added, registration wording future-proofed for
the move away from Dynamic Client Registration, and all naming updated.

---

### MCP, OAuth, and API access

Shoots operates a Model Context Protocol (MCP) server at
`https://www.shootsfunding.co.uk/api/mcp/v1/mcp`. The MCP lets AI agents, including
Claude, ChatGPT, Gemini, and any other MCP-compatible client, use Shoots on your
behalf, so that an agent you already work with can answer your funding questions.
Connecting an AI agent is opt-in.

All connected accounts can read from our funding catalogue through the MCP. On plans
that include pipeline features, a connected agent can also make changes on your
behalf, limited to your own organisation's data: saving opportunities to your
pipeline, updating pipeline items, and setting your funding goal. An agent can never
read or change another organisation's data, and it can only do what your plan allows.

You connect by completing the OAuth consent flow that an MCP-compatible client starts
when it adds Shoots as a connector. The client registers itself with us automatically
using standard MCP registration mechanisms. If you do not yet have a Shoots account,
you can create one during the connection flow; the account data we collect is the
same as described in "What data we collect" above.

**What we store when you connect.** When you complete the OAuth flow, we store the
registration record for the AI client, the access and refresh tokens issued to that
client, the user identifier the client is acting on behalf of, and a record of your
consent. We do not store your AI-client conversation history or anything else from
inside the agent.

**What we log when the MCP is used.** When an AI agent makes a request to the MCP on
your behalf, we may log the tool that was called, the parameters passed (for example,
search filters or opportunity IDs), the authentication identifier on the request (the
OAuth client and user ID), the source IP address, the response status, and the
response time. We use these logs to operate rate limiting, to debug issues, and to
measure service quality. They are not shared with the AI client and are not used to
identify individuals beyond the authentication identifier already on the request.

**Third-party AI clients.** The AI client you use to connect to Shoots (for example,
Claude operated by Anthropic) is a separate company with its own privacy policy and
its own handling of your conversation history. When the client calls Shoots via MCP,
the responses we return are passed back into that client's context. We have no
control over how the client stores, retains, or further processes that data; that
relationship is between you and the client. Before connecting, you should be
comfortable with the AI client's privacy practices for the content of your queries
and our responses.

**Revoking access.** To revoke a connection, disconnect Shoots from inside the AI
client you connected through; revocation is enforced on the next request. After
revocation, retention follows the rules in "How long we keep your data" below.

---

Also check in the same pass, elsewhere in the privacy policy:

- "How your activity builds your organisation's profile" mentions the MCP by name;
  update the product name there.
- The data controller line becomes "Paul Kilty, sole trader, trading as Shoots"
  (and consider noting "formerly Grant Tracker" for the first few months so
  returning users recognise it).
- All `hello@granttracker.co.uk` references and internal links update to the new
  domain.
- Add one line under "Changes to this policy" or as a dated note at the top:
  "In [month] 2026 Grant Tracker became Shoots. This is a change of name only;
  nothing about how we handle your data changed."

---

## 2. Terms of service — two additions for the August pass

The full commercial rewrite of the terms (tiers, trial, billing, money-back promise)
belongs with the Stripe work in September. These two additions are the only pieces
needed before the connector goes live.

### 2a. New section — insert after "Your account"

---

### Connecting AI agents

Shoots can be connected to AI agents, such as Claude, through our Model Context
Protocol (MCP) server. When you connect an agent, it acts under your account, and
activity it carries out is treated as activity by you. You are responsible for the
agents you connect, including staying within our usage limits, and you can revoke a
connection at any time from inside the AI client.

Our [privacy policy](/privacy) explains what we store and log when an agent is
connected and used.

---

### 2b. Acceptable use — add one bullet

Add to the existing bullet list, after the scraping bullet:

---

- Use an AI agent or automated client to extract data from the service in bulk, to
  circumvent usage limits, or for any purpose the "scrape, copy, or extract" rule
  above would prohibit if done directly.

---

## 3. Signup consent copy — OAuth authorize page

For the account-creation step inside the connection flow. UK GDPR/PECR position:
the account itself needs no consent box (contract basis), but marketing does. One
unticked checkbox is the clean approach.

Checkbox (unticked by default):

> Send me occasional emails about new funding opportunities and Shoots updates.
> Unsubscribe any time.

Beneath the form, small print:

> By creating an account you agree to our [terms of service](/terms) and
> [privacy policy](/privacy). Connecting through an AI client shares your funding
> searches with that client; see the privacy policy for how this works.

Two notes on this:

- Do not pre-tick the marketing box. It invalidates the consent under UK GDPR and
  it is the first thing a privacy-conscious charity fundraiser looks for.
- Transactional email (receipts, security, service notices) needs no consent and
  should not be gated on this checkbox.
