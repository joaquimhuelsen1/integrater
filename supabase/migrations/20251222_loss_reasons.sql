-- ============================================
-- Tabela loss_reasons - Motivos de perda de deals
-- ============================================

CREATE TABLE IF NOT EXISTS loss_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#ef4444',
  position INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índice para buscar motivos por owner/pipeline
CREATE INDEX idx_loss_reasons_owner_pipeline ON loss_reasons(owner_id, pipeline_id);

-- RLS
ALTER TABLE loss_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages loss_reasons"
  ON loss_reasons FOR ALL
  USING (owner_id = auth.uid());

-- Adiciona campo loss_reason_id na tabela deals (referência ao motivo predefinido)
ALTER TABLE deals
ADD COLUMN IF NOT EXISTS loss_reason_id UUID REFERENCES loss_reasons(id) ON DELETE SET NULL;

-- Adiciona campo loss_description na tabela deals (descrição livre)
ALTER TABLE deals
ADD COLUMN IF NOT EXISTS loss_description TEXT;

-- Índice para buscar deals por motivo de perda
CREATE INDEX IF NOT EXISTS idx_deals_loss_reason ON deals(loss_reason_id);

-- Inserir motivos padrão para owners existentes
-- (Comentado - serão criados sob demanda ou via UI)
-- INSERT INTO loss_reasons (owner_id, name, description, position)
-- SELECT DISTINCT owner_id, 'Falta de dinheiro', 'Cliente sem orçamento disponível', 1
-- FROM pipelines;
