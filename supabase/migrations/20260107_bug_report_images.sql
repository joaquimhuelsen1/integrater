-- Migration: Tabela bug_report_images
-- Armazena imagens/screenshots anexadas aos bug reports

-- Cria bucket para screenshots (se não existir)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'bug-reports',
    'bug-reports',
    false,
    10485760, -- 10MB
    ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Policy para bucket: usuario pode ler/escrever suas proprias imagens
CREATE POLICY "bug_reports_bucket_owner_select" ON storage.objects
    FOR SELECT USING (bucket_id = 'bug-reports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "bug_reports_bucket_owner_insert" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'bug-reports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "bug_reports_bucket_owner_delete" ON storage.objects
    FOR DELETE USING (bucket_id = 'bug-reports' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Tabela de imagens
CREATE TABLE IF NOT EXISTS bug_report_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bug_report_id UUID NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'image/png',
    file_size INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_bug_report_images_bug ON bug_report_images(bug_report_id);
CREATE INDEX IF NOT EXISTS idx_bug_report_images_owner ON bug_report_images(owner_id);

-- RLS
ALTER TABLE bug_report_images ENABLE ROW LEVEL SECURITY;

-- Policy: usuario so ve/edita suas proprias imagens
CREATE POLICY "bug_report_images_owner_all" ON bug_report_images
    FOR ALL
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

-- Comentarios
COMMENT ON TABLE bug_report_images IS 'Screenshots/imagens anexadas aos bug reports';
COMMENT ON COLUMN bug_report_images.storage_path IS 'Caminho no Supabase Storage bucket bug-reports';
