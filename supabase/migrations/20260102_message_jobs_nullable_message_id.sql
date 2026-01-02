-- Permite message_id NULL para jobs que não são de mensagem (ex: typing)
-- Também adiciona 'typing' como action válida

ALTER TABLE public.message_jobs 
    ALTER COLUMN message_id DROP NOT NULL;

-- Atualiza constraint de action para incluir typing
ALTER TABLE public.message_jobs 
    DROP CONSTRAINT IF EXISTS message_jobs_action_check;

ALTER TABLE public.message_jobs 
    ADD CONSTRAINT message_jobs_action_check 
    CHECK (action IN ('edit', 'delete', 'typing'));

-- Remove constraint unique que exige message_id (conflita com NULL)
ALTER TABLE public.message_jobs 
    DROP CONSTRAINT IF EXISTS message_jobs_unique;

-- Cria nova constraint que aceita NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_jobs_unique 
    ON public.message_jobs(message_id, action, status) 
    WHERE message_id IS NOT NULL;
