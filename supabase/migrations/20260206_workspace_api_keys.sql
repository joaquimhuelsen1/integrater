-- Tabela workspace_api_keys para autenticacao de API keys por workspace
-- Usada pelo broadcast endpoint e integracao com servicos externos

CREATE TABLE IF NOT EXISTS workspace_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    api_key TEXT UNIQUE NOT NULL,
    name TEXT DEFAULT 'default',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices para busca rapida
CREATE INDEX IF NOT EXISTS idx_workspace_api_keys_api_key ON workspace_api_keys(api_key);
CREATE INDEX IF NOT EXISTS idx_workspace_api_keys_workspace ON workspace_api_keys(workspace_id);

-- RLS: apenas service_role acessa (API backend usa service_role)
ALTER TABLE workspace_api_keys ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'workspace_api_keys' AND policyname = 'service_role_all'
    ) THEN
        CREATE POLICY "service_role_all" ON workspace_api_keys
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;
