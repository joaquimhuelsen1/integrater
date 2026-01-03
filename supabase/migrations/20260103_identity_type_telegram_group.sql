-- Adiciona telegram_group ao enum identity_type
ALTER TYPE identity_type ADD VALUE IF NOT EXISTS 'telegram_group';
