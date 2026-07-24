// OAuth 2.0 Protected Resource Metadata (RFC 9728 + MCP auth spec).
// Points clients at the authorization server for the MCP resource.
// Required by the MCP authorization flow — clients fetch this
// from the 401 WWW-Authenticate header on the protected resource.

import { NextResponse } from 'next/server'
import { OAUTH_ISSUER, OAUTH_RESOURCE, OAUTH_SCOPES_SUPPORTED } from '@/lib/mcp-oauth'
import { brand } from '@/config/brand'

export const dynamic = 'force-dynamic'

export async function GET() {
  const metadata = {
    resource:                OAUTH_RESOURCE,
    authorization_servers:   [OAUTH_ISSUER],
    scopes_supported:        OAUTH_SCOPES_SUPPORTED,
    resource_name:           brand.mcp.productName,
    resource_documentation:  `${OAUTH_ISSUER}/mcp`,
    bearer_methods_supported: ['header'],
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
