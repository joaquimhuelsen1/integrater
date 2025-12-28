-- Permite múltiplas conversas (de canais diferentes) vinculadas ao mesmo contato
-- Remove constraint única (owner_id, contact_id)

ALTER TABLE public.conversations
DROP CONSTRAINT IF EXISTS conversations_owner_contact_uniq;

-- Adiciona constraint única por canal (1 contato = 1 conversa por canal)
ALTER TABLE public.conversations
ADD CONSTRAINT conversations_owner_contact_channel_uniq UNIQUE (owner_id, contact_id, last_channel);
