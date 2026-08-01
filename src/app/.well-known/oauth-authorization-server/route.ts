// OAuth 2.0 Authorization Server Metadata (RFC 8414).
// Advertises Grant Tracker as an OAuth 2.0 authorization server to MCP
// clients (Claude Desktop, claude.ai, etc.) per the Anthropic Connectors
// Directory spec.

import { NextResponse } from 'next/server'
import { OAUTH_ISSUER, OAUTH_SCOPES_SUPPORTED } from '@/lib/mcp-oauth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const metadata = {
    issuer:                                  OAUTH_ISSUER,
    authorization_endpoint:                  `${OAUTH_ISSUER}/oauth/authorize`,
    token_endpoint:                          `${OAUTH_ISSUER}/oauth/token`,
    registration_endpoint:                   `${OAUTH_ISSUER}/oauth/register`,
    revocation_endpoint:                     `${OAUTH_ISSUER}/oauth/revoke`,
    scopes_supported:                        OAUTH_SCOPES_SUPPORTED,
    response_types_supported:                ['code'],
    response_modes_supported:                ['query'],
    grant_types_supported:                   ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported:        ['S256'],
    token_endpoint_auth_methods_supported:   ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    service_documentation:                   `${OAUTH_ISSUER}/mcp`,
    // RFC 9207 §3. buildRedirect() stamps `iss` on every authorization
    // response, so advertise it — a client that validates the parameter needs
    // to know it is authoritative here rather than optional.
    authorization_response_iss_parameter_supported: true,
  }
  return NextResponse.json(metadata, {
    headers: {
      'Cache-Control':                'public, max-age=300',
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  })
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
