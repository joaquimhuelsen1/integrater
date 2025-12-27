-- Migration: Prompts com versionamento (M6)
-- Tabela principal de prompts
CREATE TABLE IF NOT EXISTS public.prompts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    prompt_type text NOT NULL DEFAULT 'reply_suggestion', -- reply_suggestion, summary, custom
    content text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(owner_id, name)
);

-- Histórico de versões de prompts
CREATE TABLE IF NOT EXISTS public.prompt_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_id uuid NOT NULL REFERENCES public.prompts(id) ON DELETE CASCADE,
    version integer NOT NULL,
    content text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES auth.users(id),
    change_reason text,
    UNIQUE(prompt_id, version)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_prompts_owner ON public.prompts(owner_id);
CREATE INDEX IF NOT EXISTS idx_prompts_type ON public.prompts(prompt_type);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_prompt ON public.prompt_versions(prompt_id);

-- RLS
ALTER TABLE public.prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;

-- Políticas para prompts
CREATE POLICY "Usuários podem ver seus próprios prompts"
    ON public.prompts FOR SELECT
    USING (auth.uid() = owner_id);

CREATE POLICY "Usuários podem criar seus próprios prompts"
    ON public.prompts FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Usuários podem atualizar seus próprios prompts"
    ON public.prompts FOR UPDATE
    USING (auth.uid() = owner_id);

CREATE POLICY "Usuários podem deletar seus próprios prompts"
    ON public.prompts FOR DELETE
    USING (auth.uid() = owner_id);

-- Políticas para prompt_versions
CREATE POLICY "Usuários podem ver versões de seus prompts"
    ON public.prompt_versions FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.prompts p
        WHERE p.id = prompt_id AND p.owner_id = auth.uid()
    ));

CREATE POLICY "Usuários podem criar versões de seus prompts"
    ON public.prompt_versions FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.prompts p
        WHERE p.id = prompt_id AND p.owner_id = auth.uid()
    ));

-- Trigger para auto-incrementar version e salvar histórico
CREATE OR REPLACE FUNCTION save_prompt_version()
RETURNS TRIGGER AS $$
BEGIN
    -- Só incrementa se content mudou
    IF OLD.content IS DISTINCT FROM NEW.content THEN
        -- Incrementa versão
        NEW.version := OLD.version + 1;
        NEW.updated_at := now();

        -- Salva versão anterior no histórico
        INSERT INTO public.prompt_versions (prompt_id, version, content, created_by)
        VALUES (OLD.id, OLD.version, OLD.content, auth.uid());
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_save_prompt_version
    BEFORE UPDATE ON public.prompts
    FOR EACH ROW
    EXECUTE FUNCTION save_prompt_version();

-- Inserir prompts padrão (serão criados por usuário na primeira vez)
-- Os prompts default são inseridos via API quando o usuário acessa pela primeira vez
