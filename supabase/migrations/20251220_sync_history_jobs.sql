-- Tabela para jobs de sincronização de histórico
CREATE TABLE IF NOT EXISTS public.sync_history_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    integration_account_id uuid REFERENCES public.integration_accounts(id) ON DELETE SET NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    limit_messages integer DEFAULT 100,
    error_message text,
    created_at timestamptz DEFAULT now(),
    processed_at timestamptz,
    messages_synced integer DEFAULT 0
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_sync_jobs_pending ON public.sync_history_jobs(status, created_at)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_sync_jobs_owner ON public.sync_history_jobs(owner_id);

-- RLS
ALTER TABLE public.sync_history_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sync jobs" ON public.sync_history_jobs
    FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own sync jobs" ON public.sync_history_jobs
    FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Comentário
COMMENT ON TABLE public.sync_history_jobs IS 'Jobs para sincronizar histórico de mensagens de conversas';
