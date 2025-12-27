-- Storage policies para bucket 'attachments'

-- Permite usuários autenticados fazer upload
INSERT INTO storage.policies (name, bucket_id, operation, definition, check_expression)
VALUES (
  'Allow authenticated uploads',
  'attachments',
  'INSERT',
  'auth.role() = ''authenticated''',
  NULL
) ON CONFLICT DO NOTHING;

-- Permite usuários autenticados lerem seus próprios arquivos
INSERT INTO storage.policies (name, bucket_id, operation, definition, check_expression)
VALUES (
  'Allow authenticated reads',
  'attachments',
  'SELECT',
  'auth.role() = ''authenticated''',
  NULL
) ON CONFLICT DO NOTHING;

-- Ou via SQL padrão do Supabase:
-- (Execute no SQL Editor do Supabase Dashboard)

-- 1. Criar bucket se não existir
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Policy para INSERT (upload)
CREATE POLICY "Users can upload attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'attachments');

-- 3. Policy para SELECT (download/view)
CREATE POLICY "Users can view attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'attachments');

-- 4. Policy para UPDATE
CREATE POLICY "Users can update own attachments"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'attachments');

-- 5. Policy para DELETE
CREATE POLICY "Users can delete own attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'attachments');
