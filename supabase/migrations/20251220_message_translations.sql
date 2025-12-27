-- Migration: message_translations (cache EN->PT)
-- Data: 2025-12-20

-- Tabela de cache de traduções
create table if not exists public.message_translations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  source_lang text,
  target_lang text not null default 'pt-BR',
  provider text not null default 'gemini',
  model text,
  translated_text text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índice único para evitar duplicatas
create unique index if not exists message_translations_message_target_uniq
  on public.message_translations(message_id, target_lang);

-- Trigger para updated_at
drop trigger if exists set_updated_at_message_translations on public.message_translations;
create trigger set_updated_at_message_translations
before update on public.message_translations
for each row execute procedure public.tg_set_updated_at();

-- RLS
alter table public.message_translations enable row level security;

drop policy if exists owner_all_message_translations on public.message_translations;
create policy owner_all_message_translations on public.message_translations
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Tabela de prompts (para M6, mas já criamos agora)
create table if not exists public.prompts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  type text not null, -- reply_suggestion, summary, translation, language_detection
  name text not null,
  content text not null,
  is_active boolean not null default true,
  version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists prompts_type_version_uniq
  on public.prompts(owner_id, type, version);

drop trigger if exists set_updated_at_prompts on public.prompts;
create trigger set_updated_at_prompts
before update on public.prompts
for each row execute procedure public.tg_set_updated_at();

alter table public.prompts enable row level security;

drop policy if exists owner_all_prompts on public.prompts;
create policy owner_all_prompts on public.prompts
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
