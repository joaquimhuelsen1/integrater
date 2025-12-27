-- Migration: AI Suggestions & Feedback (M5)
-- Tabelas para sugestões de IA e feedback do usuário

-- Enum para tipo de sugestão
do $$ begin
  create type public.ai_suggestion_type as enum ('reply_suggestion', 'summary', 'tag_suggestion', 'next_step');
exception when duplicate_object then null; end $$;

-- Enum para ação de feedback
do $$ begin
  create type public.ai_feedback_action as enum ('accepted', 'rejected', 'edited');
exception when duplicate_object then null; end $$;

-- Tabela de sugestões de IA
create table if not exists public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  suggestion_type public.ai_suggestion_type not null,
  prompt_used text,
  tokens_in int,
  tokens_out int,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_suggestions_conversation_idx
  on public.ai_suggestions(conversation_id, created_at desc);

-- Tabela de feedback
create table if not exists public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  suggestion_id uuid not null references public.ai_suggestions(id) on delete cascade,
  action public.ai_feedback_action not null,
  final_content text,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.ai_suggestions enable row level security;
alter table public.ai_feedback enable row level security;

drop policy if exists owner_all_ai_suggestions on public.ai_suggestions;
create policy owner_all_ai_suggestions on public.ai_suggestions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists owner_all_ai_feedback on public.ai_feedback;
create policy owner_all_ai_feedback on public.ai_feedback
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
