-- ============================================
-- Sistema Multi-Workspace
-- ============================================

-- PARTE 1: Tabela de Workspaces
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  icon TEXT DEFAULT 'briefcase',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspaces_owner_idx ON workspaces(owner_id);

-- RLS
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner manages workspaces" ON workspaces;
CREATE POLICY "Owner manages workspaces" ON workspaces
  FOR ALL USING (owner_id = auth.uid());

-- ============================================
-- PARTE 2: Adicionar workspace_id às tabelas
-- ============================================

-- integration_accounts
ALTER TABLE integration_accounts
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- conversations
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- contacts
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- pipelines
ALTER TABLE pipelines
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- sync_history_jobs
ALTER TABLE sync_history_jobs
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- Índices
CREATE INDEX IF NOT EXISTS idx_integration_accounts_workspace ON integration_accounts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_contacts_workspace ON contacts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_pipelines_workspace ON pipelines(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sync_history_jobs_workspace ON sync_history_jobs(workspace_id);

-- ============================================
-- PARTE 3: Migrar dados existentes
-- ============================================

-- Criar workspace default para owners de integration_accounts
INSERT INTO workspaces (owner_id, name, is_default, color)
SELECT DISTINCT owner_id, 'Principal', true, '#3b82f6'
FROM integration_accounts
WHERE owner_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Criar workspace default para owners de pipelines (caso não tenham integration_accounts)
INSERT INTO workspaces (owner_id, name, is_default, color)
SELECT DISTINCT owner_id, 'Principal', true, '#3b82f6'
FROM pipelines
WHERE owner_id IS NOT NULL
  AND owner_id NOT IN (SELECT owner_id FROM workspaces WHERE owner_id IS NOT NULL)
ON CONFLICT DO NOTHING;

-- Criar workspace default para owners de conversations
INSERT INTO workspaces (owner_id, name, is_default, color)
SELECT DISTINCT owner_id, 'Principal', true, '#3b82f6'
FROM conversations
WHERE owner_id IS NOT NULL
  AND owner_id NOT IN (SELECT owner_id FROM workspaces WHERE owner_id IS NOT NULL)
ON CONFLICT DO NOTHING;

-- Criar workspace default para owners de contacts
INSERT INTO workspaces (owner_id, name, is_default, color)
SELECT DISTINCT owner_id, 'Principal', true, '#3b82f6'
FROM contacts
WHERE owner_id IS NOT NULL
  AND owner_id NOT IN (SELECT owner_id FROM workspaces WHERE owner_id IS NOT NULL)
ON CONFLICT DO NOTHING;

-- Associar dados ao workspace default
UPDATE integration_accounts SET workspace_id = (
  SELECT id FROM workspaces
  WHERE workspaces.owner_id = integration_accounts.owner_id AND is_default = true
  LIMIT 1
) WHERE workspace_id IS NULL AND owner_id IS NOT NULL;

UPDATE conversations SET workspace_id = (
  SELECT id FROM workspaces
  WHERE workspaces.owner_id = conversations.owner_id AND is_default = true
  LIMIT 1
) WHERE workspace_id IS NULL AND owner_id IS NOT NULL;

UPDATE contacts SET workspace_id = (
  SELECT id FROM workspaces
  WHERE workspaces.owner_id = contacts.owner_id AND is_default = true
  LIMIT 1
) WHERE workspace_id IS NULL AND owner_id IS NOT NULL;

UPDATE pipelines SET workspace_id = (
  SELECT id FROM workspaces
  WHERE workspaces.owner_id = pipelines.owner_id AND is_default = true
  LIMIT 1
) WHERE workspace_id IS NULL AND owner_id IS NOT NULL;

UPDATE sync_history_jobs SET workspace_id = (
  SELECT ia.workspace_id FROM integration_accounts ia
  WHERE ia.id = sync_history_jobs.integration_account_id
  LIMIT 1
) WHERE workspace_id IS NULL AND integration_account_id IS NOT NULL;

-- ============================================
-- PARTE 4: Tornar NOT NULL (apenas se há dados)
-- ============================================

-- Verificar e setar NOT NULL apenas se não há NULLs restantes
DO $$
BEGIN
  -- integration_accounts
  IF NOT EXISTS (SELECT 1 FROM integration_accounts WHERE workspace_id IS NULL LIMIT 1) THEN
    ALTER TABLE integration_accounts ALTER COLUMN workspace_id SET NOT NULL;
  END IF;

  -- conversations
  IF NOT EXISTS (SELECT 1 FROM conversations WHERE workspace_id IS NULL LIMIT 1) THEN
    ALTER TABLE conversations ALTER COLUMN workspace_id SET NOT NULL;
  END IF;

  -- contacts
  IF NOT EXISTS (SELECT 1 FROM contacts WHERE workspace_id IS NULL LIMIT 1) THEN
    ALTER TABLE contacts ALTER COLUMN workspace_id SET NOT NULL;
  END IF;

  -- pipelines
  IF NOT EXISTS (SELECT 1 FROM pipelines WHERE workspace_id IS NULL LIMIT 1) THEN
    ALTER TABLE pipelines ALTER COLUMN workspace_id SET NOT NULL;
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Algumas colunas não puderam ser NOT NULL: %', SQLERRM;
END $$;

-- ============================================
-- PARTE 5: Trigger para criar workspace default em novo usuário
-- ============================================

CREATE OR REPLACE FUNCTION create_default_workspace()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO workspaces (owner_id, name, is_default, color)
  VALUES (NEW.id, 'Principal', true, '#3b82f6');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_created_workspace ON profiles;
CREATE TRIGGER on_profile_created_workspace
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION create_default_workspace();
