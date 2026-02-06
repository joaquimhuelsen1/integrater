-- Tabela para armazenar historico de broadcasts enviados
CREATE TABLE IF NOT EXISTS broadcast_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    channel_id TEXT NOT NULL,
    account_id UUID NOT NULL REFERENCES integration_accounts(id),
    text TEXT,
    image_url TEXT,
    telegram_msg_id BIGINT,
    status TEXT NOT NULL DEFAULT 'sent',
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_messages_workspace ON broadcast_messages(workspace_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_created ON broadcast_messages(created_at DESC);

ALTER TABLE broadcast_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'broadcast_messages' AND policyname = 'service_role_all'
    ) THEN
        CREATE POLICY "service_role_all" ON broadcast_messages
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;
