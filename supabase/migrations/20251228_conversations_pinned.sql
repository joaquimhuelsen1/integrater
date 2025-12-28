-- Adiciona campo is_pinned para persistir conversas fixadas
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;

-- Índice para buscar conversas fixadas primeiro
CREATE INDEX IF NOT EXISTS idx_conversations_pinned ON public.conversations(owner_id, is_pinned)
WHERE is_pinned = true;

-- Comentário
COMMENT ON COLUMN public.conversations.is_pinned IS 'Se a conversa está fixada pelo usuário';
