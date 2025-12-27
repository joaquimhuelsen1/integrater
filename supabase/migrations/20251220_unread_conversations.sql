-- Adiciona campo unread_count na tabela conversations
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS unread_count integer DEFAULT 0;

-- Índice para buscar conversas não lidas
CREATE INDEX IF NOT EXISTS idx_conversations_unread ON public.conversations(owner_id, unread_count)
WHERE unread_count > 0;

-- Comentário
COMMENT ON COLUMN public.conversations.unread_count IS 'Número de mensagens não lidas na conversa';

-- Função para incrementar unread_count atomicamente
CREATE OR REPLACE FUNCTION increment_unread(conv_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.conversations
  SET unread_count = COALESCE(unread_count, 0) + 1
  WHERE id = conv_id;
END;
$$;
