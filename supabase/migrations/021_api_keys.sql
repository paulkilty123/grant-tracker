-- 021_api_keys.sql
-- Applied to remote: 2026-05-12 via Supabase MCP apply_migration.
--
-- MCP API keys table. Issued via the self-serve signup flow at
-- granttracker.co.uk/mcp. Server-side write only — users can read
-- their own keys via authenticated SELECT (for the management UI).
-- Spec: docs/mcp-spec-v1.md §6.

CREATE TABLE public.api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash        TEXT NOT NULL UNIQUE,                   -- SHA-256 hex of raw key
  key_prefix      TEXT NOT NULL,                          -- first 12 chars of raw key (display only)
  name            TEXT NOT NULL,                          -- user-friendly label
  utm_source      TEXT NOT NULL DEFAULT 'developer_mcp',  -- per spec §7.3
  org_name        TEXT,                                   -- optional, per spec §6.1
  use_case        TEXT,                                   -- optional, per spec §6.1
  tos_version     TEXT NOT NULL,                          -- ToS frontmatter version at issuance
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at    TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  revoked_reason  TEXT
);

CREATE INDEX api_keys_key_hash_idx ON public.api_keys (key_hash);
CREATE INDEX api_keys_user_id_idx  ON public.api_keys (user_id);
CREATE INDEX api_keys_status_idx   ON public.api_keys (status);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own api keys"
  ON public.api_keys
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- INSERT/UPDATE/DELETE: service role only (no policies for anon/authenticated).
-- User-initiated revocation goes through a server endpoint that uses service role.
