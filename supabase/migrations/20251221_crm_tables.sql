-- Migration: CRM/Kanban Tables
-- Tabelas para pipelines, deals, atividades e automações

-- =============================================
-- 1. PIPELINES
-- =============================================
create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  color text not null default '#3b82f6',
  position int not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pipelines_owner_idx
  on public.pipelines(owner_id, position);

-- =============================================
-- 2. STAGES (etapas do pipeline)
-- =============================================
create table if not exists public.stages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  name text not null,
  color text not null default '#6b7280',
  position int not null default 0,
  is_win boolean not null default false,
  is_loss boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stages_pipeline_idx
  on public.stages(pipeline_id, position);

-- =============================================
-- 3. CUSTOM FIELDS (campos personalizados)
-- =============================================
do $$ begin
  create type public.custom_field_type as enum (
    'text', 'number', 'currency', 'date', 'datetime',
    'select', 'multiselect', 'checkbox',
    'file', 'link', 'email', 'phone'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.custom_fields (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  pipeline_id uuid references public.pipelines(id) on delete cascade,
  name text not null,
  field_type public.custom_field_type not null,
  options jsonb,
  is_required boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists custom_fields_pipeline_idx
  on public.custom_fields(owner_id, pipeline_id);

-- =============================================
-- 4. DEALS (oportunidades)
-- =============================================
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete restrict,
  stage_id uuid not null references public.stages(id) on delete restrict,
  contact_id uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,

  title text not null,
  value decimal(15,2) not null default 0,
  probability int not null default 50 check (probability >= 0 and probability <= 100),
  expected_close_date date,

  custom_fields jsonb not null default '{}'::jsonb,

  won_at timestamptz,
  lost_at timestamptz,
  lost_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists deals_owner_pipeline_idx
  on public.deals(owner_id, pipeline_id);

create index if not exists deals_owner_stage_idx
  on public.deals(owner_id, stage_id);

create index if not exists deals_contact_idx
  on public.deals(contact_id) where contact_id is not null;

create index if not exists deals_conversation_idx
  on public.deals(conversation_id) where conversation_id is not null;

-- Constraint: apenas 1 deal ativo por contato
create unique index if not exists deals_contact_active_uniq
  on public.deals(owner_id, contact_id)
  where archived_at is null and won_at is null and lost_at is null and contact_id is not null;

-- =============================================
-- 5. DEAL PRODUCTS (itens do deal)
-- =============================================
create table if not exists public.deal_products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  name text not null,
  value decimal(15,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists deal_products_deal_idx
  on public.deal_products(deal_id);

-- =============================================
-- 6. DEAL ACTIVITIES (timeline)
-- =============================================
do $$ begin
  create type public.deal_activity_type as enum (
    'note', 'task', 'stage_change', 'field_change', 'message_link', 'created'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.deal_activities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,

  activity_type public.deal_activity_type not null,
  content text,

  -- para tasks
  is_completed boolean not null default false,
  due_date timestamptz,

  -- para stage_change
  from_stage_id uuid references public.stages(id) on delete set null,
  to_stage_id uuid references public.stages(id) on delete set null,

  -- para field_change
  field_name text,
  old_value text,
  new_value text,

  -- para message_link
  message_id uuid references public.messages(id) on delete set null,

  created_at timestamptz not null default now()
);

create index if not exists deal_activities_deal_idx
  on public.deal_activities(deal_id, created_at desc);

-- =============================================
-- 7. AUTOMATION RULES
-- =============================================
do $$ begin
  create type public.automation_trigger_type as enum (
    'message_received', 'stage_changed', 'time_in_stage', 'field_changed', 'deal_created'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.automation_action_type as enum (
    'move_stage', 'update_field', 'create_task', 'send_notification'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,

  trigger_type public.automation_trigger_type not null,
  trigger_config jsonb not null default '{}'::jsonb,

  conditions jsonb not null default '[]'::jsonb,

  action_type public.automation_action_type not null,
  action_config jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automation_rules_pipeline_idx
  on public.automation_rules(pipeline_id, is_active);

-- =============================================
-- 8. DEAL SCORES (IA)
-- =============================================
create table if not exists public.deal_scores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,

  score int not null check (score >= 0 and score <= 100),
  factors jsonb not null default '{}'::jsonb,
  recommendation text,

  model text not null,
  created_at timestamptz not null default now()
);

create index if not exists deal_scores_deal_idx
  on public.deal_scores(deal_id, created_at desc);

-- =============================================
-- TRIGGERS para updated_at
-- =============================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists pipelines_updated_at on public.pipelines;
create trigger pipelines_updated_at
  before update on public.pipelines
  for each row execute procedure public.handle_updated_at();

drop trigger if exists stages_updated_at on public.stages;
create trigger stages_updated_at
  before update on public.stages
  for each row execute procedure public.handle_updated_at();

drop trigger if exists deals_updated_at on public.deals;
create trigger deals_updated_at
  before update on public.deals
  for each row execute procedure public.handle_updated_at();

drop trigger if exists automation_rules_updated_at on public.automation_rules;
create trigger automation_rules_updated_at
  before update on public.automation_rules
  for each row execute procedure public.handle_updated_at();

-- =============================================
-- TRIGGER: auto-criar activity em stage_change
-- =============================================
create or replace function public.handle_deal_stage_change()
returns trigger as $$
begin
  if old.stage_id is distinct from new.stage_id then
    insert into public.deal_activities (
      owner_id, deal_id, activity_type, from_stage_id, to_stage_id
    ) values (
      new.owner_id, new.id, 'stage_change', old.stage_id, new.stage_id
    );
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists deals_stage_change on public.deals;
create trigger deals_stage_change
  after update on public.deals
  for each row execute procedure public.handle_deal_stage_change();

-- =============================================
-- RLS POLICIES
-- =============================================
alter table public.pipelines enable row level security;
alter table public.stages enable row level security;
alter table public.custom_fields enable row level security;
alter table public.deals enable row level security;
alter table public.deal_products enable row level security;
alter table public.deal_activities enable row level security;
alter table public.automation_rules enable row level security;
alter table public.deal_scores enable row level security;

drop policy if exists owner_all_pipelines on public.pipelines;
create policy owner_all_pipelines on public.pipelines
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists owner_all_stages on public.stages;
create policy owner_all_stages on public.stages
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists owner_all_custom_fields on public.custom_fields;
create policy owner_all_custom_fields on public.custom_fields
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists owner_all_deals on public.deals;
create policy owner_all_deals on public.deals
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists owner_all_deal_products on public.deal_products;
create policy owner_all_deal_products on public.deal_products
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists owner_all_deal_activities on public.deal_activities;
create policy owner_all_deal_activities on public.deal_activities
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists owner_all_automation_rules on public.automation_rules;
create policy owner_all_automation_rules on public.automation_rules
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists owner_all_deal_scores on public.deal_scores;
create policy owner_all_deal_scores on public.deal_scores
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
