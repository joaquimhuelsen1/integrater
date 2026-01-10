-- Migration: Automation Rules Expansion
-- Adiciona novos triggers, actions e tabela de execucoes

-- =============================================
-- 1. NOVOS VALORES PARA ENUMS
-- =============================================

-- Adicionar novo trigger type: message_sent
alter type public.automation_trigger_type add value if not exists 'message_sent';

-- Adicionar novas action types: add_tag, send_message
alter type public.automation_action_type add value if not exists 'add_tag';
alter type public.automation_action_type add value if not exists 'send_message';

-- =============================================
-- 2. TABELA DE EXECUCOES DE AUTOMACAO
-- =============================================
create table if not exists public.automation_executions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  rule_id uuid not null references public.automation_rules(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,

  trigger_type public.automation_trigger_type not null,
  trigger_data jsonb not null default '{}'::jsonb,

  action_type public.automation_action_type not null,
  action_data jsonb not null default '{}'::jsonb,

  status text not null default 'success' check (status in ('success', 'failed')),
  error_message text,

  executed_at timestamptz not null default now()
);

-- =============================================
-- 3. INDICES PARA PERFORMANCE
-- =============================================
create index if not exists automation_executions_owner_idx
  on public.automation_executions(owner_id);

create index if not exists automation_executions_rule_idx
  on public.automation_executions(rule_id);

create index if not exists automation_executions_deal_idx
  on public.automation_executions(deal_id);

create index if not exists automation_executions_executed_at_idx
  on public.automation_executions(owner_id, executed_at desc);

create index if not exists automation_executions_status_idx
  on public.automation_executions(owner_id, status)
  where status = 'failed';

-- =============================================
-- 4. RLS POLICIES
-- =============================================
alter table public.automation_executions enable row level security;

drop policy if exists owner_all_automation_executions on public.automation_executions;
create policy owner_all_automation_executions on public.automation_executions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
