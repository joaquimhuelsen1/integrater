-- Migration: Products Catalog
-- Catálogo de produtos para adicionar aos deals

-- =============================================
-- PRODUCTS (catálogo de produtos)
-- =============================================
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,

  name text not null,
  description text,
  value decimal(15,2) not null default 0,
  sku text,  -- código do produto
  category text,  -- categoria para organização
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_owner_idx
  on public.products(owner_id, is_active);

create index if not exists products_category_idx
  on public.products(owner_id, category);

-- RLS
alter table public.products enable row level security;

create policy "products_owner_all" on public.products
  for all using (owner_id = auth.uid());

-- Trigger para updated_at
create or replace function update_products_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger products_updated_at
  before update on public.products
  for each row execute function update_products_updated_at();

-- Adicionar referência ao produto no deal_products
alter table public.deal_products
  add column if not exists product_id uuid references public.products(id) on delete set null;
