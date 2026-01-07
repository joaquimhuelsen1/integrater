-- Tabela para armazenar eventos de mensagens (leitura, entrega, etc)
-- Usado para mostrar checkmarks azuis quando lead lê a mensagem

CREATE TABLE IF NOT EXISTS public.message_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    type text NOT NULL, -- 'read', 'delivered', 'failed'
    occurred_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Índice para buscar eventos por mensagem
CREATE INDEX IF NOT EXISTS idx_message_events_message_id ON public.message_events(message_id);

-- Índice para buscar eventos por tipo (ex: todos os 'read')
CREATE INDEX IF NOT EXISTS idx_message_events_type ON public.message_events(type);

-- Índice composto para busca eficiente (usado no polling do frontend)
CREATE INDEX IF NOT EXISTS idx_message_events_message_type ON public.message_events(message_id, type);

-- Comentários
COMMENT ON TABLE public.message_events IS 'Eventos de mensagens (leitura, entrega, falha)';
COMMENT ON COLUMN public.message_events.type IS 'Tipo do evento: read, delivered, failed';
COMMENT ON COLUMN public.message_events.occurred_at IS 'Quando o evento ocorreu (ex: quando lead leu)';
COMMENT ON COLUMN public.message_events.metadata IS 'Dados extras (ex: telegram_user_id que leu)';

-- RLS
ALTER TABLE public.message_events ENABLE ROW LEVEL SECURITY;

-- Policy: usuários podem ver eventos de suas mensagens
CREATE POLICY "Users can view their message events"
ON public.message_events
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.messages m
        JOIN public.conversations c ON m.conversation_id = c.id
        WHERE m.id = message_events.message_id
        AND c.owner_id = auth.uid()
    )
);

-- Policy: service role pode inserir (workers usam service key)
CREATE POLICY "Service role can insert message events"
ON public.message_events
FOR INSERT
WITH CHECK (true);
