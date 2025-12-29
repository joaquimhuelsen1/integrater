-- Tabela para status de presença (typing, online, last_seen)
-- Worker Telegram atualiza essa tabela em tempo real

CREATE TABLE IF NOT EXISTS public.presence_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    contact_identity_id UUID REFERENCES public.contact_identities(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    is_typing BOOLEAN DEFAULT FALSE,
    is_online BOOLEAN DEFAULT FALSE,
    last_seen_at TIMESTAMPTZ,
    typing_expires_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Uma entrada por owner/identity
    CONSTRAINT presence_status_unique UNIQUE (owner_id, contact_identity_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_presence_status_owner ON public.presence_status(owner_id);
CREATE INDEX IF NOT EXISTS idx_presence_status_conversation ON public.presence_status(conversation_id);
CREATE INDEX IF NOT EXISTS idx_presence_status_identity ON public.presence_status(contact_identity_id);

-- RLS
ALTER TABLE public.presence_status ENABLE ROW LEVEL SECURITY;

-- Usuários podem ver seu próprio status
CREATE POLICY "Users can view own presence status"
    ON public.presence_status FOR SELECT
    USING (auth.uid() = owner_id);

-- Service role pode fazer tudo (worker usa service role)
CREATE POLICY "Service role full access on presence"
    ON public.presence_status FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Habilita realtime para esta tabela
ALTER PUBLICATION supabase_realtime ADD TABLE public.presence_status;
