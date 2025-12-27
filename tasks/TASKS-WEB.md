# Tasks - Web (Frontend)

Tarefas relacionadas ao frontend Next.js (apps/web).

## Pendentes

<!-- Adicionar tarefas pendentes aqui -->

## Em Andamento

<!-- Tarefas sendo trabalhadas -->

## Concluídas

#### [WEB-005] Corrigir handleSendMessage para salvar no banco ✅
**Data:** 2025-12-20
**Resultado:** Mensagens agora são salvas corretamente no Supabase
**Correções:**
- Removidas colunas inexistentes `topic` e `extension` do INSERT
- Implementada busca de `integration_account_id` ativo
- Implementada busca de `identity_id` via primary_identity_id ou contact_identities
- Mensagem salva com owner_id, conversation_id, channel, direction, text, sent_at
**Arquivos:**
- `apps/web/src/components/inbox-view.tsx` - handleSendMessage corrigido

#### [WEB-006] Corrigir duplicação de mensagens ✅
**Data:** 2025-12-20
**Resultado:** Mensagens não duplicam mais ao enviar
**Correção:**
- Handler realtime agora verifica se mensagem já existe antes de adicionar
**Arquivos:**
- `apps/web/src/components/inbox-view.tsx` - realtime handler

#### [WEB-007] Implementar página de configurações Telegram ✅
**Data:** 2025-12-20
**Resultado:** UI completa para auth Telegram (phone → code → 2FA)
**Funcionalidades:**
- Página /settings com lista de contas Telegram
- Modal de auth com 3 passos (telefone, código, 2FA)
- Status online/offline dos workers
- Botão de remover conta
**Arquivos:**
- `apps/web/src/app/settings/page.tsx` - página settings
- `apps/web/src/components/settings-view.tsx` - view principal
- `apps/web/src/components/telegram-auth-flow.tsx` - modal de auth
- `apps/web/src/components/inbox-view.tsx` - link para settings

#### [WEB-001] Implementar página de login ✅
**Data:** 2025-12-19
**Resultado:** Login com Supabase Auth, middleware de proteção, dashboard base
**Arquivos:**
- `apps/web/src/app/login/page.tsx` - página de login
- `apps/web/middleware.ts` - proteção de rotas
- `apps/web/src/app/page.tsx` - dashboard após login
- `apps/web/src/components/logout-button.tsx` - botão de logout

#### [WEB-002] Implementar UI Inbox ✅
**Data:** 2025-12-19
**Resultado:** Lista de conversas, chat view, composer, realtime
**Arquivos:**
- `apps/web/src/components/inbox/` - componentes do inbox
- `apps/web/src/components/inbox-view.tsx` - view principal
- Ajustados para estrutura real do DB (last_channel, contact.display_name)

#### [WEB-003] Testar frontend com Playwright ✅
**Data:** 2025-12-19
**Resultado:** Todos testes passaram
**Testes:**
- ✅ Login com credenciais válidas
- ✅ Lista de conversas (seed data)
- ✅ Seleção de conversa
- ✅ Chat view com mensagens
- ✅ Composer (digitação ativa botão)
- ✅ Busca por nome (filtra lista)
- ✅ Logout (redireciona para login)

#### [WEB-004] Implementar anexos, tags e templates ✅
**Data:** 2025-12-19
**Resultado:** M2 Inbox Core concluído (7/7 critérios)
**Funcionalidades:**
- ✅ Upload/download de anexos (composer + message-item)
- ✅ Tags na lista de conversas (coloridas com badges)
- ✅ Templates no composer (dropdown, inserção de texto)
**Arquivos modificados:**
- `apps/web/src/components/inbox/composer.tsx` - upload, templates dropdown
- `apps/web/src/components/inbox/message-item.tsx` - download attachments
- `apps/web/src/components/inbox/chat-view.tsx` - props templates/download
- `apps/web/src/components/inbox/conversation-item.tsx` - badges de tags
- `apps/web/src/components/inbox/conversation-list.tsx` - interface Tag
- `apps/web/src/components/inbox-view.tsx` - load templates, upload/download

#### [WEB-008] Implementar UI IA Assistente (M5) ✅
**Data:** 2025-12-20
**Resultado:** Botões Sugerir/Resumir no chat com cards de resultado
**Funcionalidades:**
- Botão "Sugerir" (roxo) - gera sugestão de resposta em inglês
- Botão "Resumir" (azul) - gera resumo em português
- Card de sugestão com botões Usar/Descartar
- Card de resumo com botão fechar
- Inserção da sugestão no composer ao clicar "Usar"
- Feedback registrado (accepted/rejected) ao usar/descartar
**Arquivos:**
- `apps/web/src/components/inbox/chat-view.tsx` - botões e cards de IA
- `apps/web/src/components/inbox/composer.tsx` - props initialText/onTextChange

#### [WEB-009] Suporte a mídia e drag-drop ✅
**Data:** 2025-12-20
**Resultado:** Envio/recebimento de áudio, imagens, PDFs via Telegram
**Funcionalidades:**
- Player de áudio com play/pause e barra de progresso
- Gravação de áudio com MediaRecorder API
- Drag and drop de arquivos no chat
- Preview de anexos com ícones por tipo (PDF vermelho, áudio roxo, imagem azul)
- Expandir imagem em fullscreen
- Inferência de mime_type pela extensão (para arquivos do celular)
**Arquivos:**
- `apps/web/src/components/inbox/message-item.tsx` - player áudio, preview imagens
- `apps/web/src/components/inbox/composer.tsx` - gravação, preview anexos
- `apps/web/src/components/inbox/chat-view.tsx` - drag and drop
- `apps/web/src/components/inbox-view.tsx` - inferMimeType helper

#### [WEB-010] Conversas não lidas e sync histórico ✅
**Data:** 2025-12-20
**Resultado:** Badge não lido, marcar como lida, sync de histórico
**Funcionalidades:**
- Badge azul com contador de mensagens não lidas
- Botão marcar como lida/não lida no header
- Auto-marca como lida ao selecionar conversa
- Botão "Sync histórico" (verde) para recuperar mensagens antigas
**Arquivos:**
- `apps/web/src/components/inbox/conversation-item.tsx` - badge unread
- `apps/web/src/components/inbox/chat-view.tsx` - botões marcar lida e sync
- `apps/web/src/components/inbox-view.tsx` - markAsRead, markAsUnread, syncHistory
