-- Adiciona campo archived_at para arquivar conversas
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Index para filtrar conversas não arquivadas rapidamente
CREATE INDEX IF NOT EXISTS idx_conversations_archived_at ON conversations (archived_at) WHERE archived_at IS NULL;
