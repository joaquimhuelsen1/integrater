-- Migration: Corrigir constraint de contact_identities

-- 1. Remover constraint restritivo
DROP INDEX IF EXISTS contact_identities_workspace_type_value_idx;

-- 2. Novo indice: permite mesma identity em contatos diferentes
CREATE UNIQUE INDEX contact_identities_contact_type_value_idx
ON contact_identities(contact_id, type, value)
WHERE contact_id IS NOT NULL;

COMMENT ON INDEX contact_identities_contact_type_value_idx IS
'Permite que a mesma identity seja compartilhada entre multiplos contatos.';

-- 3. Constraint para evitar duplicatas de identities órfãs
CREATE UNIQUE INDEX contact_identities_orphan_unique_idx
ON contact_identities (owner_id, type, value_normalized)
WHERE contact_id IS NULL;

COMMENT ON INDEX contact_identities_orphan_unique_idx IS
'Evita duplicatas de identities órfãs por owner. Protege contra race conditions.';
