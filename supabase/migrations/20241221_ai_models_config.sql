-- Tabela de modelos de IA disponíveis
CREATE TABLE IF NOT EXISTS ai_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'google',
    model_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(owner_id, model_id)
);

-- Tabela de configuração de função → modelo
CREATE TABLE IF NOT EXISTS ai_function_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id TEXT NOT NULL,
    function_key TEXT NOT NULL,
    model_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(owner_id, function_key)
);

-- RLS
ALTER TABLE ai_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_function_config ENABLE ROW LEVEL SECURITY;

-- Policies para ai_models
CREATE POLICY "ai_models_select" ON ai_models FOR SELECT USING (true);
CREATE POLICY "ai_models_insert" ON ai_models FOR INSERT WITH CHECK (true);
CREATE POLICY "ai_models_update" ON ai_models FOR UPDATE USING (true);
CREATE POLICY "ai_models_delete" ON ai_models FOR DELETE USING (true);

-- Policies para ai_function_config
CREATE POLICY "ai_function_config_select" ON ai_function_config FOR SELECT USING (true);
CREATE POLICY "ai_function_config_insert" ON ai_function_config FOR INSERT WITH CHECK (true);
CREATE POLICY "ai_function_config_update" ON ai_function_config FOR UPDATE USING (true);
CREATE POLICY "ai_function_config_delete" ON ai_function_config FOR DELETE USING (true);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_models_updated_at
    BEFORE UPDATE ON ai_models
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER ai_function_config_updated_at
    BEFORE UPDATE ON ai_function_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
