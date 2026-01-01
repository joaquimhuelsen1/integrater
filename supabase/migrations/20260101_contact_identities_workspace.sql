-- Migration: Adicionar workspace_id em contact_identities
-- Objetivo: Isolar identidades por workspace (cada workspace tem suas próprias identidades)

-- 1. Adicionar coluna workspace_id (nullable inicialmente para permitir migração)
ALTER TABLE contact_identities ADD COLUMN workspace_id UUID REFERENCES workspaces(id);

-- 2. Popular dados existentes baseado nas conversations que usam essa identity
UPDATE contact_identities ci
SET workspace_id = (
  SELECT c.workspace_id
  FROM conversations c
  WHERE c.primary_identity_id = ci.id
  LIMIT 1
)
WHERE ci.workspace_id IS NULL;

-- 3. Para identidades ainda sem workspace (não usadas em conversations),
-- associar ao primeiro workspace do owner
UPDATE contact_identities ci
SET workspace_id = (
  SELECT w.id
  FROM workspaces w
  WHERE w.owner_id = ci.owner_id
  ORDER BY w.created_at
  LIMIT 1
)
WHERE ci.workspace_id IS NULL;

-- 4. Tornar NOT NULL após popular todos os dados
ALTER TABLE contact_identities ALTER COLUMN workspace_id SET NOT NULL;

-- 5. Dropar índice antigo baseado em owner_id + value
-- (se existir - nome pode variar)
DROP INDEX IF EXISTS contact_identities_owner_channel_value_idx;
DROP INDEX IF EXISTS contact_identities_owner_id_value_idx;
DROP INDEX IF EXISTS idx_contact_identities_owner_value;

-- 6. Criar novo índice único por workspace (mesma identity pode existir em workspaces diferentes)
CREATE UNIQUE INDEX contact_identities_workspace_type_value_idx
ON contact_identities(workspace_id, type, value);

-- 7. Índice para busca por workspace
CREATE INDEX contact_identities_workspace_idx ON contact_identities(workspace_id);

-- 8. Atualizar RLS policy para filtrar por workspace
DROP POLICY IF EXISTS "Users can view own identities" ON contact_identities;
DROP POLICY IF EXISTS "Users can insert own identities" ON contact_identities;
DROP POLICY IF EXISTS "Users can update own identities" ON contact_identities;
DROP POLICY IF EXISTS "Users can delete own identities" ON contact_identities;

CREATE POLICY "Users can view identities in their workspaces" ON contact_identities
FOR SELECT USING (
  workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
);

CREATE POLICY "Users can insert identities in their workspaces" ON contact_identities
FOR INSERT WITH CHECK (
  workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
);

CREATE POLICY "Users can update identities in their workspaces" ON contact_identities
FOR UPDATE USING (
  workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
);

CREATE POLICY "Users can delete identities in their workspaces" ON contact_identities
FOR DELETE USING (
  workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
);

-- Comentário explicativo
COMMENT ON COLUMN contact_identities.workspace_id IS
'Workspace ao qual esta identidade pertence. Permite que o mesmo contato externo (ex: telegram user) exista separadamente em cada workspace.';
