-- Migration: Tabela de compras (purchases)
-- Armazena compras vindas do Digistore24 e outras plataformas

-- =============================================
-- TABELA PURCHASES
-- =============================================
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,

  -- Dados da compra
  email text not null,
  product_name text not null,
  product_id text,
  order_id text,

  -- Valores
  amount decimal(15,2) not null default 0,
  currency text not null default 'BRL',

  -- Plataforma de origem
  source text not null default 'digistore24',
  source_data jsonb not null default '{}'::jsonb,

  -- Status
  status text not null default 'completed',

  -- Timestamps
  purchased_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================
-- INDICES
-- =============================================
create index if not exists idx_purchases_owner on public.purchases(owner_id);
create index if not exists idx_purchases_workspace on public.purchases(workspace_id);
create index if not exists idx_purchases_contact on public.purchases(contact_id);
create index if not exists idx_purchases_email on public.purchases(email);
create index if not exists idx_purchases_order_id on public.purchases(order_id);
create index if not exists idx_purchases_source on public.purchases(source);

-- =============================================
-- CONSTRAINT COMPOSTA
-- =============================================
-- Constraint composta para evitar duplicatas entre plataformas
ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_order_source_uniq UNIQUE (order_id, source);

-- =============================================
-- RLS POLICIES
-- =============================================
alter table public.purchases enable row level security;

-- Policy para SELECT (frontend pode ler)
DROP POLICY IF EXISTS owner_all_purchases ON public.purchases;
DROP POLICY IF EXISTS owner_select_purchases ON public.purchases;
CREATE POLICY owner_select_purchases ON public.purchases
  FOR SELECT USING (owner_id = auth.uid());

-- Policy para INSERT/UPDATE/DELETE via service_role (backend apenas)
DROP POLICY IF EXISTS service_insert_purchases ON public.purchases;
CREATE POLICY service_insert_purchases ON public.purchases
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS service_update_purchases ON public.purchases;
CREATE POLICY service_update_purchases ON public.purchases
  FOR UPDATE USING (true) WITH CHECK (true);

-- =============================================
-- TRIGGERS
-- =============================================
drop trigger if exists purchases_updated_at on public.purchases;
create trigger purchases_updated_at
  before update on public.purchases
  for each row execute procedure public.handle_updated_at();

-- =============================================
-- COMENTARIOS
-- =============================================
comment on table public.purchases is 'Compras confirmadas de plataformas externas (Digistore24, etc)';
comment on column public.purchases.source is 'Plataforma de origem: digistore24, hotmart, stripe, etc';
comment on column public.purchases.source_data is 'Payload completo do webhook para auditoria';
comment on column public.purchases.order_id is 'ID unico do pedido na plataforma de origem';
