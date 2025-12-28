-- Adiciona colunas para sync unificado
-- Worker vai criar identity/conversa usando esses dados

ALTER TABLE public.sync_history_jobs
ADD COLUMN IF NOT EXISTS telegram_id text,
ADD COLUMN IF NOT EXISTS telegram_name text,
ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id),
ADD COLUMN IF NOT EXISTS is_group boolean DEFAULT false;

-- Índice para buscar jobs por telegram_id
CREATE INDEX IF NOT EXISTS idx_sync_jobs_telegram_id
ON public.sync_history_jobs(telegram_id, integration_account_id, status);

COMMENT ON COLUMN public.sync_history_jobs.telegram_id IS 'ID do Telegram para sync (worker cria identity/conversa)';
COMMENT ON COLUMN public.sync_history_jobs.is_group IS 'Se é grupo (Chat/Channel) ou usuário';
