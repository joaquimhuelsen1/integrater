-- Tabela para armazenar reações em mensagens
-- Cada usuário pode ter no máximo 1 reação por mensagem

CREATE TABLE IF NOT EXISTS public.message_reactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    emoji text NOT NULL, -- emoji unicode (ex: '👍', '❤️', '🔥')
    created_at timestamptz NOT NULL DEFAULT now(),
    
    -- Garante 1 reação por usuário por mensagem
    CONSTRAINT unique_user_message_reaction UNIQUE (message_id, user_id)
);

-- Índice para buscar reações por mensagem
CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON public.message_reactions(message_id);

-- Índice para buscar reações por usuário
CREATE INDEX IF NOT EXISTS idx_message_reactions_user_id ON public.message_reactions(user_id);

-- Comentários
COMMENT ON TABLE public.message_reactions IS 'Reações de emoji em mensagens';
COMMENT ON COLUMN public.message_reactions.emoji IS 'Emoji unicode da reação';

-- RLS
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Policy: usuários podem ver reações de mensagens de suas conversas
CREATE POLICY "Users can view reactions on their messages"
ON public.message_reactions
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.messages m
        JOIN public.conversations c ON m.conversation_id = c.id
        WHERE m.id = message_reactions.message_id
        AND c.owner_id = auth.uid()
    )
);

-- Policy: usuários podem inserir reações em mensagens de suas conversas
CREATE POLICY "Users can add reactions to their messages"
ON public.message_reactions
FOR INSERT
WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
        SELECT 1 FROM public.messages m
        JOIN public.conversations c ON m.conversation_id = c.id
        WHERE m.id = message_reactions.message_id
        AND c.owner_id = auth.uid()
    )
);

-- Policy: usuários podem deletar suas próprias reações
CREATE POLICY "Users can delete their own reactions"
ON public.message_reactions
FOR DELETE
USING (auth.uid() = user_id);

-- Policy: usuários podem atualizar suas próprias reações (trocar emoji)
CREATE POLICY "Users can update their own reactions"
ON public.message_reactions
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
