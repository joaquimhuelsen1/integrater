-- Tabela para jobs de edição/deleção de mensagens
-- O worker processa esses jobs para editar/deletar no canal externo (Telegram, etc)

CREATE TABLE IF NOT EXISTS public.message_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    integration_account_id UUID REFERENCES public.integration_accounts(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('edit', 'delete')),
    payload JSONB DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,

    -- Evita jobs duplicados para a mesma mensagem/ação
    CONSTRAINT message_jobs_unique UNIQUE (message_id, action, status)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_message_jobs_status ON public.message_jobs(status);
CREATE INDEX IF NOT EXISTS idx_message_jobs_owner ON public.message_jobs(owner_id);
CREATE INDEX IF NOT EXISTS idx_message_jobs_message ON public.message_jobs(message_id);

-- RLS
ALTER TABLE public.message_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own message jobs"
    ON public.message_jobs FOR SELECT
    USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own message jobs"
    ON public.message_jobs FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

-- Service role pode fazer tudo (worker usa service role)
CREATE POLICY "Service role full access"
    ON public.message_jobs FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Também adiciona coluna edited_at e deleted_at na tabela messages se não existir
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
