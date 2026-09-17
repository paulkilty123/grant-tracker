-- Structured outcomes on the pipeline (Paul, 11 September 2026).
--
-- Won and declined were stages with a free-text note. For the central brain to
-- learn "organisations like you won here", a decline needs a reason from a
-- short list and a win needs the amount. One question at the moment of
-- marking, both optional, nothing else changes.

alter table public.pipeline_items
  add column if not exists outcome_reason text
    check (outcome_reason is null or outcome_reason in (
      'not_eligible', 'oversubscribed', 'weak_fit', 'amount_too_high',
      'application_weak', 'no_reason_given', 'withdrawn', 'other'
    )),
  add column if not exists amount_awarded numeric;

comment on column public.pipeline_items.outcome_reason is
  'Why a declined item was declined, from a fixed list. Null when unknown or not declined.';
comment on column public.pipeline_items.amount_awarded is
  'Amount actually awarded on a won item, in pounds. Null when not recorded.';
