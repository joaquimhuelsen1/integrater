-- Add subject column for email templates
ALTER TABLE templates ADD COLUMN subject TEXT;
COMMENT ON COLUMN templates.subject IS 'Assunto do email (apenas para channel_hint = email)';
