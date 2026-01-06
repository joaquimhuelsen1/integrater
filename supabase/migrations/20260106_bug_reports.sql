-- Migration: Tabela bug_reports
-- Sistema de relato de bugs pelo usuario

-- Tabela principal
CREATE TABLE IF NOT EXISTS bug_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    url TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_bug_reports_owner ON bug_reports(owner_id);
CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status);
CREATE INDEX IF NOT EXISTS idx_bug_reports_created ON bug_reports(created_at DESC);

-- RLS
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

-- Policy: usuario so ve/edita seus proprios bugs
CREATE POLICY "bug_reports_owner_all" ON bug_reports
    FOR ALL
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_bug_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    -- Se mudou para resolved, seta resolved_at
    IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
        NEW.resolved_at = now();
    END IF;
    -- Se voltou para open, limpa resolved_at
    IF NEW.status = 'open' AND OLD.status = 'resolved' THEN
        NEW.resolved_at = NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bug_reports_updated_at
    BEFORE UPDATE ON bug_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_bug_reports_updated_at();

-- Comentarios
COMMENT ON TABLE bug_reports IS 'Relatos de bugs pelo usuario';
COMMENT ON COLUMN bug_reports.url IS 'URL da pagina onde o bug foi reportado';
COMMENT ON COLUMN bug_reports.status IS 'open = nao resolvido, resolved = corrigido';
