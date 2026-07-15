-- 043_composed_notes.sql
-- Research agent v1.1 §2: compose-then-render.
-- Additive, idempotent.

alter table public.agent_messages
  add column if not exists composed_note jsonb null;

comment on column public.agent_messages.composed_note is
  'v1.1 §2: the composed research note for this turn (schema_version, read, ordered shortlist,
   weaker matches -- each item''s card data hydrated live from this turn''s real tool results by
   the orchestrator loop, never re-derived on reload). Populated only on a research thread''s
   final assistant row per turn (see loop.ts''s post-loop normalization). Null everywhere else,
   including every pre-migration research-thread row -- accepted, not backfilled (v1.1 amendment
   §2 plan, "reload back-compat" decision).';
