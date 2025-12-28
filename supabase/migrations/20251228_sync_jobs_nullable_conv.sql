-- Permite conversation_id NULL para sync unificado
-- Worker cria a conversa e atualiza depois

ALTER TABLE public.sync_history_jobs
ALTER COLUMN conversation_id DROP NOT NULL;
