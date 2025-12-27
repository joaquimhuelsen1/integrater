-- Migration: Fix Stage Change Activities
-- Remove trigger duplicado e garante que activities de stage_change funcionem corretamente

-- Remove o trigger que estava criando activities duplicadas
-- (o backend já cria a activity manualmente com mais controle)
drop trigger if exists deals_stage_change on public.deals;
drop function if exists public.handle_deal_stage_change();

-- Garante que as colunas from_stage_id e to_stage_id existem e têm os índices corretos
create index if not exists deal_activities_stage_change_idx
  on public.deal_activities(from_stage_id, to_stage_id)
  where activity_type = 'stage_change';
