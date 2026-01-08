# Tasks - Web (Frontend)

Tarefas relacionadas ao frontend Next.js (apps/web).

## Pendentes

#### [WEB-017] Som ao enviar/receber mensagens
**Contexto:** UX estilo Telegram com feedback sonoro
**Milestone:** nenhum
**Próximos passos:**
1. Baixar sons do Telegram (enviar + receber)
2. Criar hook useSound
3. Adicionar toggle nas configurações
4. Integrar no envio e realtime de mensagens

#### [WEB-018] Menu contexto + Copiar conversa
**Contexto:** Click direito na mensagem para copiar, botão para copiar conversa inteira
**Milestone:** nenhum
**Próximos passos:**
1. Menu contexto na mensagem (copiar texto)
2. Botão "Copiar conversa" no menu do header
3. Formato: "Eu: msg (data hora)" / "Aluno: msg (data hora)"
4. Idioma original sem tradução

#### [WEB-019] Reações em mensagens (emoji)
**Contexto:** Reagir com emoji igual Telegram (👍❤️🔥😂😮😢👎)
**Milestone:** nenhum
**Próximos passos:**
1. Criar tabela message_reactions no Supabase
2. UI picker com 7 emojis ao hover/click
3. 1 reação por pessoa por mensagem
4. Exibir reações abaixo da mensagem

#### [WEB-020] Indicador "digitando" roxo com animação
**Contexto:** Melhorar visual do indicador de digitação
**Milestone:** nenhum
**Próximos passos:**
1. Trocar cor para roxo (#8B5CF6)
2. Animação 3 pontinhos pulsando

#### [WEB-021] Templates editáveis com placeholders
**Contexto:** UI para criar/editar templates com variáveis
**Milestone:** nenhum
**Próximos passos:**
1. UI CRUD de templates (criar, editar, deletar)
2. Placeholders: {nome}, {primeiro_nome}, {canal}
3. Lista simples sem categorias

## Em Andamento

<!-- Tarefas sendo trabalhadas -->

## Concluídas

#### [WEB-016] Menu de contexto e fixar conversas (Pin) ✅
**Data:** 2025-12-27
**Resultado:** Right-click nas conversas abre menu estilo Telegram com opção de fixar
**Funcionalidades:**
- Menu de contexto (right-click) em cada conversa
- Opção "Fixar" / "Desafixar" conversa
- Opção "Marcar como lida" / "Marcar como não lida"
- Conversas fixadas aparecem no topo da lista
- Indicador visual de pin (ícone 📌 roxo)
- Background levemente roxo nas conversas fixadas
- Persistência no localStorage (não precisa de migration)
**Arquivos:**
- `apps/web/src/components/inbox/conversation-item.tsx` - menu de contexto, indicador pin
- `apps/web/src/components/inbox/conversation-list.tsx` - props para pin
- `apps/web/src/components/inbox-view.tsx` - lógica de pin, localStorage, ordenação

#### [WEB-015] Busca de conversas no banco de dados ✅
**Data:** 2025-12-27
**Resultado:** Busca agora pesquisa em toda a base de dados, não apenas nas 50 carregadas
**Funcionalidades:**
- Busca em `contacts.display_name` com ilike
- Busca em `contact_identities.value` (email, telefone, username)
- Debounce de 300ms para evitar muitas requisições
- Limite de 200 resultados quando buscando (vs 50 normal)
- Preserva searchQuery após operações (markAsRead, send, realtime)
**Arquivos:**
- `apps/web/src/components/inbox-view.tsx` - loadConversations com busca no banco

#### [WEB-014] Timeline unificada para contatos com múltiplos canais ✅
**Data:** 2025-12-27
**Resultado:** Ao selecionar conversa com contato, exibe mensagens de TODOS os canais
**Funcionalidades:**
- Aba "Geral" renomeada para "Contatos" com ícone de usuários
- Ao selecionar conversa com contact_id, carrega msgs de TODAS conversas do contato
- Timeline unificada: mensagens de TODOS os canais em ordem cronológica
- Indicador de canal em cada mensagem (ícone Telegram/Email/SMS)
- Dropdown no Composer para escolher canal de envio (quando há múltiplos)
- Envio direcionado: mensagem vai para a conversa do canal selecionado
- Realtime atualiza mensagens de qualquer conversa do contato
**Arquivos:**
- `apps/web/src/components/inbox/channel-tabs.tsx` - "Geral" → "Contatos"
- `apps/web/src/components/inbox/message-item.tsx` - indicador de canal existente
- `apps/web/src/components/inbox/composer.tsx` - dropdown seletor de canal
- `apps/web/src/components/inbox/chat-view.tsx` - props showChannelIndicator + channel selector
- `apps/web/src/components/inbox-view.tsx` - loadContactMessages, handleSendMessage multicanal

#### [WEB-013] Avatar no header e margens nas mensagens ✅
**Data:** 2025-12-27
**Resultado:** UI de chat mais similar ao Telegram com avatar e mensagens centralizadas
**Funcionalidades:**
- Avatar com iniciais do contato no header (círculo roxo/azul gradiente)
- Margens horizontais responsivas nas mensagens (md:px-12 lg:px-20)
- Container de mensagens limitado a max-w-3xl para centralizar
**Arquivos:**
- `apps/web/src/components/inbox/chat-view.tsx` - avatar header + padding mensagens

#### [WEB-012] Menu hamburger estilo Telegram ✅
**Data:** 2025-12-27
**Resultado:** Menu lateral slide-out estilo Telegram com todas as opções
**Funcionalidades:**
- Botão hamburger (≡) no header da sidebar
- Menu slide-out da esquerda com overlay escuro
- Header roxo/azul gradiente com avatar (iniciais) e email do usuário
- "Filtrar por Tags" com submenu expansível (lista de tags com cores)
- Links: CRM (verde), Contatos (azul), Logs (roxo), Configurações (cinza)
- Botão Sair (vermelho)
- Fecha ao clicar no overlay ou no X
- Header mais limpo: apenas ≡ Inbox, workspace selector e theme toggle
**Arquivos:**
- `apps/web/src/components/sidebar-menu.tsx` - novo componente do menu
- `apps/web/src/components/inbox-view.tsx` - integração do SidebarMenu, removido footer

#### [WEB-011] Exclusão de tags e filtro por tags ✅
**Data:** 2025-12-27
**Resultado:** Usuário pode excluir tags e filtrar conversas por tags na sidebar
**Funcionalidades:**
- Botão de excluir tag (lixeira vermelha) ao lado de cada tag no TagManager
- Confirmação antes de excluir tag (remove de todas as conversas)
- Novo componente TagFilter na sidebar
- Dropdown com lista de tags disponíveis (cores + nomes)
- Seleção múltipla de tags (checkbox estilo)
- Botão X para limpar filtros
- Estilo azul quando filtro ativo
- Filtra conversas que têm TODAS as tags selecionadas
**Arquivos:**
- `apps/web/src/components/inbox/tag-manager.tsx` - função deleteTag + botão excluir
- `apps/web/src/components/inbox/tag-filter.tsx` - novo componente de filtro
- `apps/web/src/components/inbox/index.ts` - export TagFilter
- `apps/web/src/components/inbox-view.tsx` - estado filterTags + filtro no useMemo

#### [WEB-008] Modo escuro Telegram + Demarcações de dias ✅
**Data:** 2025-12-27
**Resultado:** Tema escuro estilo Telegram com roxo + separadores de data nas mensagens + UX polida
**Funcionalidades:**
- Tema escuro com paleta Telegram (fundo azul escuro, accent roxo)
- Toggle de tema (sol/lua) em todas as páginas
- Persistência em localStorage + detecção preferência do sistema
- Demarcações de dias entre mensagens ("Hoje", "Ontem", data completa)
- Background padrão SVG no chat (estilo Telegram)
- Scrollbar fina 6px (estilo Telegram)
- Message bubbles roxos para enviadas, branco/cinza para recebidas
- Menu 3 pontos com dropdown (Sugerir, Resumir, Tags, CRM, Lida, Sync)
- Botão Traduzir visível separado no header
**Arquivos:**
- `apps/web/src/contexts/theme-context.tsx` - Provider de tema
- `apps/web/src/components/theme-toggle.tsx` - Botão toggle
- `apps/web/src/app/globals.css` - Paleta CSS dark mode, scrollbar, chat-background
- `apps/web/src/app/layout.tsx` - ThemeProvider wrapper
- `apps/web/src/components/inbox/date-divider.tsx` - Divisor de datas
- `apps/web/src/lib/group-messages-by-date.ts` - Função agrupamento
- `apps/web/src/components/inbox/chat-view.tsx` - Divisores, menu dropdown, chat-background
- `apps/web/src/components/inbox/message-item.tsx` - Bubbles roxos rounded-2xl
- `apps/web/src/components/inbox-view.tsx` - Toggle na sidebar
- `apps/web/src/components/crm/crm-view.tsx` - Toggle no header
- `apps/web/src/components/settings-view.tsx` - Toggle no header
- `apps/web/src/components/contacts-view.tsx` - Toggle no header
- `apps/web/src/components/logs-view.tsx` - Toggle no header

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
