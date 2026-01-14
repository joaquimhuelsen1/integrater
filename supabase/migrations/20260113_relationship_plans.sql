-- ============================================================
-- Sistema de Planos de Relacionamento com IA
-- ============================================================

-- Tabela de Planos gerados
CREATE TABLE IF NOT EXISTS public.relationship_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

    -- Inputs
    form_data jsonb NOT NULL DEFAULT '{}',           -- Respostas do formulario
    conversation_context text,                       -- Conversa extra (texto livre)

    -- Status
    status text NOT NULL DEFAULT 'draft',
    -- Valores: draft, generating_structure, generating_intro,
    --          deepening_blocks, generating_summary, completed, error

    -- Outputs gerados
    structure jsonb,                                 -- Estrutura de blocos (titulo + descricao breve)
    introduction text,                               -- Introducao do plano
    deepened_blocks jsonb DEFAULT '{}',              -- Blocos aprofundados {block_id: content}
    summary text,                                    -- Resumo final
    faq jsonb DEFAULT '[]',                          -- FAQ em array de objetos

    -- Metadata de geracao
    model_used text DEFAULT 'glm-4.7',
    generation_started_at timestamptz,
    generation_completed_at timestamptz,
    generation_duration_seconds integer,
    tokens_estimated integer,
    error_message text,

    -- Timestamps padrao
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT relationship_plans_status_check
        CHECK (status IN ('draft', 'generating_structure', 'generating_intro',
                          'deepening_blocks', 'generating_summary', 'completed', 'error'))
);

-- Tabela de System Prompts editaveis para planos
CREATE TABLE IF NOT EXISTS public.plan_prompts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

    name text NOT NULL,
    description text,
    prompt_type text NOT NULL DEFAULT 'plan_system',
    -- Valores: plan_system, structure_context, intro_context, block_deepen, summary_context

    content text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    version integer NOT NULL DEFAULT 1,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    UNIQUE(owner_id, workspace_id, name)
);

-- Historico de versoes de prompts de planos
CREATE TABLE IF NOT EXISTS public.plan_prompt_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_id uuid NOT NULL REFERENCES public.plan_prompts(id) ON DELETE CASCADE,
    version integer NOT NULL,
    content text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES auth.users(id),
    change_reason text,
    UNIQUE(prompt_id, version)
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_relationship_plans_owner ON public.relationship_plans(owner_id);
CREATE INDEX IF NOT EXISTS idx_relationship_plans_workspace ON public.relationship_plans(workspace_id);
CREATE INDEX IF NOT EXISTS idx_relationship_plans_status ON public.relationship_plans(status);
CREATE INDEX IF NOT EXISTS idx_relationship_plans_created ON public.relationship_plans(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plan_prompts_owner ON public.plan_prompts(owner_id);
CREATE INDEX IF NOT EXISTS idx_plan_prompts_workspace ON public.plan_prompts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_plan_prompts_type ON public.plan_prompts(prompt_type);

CREATE INDEX IF NOT EXISTS idx_plan_prompt_versions_prompt ON public.plan_prompt_versions(prompt_id);

-- RLS
ALTER TABLE public.relationship_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_prompt_versions ENABLE ROW LEVEL SECURITY;

-- Politicas: relationship_plans
CREATE POLICY "Users can view their own plans"
    ON public.relationship_plans FOR SELECT
    USING (auth.uid() = owner_id);

CREATE POLICY "Users can create their own plans"
    ON public.relationship_plans FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own plans"
    ON public.relationship_plans FOR UPDATE
    USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own plans"
    ON public.relationship_plans FOR DELETE
    USING (auth.uid() = owner_id);

-- Politicas: plan_prompts
CREATE POLICY "Users can view their workspace prompts"
    ON public.plan_prompts FOR SELECT
    USING (auth.uid() = owner_id);

CREATE POLICY "Users can create their workspace prompts"
    ON public.plan_prompts FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their workspace prompts"
    ON public.plan_prompts FOR UPDATE
    USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their workspace prompts"
    ON public.plan_prompts FOR DELETE
    USING (auth.uid() = owner_id);

-- Politicas: plan_prompt_versions (read-only via parent)
CREATE POLICY "Users can view versions of their prompts"
    ON public.plan_prompt_versions FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.plan_prompts p
        WHERE p.id = prompt_id AND p.owner_id = auth.uid()
    ));

-- Trigger: updated_at para relationship_plans
CREATE TRIGGER trigger_relationship_plans_updated_at
    BEFORE UPDATE ON public.relationship_plans
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_at();

-- Trigger: versionamento de plan_prompts
CREATE OR REPLACE FUNCTION save_plan_prompt_version()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.content IS DISTINCT FROM NEW.content THEN
        NEW.version := OLD.version + 1;
        NEW.updated_at := now();

        INSERT INTO public.plan_prompt_versions (prompt_id, version, content, created_by)
        VALUES (OLD.id, OLD.version, OLD.content, auth.uid());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_save_plan_prompt_version
    BEFORE UPDATE ON public.plan_prompts
    FOR EACH ROW
    EXECUTE FUNCTION save_plan_prompt_version();
