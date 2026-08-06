-- Mia's Eating Life Agent Lab
-- This migration only ADDS Agent-derived tables. It does not alter public.meals.

create extension if not exists pgcrypto;

create table if not exists public.agent_weekly_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  report_data jsonb not null default '{}'::jsonb,
  source_record_count integer not null default 0 check (source_record_count >= 0),
  source_latest_at timestamptz,
  status text not null default 'complete' check (status in ('running', 'complete', 'partial', 'failed')),
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create table if not exists public.agent_nutrition_estimates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  estimate_data jsonb not null default '{}'::jsonb,
  confidence text not null default 'low' check (confidence in ('low', 'medium', 'high')),
  generated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create table if not exists public.agent_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  question text not null check (char_length(question) between 1 and 800),
  answer text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_type text not null check (run_type in ('weekly_report', 'chat')),
  status text not null check (status in ('running', 'complete', 'partial', 'failed')),
  week_start date,
  error_code text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists agent_weekly_reports_user_week_idx
  on public.agent_weekly_reports (user_id, week_start desc);
create index if not exists agent_conversations_user_created_idx
  on public.agent_conversations (user_id, created_at desc);
create index if not exists agent_runs_user_created_idx
  on public.agent_runs (user_id, created_at desc);

alter table public.agent_weekly_reports enable row level security;
alter table public.agent_nutrition_estimates enable row level security;
alter table public.agent_conversations enable row level security;
alter table public.agent_runs enable row level security;

drop policy if exists "Users manage own Agent weekly reports" on public.agent_weekly_reports;
create policy "Users manage own Agent weekly reports"
on public.agent_weekly_reports for all to authenticated
using (auth.uid() = user_id and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false)
with check (auth.uid() = user_id and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

drop policy if exists "Users manage own Agent nutrition estimates" on public.agent_nutrition_estimates;
create policy "Users manage own Agent nutrition estimates"
on public.agent_nutrition_estimates for all to authenticated
using (auth.uid() = user_id and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false)
with check (auth.uid() = user_id and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

drop policy if exists "Users manage own Agent conversations" on public.agent_conversations;
create policy "Users manage own Agent conversations"
on public.agent_conversations for all to authenticated
using (auth.uid() = user_id and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false)
with check (auth.uid() = user_id and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

drop policy if exists "Users manage own Agent runs" on public.agent_runs;
create policy "Users manage own Agent runs"
on public.agent_runs for all to authenticated
using (auth.uid() = user_id and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false)
with check (auth.uid() = user_id and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

comment on table public.agent_weekly_reports is 'Cached Agent output derived from meals; never the source of truth.';
comment on table public.agent_nutrition_estimates is 'Qualitative nutrition estimates derived from meal descriptions.';
comment on table public.agent_conversations is 'Evidence-based Q&A history; the Agent has no meal mutation tools.';
comment on table public.agent_runs is 'Minimal operational log without meal descriptions or secrets.';
