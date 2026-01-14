-- ============================================================
-- Historico de Conversacao para Planos de Relacionamento
-- Permite refinar blocos e continuar conversa com GLM
-- ============================================================

-- Tabela de historico de conversa
CREATE TABLE IF NOT EXISTS public.plan_conversation_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id uuid NOT NULL REFERENCES public.relationship_plans(id) ON DELETE CASCADE,

    -- Mensagem
    role text NOT NULL,              -- 'system', 'user', 'assistant'
    content text NOT NULL,           -- Conteudo da mensagem

    -- Contexto da etapa
    step text,                       -- 'structure', 'intro', 'block_1', 'block_2', 'summary', 'faq'
    block_id text,                   -- ID do bloco (para deepening)

    -- Tokens estimados (para compactacao)
    tokens_estimate integer,

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT plan_conversation_role_check
        CHECK (role IN ('system', 'user', 'assistant'))
);

-- Indices para consultas eficientes
CREATE INDEX IF NOT EXISTS idx_plan_conv_plan ON public.plan_conversation_history(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_conv_step ON public.plan_conversation_history(step);
CREATE INDEX IF NOT EXISTS idx_plan_conv_created ON public.plan_conversation_history(created_at);

-- RLS
ALTER TABLE public.plan_conversation_history ENABLE ROW LEVEL SECURITY;

-- Politicas: herda seguranca do plano pai
CREATE POLICY "Users can view conversation of their plans"
    ON public.plan_conversation_history FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.relationship_plans p
        WHERE p.id = plan_id AND p.owner_id = auth.uid()
    ));

CREATE POLICY "Users can insert conversation to their plans"
    ON public.plan_conversation_history FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.relationship_plans p
        WHERE p.id = plan_id AND p.owner_id = auth.uid()
    ));

CREATE POLICY "Users can delete conversation of their plans"
    ON public.plan_conversation_history FOR DELETE
    USING (EXISTS (
        SELECT 1 FROM public.relationship_plans p
        WHERE p.id = plan_id AND p.owner_id = auth.uid()
    ));

-- Funcao para adicionar mensagem ao historico
CREATE OR REPLACE FUNCTION add_plan_conversation_message(
    p_plan_id uuid,
    p_role text,
    p_content text,
    p_step text DEFAULT NULL,
    p_block_id text DEFAULT NULL,
    p_tokens_estimate integer DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
    v_message_id uuid;
BEGIN
    INSERT INTO public.plan_conversation_history (
        plan_id, role, content, step, block_id, tokens_estimate
    ) VALUES (
        p_plan_id, p_role, p_content, p_step, p_block_id, p_tokens_estimate
    ) RETURNING id INTO v_message_id;

    RETURN v_message_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Funcao para buscar historico de conversa formatado para GLM
CREATE OR REPLACE FUNCTION get_plan_conversation_for_glm(
    p_plan_id uuid,
    p_step text DEFAULT NULL
) RETURNS TABLE(
    role text,
    content text
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        h.role,
        h.content
    FROM public.plan_conversation_history h
    WHERE h.plan_id = p_plan_id
        AND (p_step IS NULL OR h.step = p_step)
    ORDER BY h.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Funcao para compactar historico antigo (manter mensagens recentes)
CREATE OR REPLACE FUNCTION compact_plan_conversation(
    p_plan_id uuid,
    p_keep_last_n integer DEFAULT 50
) RETURNS integer AS $$
DECLARE
    v_deleted_count integer;
BEGIN
    -- Mensagens mais recentes sao mantidas
    WITH ranked AS (
        SELECT id
        FROM public.plan_conversation_history
        WHERE plan_id = p_plan_id
        ORDER BY created_at DESC
    )
    DELETE FROM public.plan_conversation_history
    WHERE id IN (SELECT id FROM ranked OFFSET p_keep_last_n);

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
