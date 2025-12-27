-- Migration: Deal Tags e Files
-- Sistema de tags coloridas e upload de arquivos para deals

-- 1. TAGS
CREATE TABLE IF NOT EXISTS deal_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6b7280',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. RELACAO DEAL <-> TAG (N:N)
CREATE TABLE IF NOT EXISTS deal_tag_assignments (
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  tag_id UUID REFERENCES deal_tags(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (deal_id, tag_id)
);

-- 3. ARQUIVOS
CREATE TABLE IF NOT EXISTS deal_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INT,
  mime_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- INDICES
CREATE INDEX IF NOT EXISTS deal_tags_owner_idx ON deal_tags(owner_id);
CREATE INDEX IF NOT EXISTS deal_tag_assignments_deal_idx ON deal_tag_assignments(deal_id);
CREATE INDEX IF NOT EXISTS deal_tag_assignments_tag_idx ON deal_tag_assignments(tag_id);
CREATE INDEX IF NOT EXISTS deal_files_deal_idx ON deal_files(deal_id);
CREATE INDEX IF NOT EXISTS deal_files_owner_idx ON deal_files(owner_id);

-- RLS
ALTER TABLE deal_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_files ENABLE ROW LEVEL SECURITY;

-- POLICIES - deal_tags
CREATE POLICY "deal_tags_owner_all" ON deal_tags
  FOR ALL USING (owner_id = auth.uid());

-- POLICIES - deal_tag_assignments (via deal ownership)
CREATE POLICY "deal_tag_assignments_owner_select" ON deal_tag_assignments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM deals WHERE deals.id = deal_id AND deals.owner_id = auth.uid())
  );

CREATE POLICY "deal_tag_assignments_owner_insert" ON deal_tag_assignments
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM deals WHERE deals.id = deal_id AND deals.owner_id = auth.uid())
  );

CREATE POLICY "deal_tag_assignments_owner_delete" ON deal_tag_assignments
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM deals WHERE deals.id = deal_id AND deals.owner_id = auth.uid())
  );

-- POLICIES - deal_files
CREATE POLICY "deal_files_owner_all" ON deal_files
  FOR ALL USING (owner_id = auth.uid());

-- STORAGE BUCKET para arquivos (executar manualmente no Supabase Dashboard se necessario)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('deal-files', 'deal-files', false);
