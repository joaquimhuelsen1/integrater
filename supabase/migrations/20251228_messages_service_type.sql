-- Adiciona campo message_type para diferenciar mensagens normais de mensagens de serviço
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS message_type varchar(50) DEFAULT 'text';

-- Comentário
COMMENT ON COLUMN public.messages.message_type IS 'Tipo da mensagem: text, media, service_join, service_leave, service_pin, etc';

-- Índice para buscar mensagens de serviço
CREATE INDEX IF NOT EXISTS idx_messages_service ON public.messages(conversation_id, message_type)
WHERE message_type LIKE 'service_%';
