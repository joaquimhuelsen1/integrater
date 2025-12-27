-- Seed de dados para desenvolvimento/teste
-- Owner ID: 5841c750-35c9-47e3-87fe-ebfb2157122a
-- Executar apenas uma vez

-- Primeiro criar profile se não existir
INSERT INTO profiles (id)
VALUES ('5841c750-35c9-47e3-87fe-ebfb2157122a')
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  v_owner_id uuid := '5841c750-35c9-47e3-87fe-ebfb2157122a';
  v_contact1_id uuid := gen_random_uuid();
  v_contact2_id uuid := gen_random_uuid();
  v_conv1_id uuid := gen_random_uuid();
  v_conv2_id uuid := gen_random_uuid();
  v_identity1_id uuid := gen_random_uuid();
  v_identity2_id uuid := gen_random_uuid();
  v_tag1_id uuid := gen_random_uuid();
  v_tag2_id uuid := gen_random_uuid();
  v_integ_tg_id uuid := gen_random_uuid();
  v_integ_email_id uuid := gen_random_uuid();
BEGIN

-- Integration Accounts
INSERT INTO integration_accounts (id, owner_id, type, label, is_active) VALUES
  (v_integ_tg_id, v_owner_id, 'telegram_user', 'Telegram Principal', true),
  (v_integ_email_id, v_owner_id, 'email_imap_smtp', 'Email Comercial', true);

-- Tags
INSERT INTO tags (id, owner_id, name, color) VALUES
  (v_tag1_id, v_owner_id, 'Lead Quente', '#ef4444'),
  (v_tag2_id, v_owner_id, 'Follow-up', '#f59e0b');

-- Contatos (display_name, lead_stage)
INSERT INTO contacts (id, owner_id, display_name, lead_stage) VALUES
  (v_contact1_id, v_owner_id, 'John Smith', 'lead'),
  (v_contact2_id, v_owner_id, 'Maria Garcia', 'qualified');

-- Identidades (type: telegram_user | email | phone, value)
INSERT INTO contact_identities (id, owner_id, contact_id, type, value) VALUES
  (v_identity1_id, v_owner_id, v_contact1_id, 'telegram_user', '@johnsmith'),
  (v_identity2_id, v_owner_id, v_contact2_id, 'email', 'maria@techsolutions.com');

-- Conversas (primary_identity_id, last_channel)
INSERT INTO conversations (id, owner_id, contact_id, primary_identity_id, status, last_message_at, last_channel) VALUES
  (v_conv1_id, v_owner_id, v_contact1_id, v_identity1_id, 'open', now() - interval '5 minutes', 'telegram'),
  (v_conv2_id, v_owner_id, v_contact2_id, v_identity2_id, 'pending', now() - interval '2 hours', 'email');

-- Conversation Tags
INSERT INTO conversation_tags (owner_id, conversation_id, tag_id) VALUES
  (v_owner_id, v_conv1_id, v_tag1_id),
  (v_owner_id, v_conv2_id, v_tag2_id);

-- Mensagens (requer integration_account_id, external_message_id)
INSERT INTO messages (id, owner_id, conversation_id, integration_account_id, identity_id, channel, direction, text, sent_at, external_message_id) VALUES
  (gen_random_uuid(), v_owner_id, v_conv1_id, v_integ_tg_id, v_identity1_id, 'telegram', 'inbound', 'Olá! Vi seu perfil.', now() - interval '1 hour', 'seed_msg_1'),
  (gen_random_uuid(), v_owner_id, v_conv1_id, v_integ_tg_id, v_identity1_id, 'telegram', 'outbound', 'Olá! Como posso ajudar?', now() - interval '55 minutes', 'seed_msg_2'),
  (gen_random_uuid(), v_owner_id, v_conv1_id, v_integ_tg_id, v_identity1_id, 'telegram', 'inbound', 'Podemos agendar uma reunião?', now() - interval '5 minutes', 'seed_msg_3'),
  (gen_random_uuid(), v_owner_id, v_conv2_id, v_integ_email_id, v_identity2_id, 'email', 'inbound', 'Segue proposta em anexo.', now() - interval '2 hours', 'seed_msg_4'),
  (gen_random_uuid(), v_owner_id, v_conv2_id, v_integ_email_id, v_identity2_id, 'email', 'outbound', 'Recebi. Vou analisar.', now() - interval '1 hour', 'seed_msg_5');

-- Templates (title, channel_hint)
INSERT INTO templates (id, owner_id, title, content, channel_hint) VALUES
  (gen_random_uuid(), v_owner_id, 'Boas vindas', 'Olá! Obrigado por entrar em contato.', 'telegram'),
  (gen_random_uuid(), v_owner_id, 'Follow-up', 'Gostaria de saber se analisou nossa proposta.', 'email');

END $$;
