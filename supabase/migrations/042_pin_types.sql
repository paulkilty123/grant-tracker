-- 042_pin_types.sql
-- Research agent v1.1 §5: typed, expandable pins ("the research log").
-- Additive, idempotent.
--
-- DESIGN: pin_type (profile | finding | decision) is orthogonal to the
-- existing source_kind (catalogue | researched | adviser_judgment) --
-- source_kind is WHERE the content came from, pin_type is WHAT KIND OF
-- ARTEFACT it is. A profile pin points at a full agent_thread_briefs row
-- (brief_id) so the research log can expand it in place / open the full
-- profile without duplicating the brief's sections onto the pin row.
--
-- decision is schema-ready but not wired to any write path in this pass --
-- same dormant-column precedent as agent_threads.focus_purpose_id (v1.1 §1)
-- -- reserved for a future adviser-suggested-pin flow ("adviser may suggest
-- a pin in prose", spec §5, not yet built). Existing pre-typing rows
-- backfill to 'finding' (the majority case; brief-pins created before this
-- migration can't be distinguished from finding-pins after the fact, and
-- there are few enough rows in the beta catalogue that this is an accepted
-- imprecision, not a data-loss concern).

alter table public.agent_thread_pins
  add column if not exists pin_type text not null default 'finding' check (pin_type in ('profile','finding','decision'));

alter table public.agent_thread_pins
  add column if not exists brief_id uuid references public.agent_thread_briefs(id) on delete set null;

create index if not exists agent_thread_pins_brief on public.agent_thread_pins (brief_id) where brief_id is not null;

comment on column public.agent_thread_pins.pin_type is 'v1.1 §5: profile | finding | decision. Existing rows backfilled to finding. decision is schema-ready, not yet wired to any write path -- reserved for a future adviser-suggested-pin flow.';
comment on column public.agent_thread_pins.brief_id is 'v1.1 §5: for pin_type=profile, points at the full agent_thread_briefs row so the pin can expand in place / open the full profile. Null for finding/decision pins.';
