-- Adiciona valor telegram-global ao enum worker_type
-- Corrige erro: 'invalid input value for enum worker_type: "telegram-global"'
ALTER TYPE worker_type ADD VALUE IF NOT EXISTS 'telegram-global';
