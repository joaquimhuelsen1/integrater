# PRD — Inbox Multicanal (Telegram + Email IMAP/SMTP + OpenPhone SMS)

**Versão:** 2.0  
**Data:** 2025-12-19  
**Tipo:** Ferramenta interna (single-user)  
**Frontend:** Next.js (TypeScript) + Tailwind + shadcn/ui (Vercel)  
**Backend:** Python (FastAPI) + Workers (Digital Ocean Droplet)  
**DB/Realtime/Storage/Auth:** Supabase  
**IA:** Gemini 3 Flash (tradução) + Gemini 3 Pro (sugestão/resumo)

---

## 0) Objetivo deste documento

Este PRD é o **manual de implementação completo** para vibecoding. Contém:

- Requisitos funcionais e não-funcionais
- Arquitetura detalhada
- Regras de TypeScript (tipagem/contratos)
- Contratos de API (endpoints)
- Plano de execução em milestones (com critérios de aceite)
- SQL da migration inicial do Supabase
- Guias de setup (Telegram, Email, OpenPhone)
- Estratégias de error handling e monitoramento

---

## 1) Visão do produto

Criar uma ferramenta estilo WhatsApp para **centralizar atendimento comercial**, reunindo conversas de:

- **Telegram (principal)** — múltiplas contas user (MTProto) para diferentes experts/produtos
- **Email** — IMAP/SMTP genérico (domínio próprio) com 2+ contas
- **SMS via OpenPhone/Quo** — múltiplos números (sem MMS)

### Diferenciais

- **Inbox unificado** com filtros por canal/tag/status
- **Uma conversa por contato** — histórico único mesmo que o lead fale por canais diferentes
- **Tradução EN→PT** com cache (leads falam inglês)
- **IA assistente** — sugerir resposta e resumir conversa
- **Realtime** — mensagens aparecem instantaneamente
- **Dashboard/IA ready** — schema preparado para analytics futuros

---

## 2) Objetivos do MVP

1. Centralizar conversas de Telegram + Email + SMS em um único Inbox
2. Receber e responder mensagens pelo sistema (outbound)
3. Organizar atendimento com:
   - Tags customizáveis
   - Templates (respostas rápidas)
   - Busca full-text
   - Anexos (upload/download)
   - Status de conversa (open/pending/resolved)
   - Atribuição (pronto para futuro multi-user)
4. Realtime: mensagens entram na UI sem refresh
5. IA assistente:
   - Sugerir resposta (em inglês, para o lead)
   - Resumir conversa (em português, para você)
6. Tradução EN→PT:
   - Detectar idioma automaticamente
   - Traduzir mensagem e/ou conversa inteira
   - Toggle "Original | Português" no chat
7. Gerenciamento de prompts de IA via UI

---

## 3) Não objetivos (fora do escopo)

- Multi-tenant / multi-empresa
- SaaS com cobrança
- Equipe (múltiplos usuários, permissões, auditoria)
- Automações (roteamento, fora do horário), exceto IA assistente
- IA autopilot (IA respondendo sozinha)
- MMS no OpenPhone
- Opt-out/STOP e consentimento formal de SMS

---

## 4) Usuário

- Um único usuário (você)
- Uso diário com poucos leads, conversas longas
- Necessidade crítica: **velocidade**, **contexto centralizado**, **histórico**, **produtividade** e **tradução**

---

## 5) Conceitos e regras do domínio

### 5.1 Contato

Entidade "Lead/Cliente" que pode ter múltiplos identificadores:

- Telegram user id / username
- 1+ emails
- 1+ telefones

### 5.2 Identidade de contato

Cada identificador fica em `contact_identities`:

| type | value | exemplo |
|------|-------|---------|
| `telegram_user` | user_id | `123456789` |
| `email` | endereço | `lead@company.com` |
| `phone` | E.164 | `+14155550123` |

### 5.3 Conversa

- **Uma conversa por contato** (histórico único)
- Mensagens de **qualquer canal** do mesmo contato vão para a **mesma conversa**
- Cada mensagem indica de qual canal veio (`channel` field)
- Não existe "fim de conversa" — conversa é permanente

### 5.4 Regra "Não criar contato automaticamente"

Quando chegar mensagem de identidade desconhecida:

1. Criar **conversa não vinculada** (linked apenas à identity)
2. Você decide na UI:
   - **Criar novo contato** (e vincular)
   - **Vincular a contato existente**
3. Só depois a conversa passa a ser "do contato"

### 5.5 Regra de Merge ao vincular

Quando você vincula uma identidade a um contato que **já tem conversa**:

1. **Mover todas as mensagens** da conversa não vinculada para a conversa do contato
2. **Deletar** a conversa não vinculada (soft delete)
3. **Adicionar** a identity à lista de identities do contato

Isso garante histórico único por contato.

---

## 6) Requisitos funcionais

### FR-01 — Login (Supabase Auth)

**Descrição:** Acesso via Supabase Auth (email/senha), 1 usuário.  
**Aceite:** Sem login não acessa dados; logado consegue usar a ferramenta.

### FR-02 — Inbox (lista + chat)

**Descrição:**

Layout estilo WhatsApp:
- Esquerda: lista de conversas
- Direita: chat + composer

Filtros:
- Canal (Telegram/Email/SMS ou "Todos")
- Status (open/pending/resolved)
- Tag(s)
- Atribuição (assigned_to)
- "Não vinculados" (conversas sem contato)

Ordenação: `last_message_at desc`

Na lista, mostrar:
- Nome do contato (ou identificador se não vinculado)
- Preview da última mensagem
- Timestamp
- Ícone do canal da última mensagem
- Tags (badges)
- Status (badge colorido)

No chat, mostrar:
- Mensagens com indicador de canal (ícone pequeno)
- Horário de cada mensagem
- Anexos inline
- Botão de traduzir (por mensagem e conversa)

**Aceite:** Abrir conversa mostra histórico; lista atualiza em realtime.

### FR-03 — Status da conversa

**Descrição:** Status manual: `open` | `pending` | `resolved`  
**Aceite:** Mudar status atualiza na lista e pode filtrar.

### FR-04 — Atribuição

**Descrição:** Conversa pode ter `assigned_to_profile_id`.  
- No MVP, por padrão atribuído a você
- UI pode ter filtro "Minhas conversas"

**Aceite:** Atribuir/desatribuir salva no DB e filtra.

### FR-05 — Tags

**Descrição:**
- CRUD de tags (nome + cor)
- Aplicar/remover tags em conversas
- Filtrar por tags

**Aceite:** Tag aplicada aparece na lista e nos detalhes; filtro funciona.

### FR-06 — Templates (respostas rápidas)

**Descrição:**
- CRUD de templates
- Inserir template no composer
- Suporte a placeholders: `{nome}`, `{empresa}`

**Aceite:** Selecionar template preenche composer com placeholders substituídos.

### FR-07 — Busca

**Descrição:** Busca por:
- Texto de mensagens (full-text)
- Nome do contato
- Identificador (email/phone/telegram)
- Tags

**Aceite:** Retorna resultados relevantes; não trava.

### FR-08 — Anexos

**Descrição:**
- Upload via Supabase Storage (bucket privado `attachments`)
- Download via signed URLs
- Telegram: receber/enviar mídias (imagens, voz, documentos, stickers)
- Email: anexos inbound/outbound
- SMS: anexos viram **link** (upload + enviar URL no corpo da mensagem)

**Aceite:** Anexos aparecem no chat com preview/download.

### FR-09 — Realtime

**Descrição:** Updates instantâneos na UI para:
- Novas mensagens (`INSERT` em messages)
- Mensagens editadas (`UPDATE` em messages)
- Status de conversa alterado (`UPDATE` em conversations)
- Novo contato criado (`INSERT` em contacts)
- Novas conversas (`INSERT` em conversations)

**Aceite:** Receber msg via worker → UI atualiza sem refresh.

### FR-10 — Integração Telegram (múltiplas contas user)

**Descrição:**
- Suporte a **múltiplas contas** Telegram (diferentes experts/produtos)
- Cadastro de conta via UI (flow de autenticação MTProto)
- Sessão armazenada **criptografada no banco** (não em arquivo)
- Receber DMs (privado): texto, imagens, voz, documentos, stickers
- Enviar mensagens e mídias
- Reply, edit, delete: "best effort"
- Armazenar `raw_payload`

**Setup inicial (por conta):**
1. Usuário insere phone number na UI
2. Backend inicia auth flow (Telethon)
3. Telegram envia código SMS/app
4. Usuário insere código na UI
5. Se tiver 2FA, pedir senha
6. Backend salva session string criptografada em `integration_accounts.secrets_encrypted`

**Aceite:** Enviar/receber pelo sistema funciona; múltiplas contas coexistem.

### FR-11 — Integração Email (IMAP/SMTP genérico)

**Descrição:**
- Conectar 2+ contas IMAP/SMTP (domínio próprio)
- Receber emails via IMAP IDLE (ou poll como fallback)
- Enviar emails via SMTP
- Threading via headers `In-Reply-To` e `References`
- Anexos suportados
- `external_message_id` = `Message-ID` header

**Regra de threading:**
1. Ao receber email, extrair `In-Reply-To` e `References`
2. Buscar mensagem existente com `external_message_id` matching
3. Se encontrar → vincular à mesma conversa
4. Se não encontrar → criar nova conversa (ou vincular a contato pelo email)

**Aceite:** Inbound aparece na conversa correta; outbound chega no destinatário.

### FR-12 — Integração OpenPhone/Quo SMS

**Descrição:**
- Webhook inbound (mensagens recebidas)
- Webhook de delivery status
- Envio outbound via API
- Múltiplos números (2+)
- Anexos → link (upload para Storage, enviar URL)
- Armazenar `raw_payload`

**Aceite:** Inbound/outbound funcionando.

### FR-13 — IA Assistente

**Descrição:**
- "Sugerir resposta" — gera em **inglês** (idioma do lead)
- "Resumir conversa" — gera em **português** (para você)
- IA nunca envia automaticamente
- Contexto: **toda a conversa** (sem limite de mensagens)
- Salvar sugestões em `ai_suggestions`
- Salvar feedback em `ai_feedback` (accepted/rejected/edited)

**Modelo:** Gemini 3 Pro (`gemini-3-pro-preview`)

**Aceite:** Sugestão é gerada, você insere no composer e envia manualmente.

### FR-14 — Tradução EN→PT

**Descrição:**
- **Detectar idioma** antes de traduzir
- Se já for português → não traduzir
- Tradução **não altera** mensagem original
- Tradução por:
  - Mensagem individual
  - Conversa inteira (batch)
- UI: toggle "Ver: Original | Português"
- Cache em `message_translations` por `message_id + target_lang`

**Regras:**
- Preservar links, números, nomes próprios, emails
- Não "explicar": apenas traduzir
- Mensagens sem texto (só anexo): não traduzir

**Modelo:** Gemini 3 Flash (`gemini-3-flash-preview`)

**Aceite:** Com 1 clique traduz e exibe PT-BR; ao recarregar, continua traduzido.

### FR-15 — Gerenciamento de Prompts (UI)

**Descrição:**
- Página dedicada para editar prompts de IA
- Prompts editáveis:
  - Sugestão de resposta
  - Resumo de conversa
  - Tradução
  - Detecção de idioma
- Versionamento automático (histórico)
- Prompt ativo vs. drafts

**Aceite:** Editar prompt na UI reflete imediatamente nas chamadas de IA.

### FR-16 — Logs e eventos brutos

**Descrição:**
- `integration_events`: payload bruto de webhooks/ingest
- `app_logs`: logs com nível e payload

**Aceite:** Ao ocorrer erro, registro aparece e ajuda debug.

### FR-17 — Health Check e Status dos Workers

**Descrição:**
- Endpoint `GET /health` retorna status da API
- Endpoint `GET /health/workers` retorna status de cada worker:
  - Telegram: conectado/desconectado (por conta)
  - Email: conectado/desconectado (por conta)
  - Último heartbeat
- Workers enviam heartbeat periódico para o banco
- UI mostra indicador de status dos workers

**Aceite:** Se worker cair, UI mostra alerta.

### FR-18 — Backup/Export

**Descrição:** Exportar JSON/CSV para Storage sob demanda.  
**Aceite:** Export gera arquivo no bucket e registra em `backup_exports`.

---

## 7) Requisitos não-funcionais

### NFR-01 — Segurança

- Supabase Auth (1 usuário)
- RLS habilitado em todas as tabelas
- Service Role Key somente no backend/workers
- Secrets criptografados com AES-256-GCM
- Chave de criptografia em env var `ENCRYPTION_KEY` (32 bytes base64)
- Secrets nunca vão para o frontend
- Prompts de IA não recebem tokens/segredos

### NFR-02 — Criptografia de Secrets

**Algoritmo:** AES-256-GCM  
**Chave:** `ENCRYPTION_KEY` env var (32 bytes, base64 encoded)  
**Onde:** Apenas backend/workers descriptografam  

**Dados criptografados:**
- Telegram session strings
- Senhas de email IMAP/SMTP
- API keys de integrações

**Implementação:**
```python
# utils/crypto.py
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os, base64

def get_key() -> bytes:
    key_b64 = os.environ["ENCRYPTION_KEY"]
    return base64.b64decode(key_b64)

def encrypt(plaintext: str) -> str:
    key = get_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(nonce + ciphertext).decode()

def decrypt(encrypted: str) -> str:
    key = get_key()
    data = base64.b64decode(encrypted)
    nonce, ciphertext = data[:12], data[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ciphertext, None).decode()
```

### NFR-03 — Consistência e dedupe

- Dedupe por `external_message_id` (+ `external_chat_id` para Telegram)
- Não deletar mensagens: usar `deleted_at` (soft delete)
- Índices únicos garantem idempotência

### NFR-04 — Performance

- Índices para ordenação e busca
- Paginação no chat (cursor-based, 50 msgs por página)
- Realtime via Supabase Realtime (WebSocket)
- Workers com connection pooling

### NFR-05 — Disponibilidade (Workers 24/7)

- Workers rodam como processos supervisados (systemd ou supervisor)
- Reconnect automático com exponential backoff
- Heartbeat a cada 30 segundos
- Alertas se worker offline > 2 minutos

### NFR-06 — "IA/Dashboard ready"

- `messages` é tabela canônica
- `raw_payload` para rastreabilidade
- Timestamps reais (`sent_at`) + timestamps do sistema (`created_at`)
- Schema suporta analytics futuros

---

## 8) Arquitetura

### 8.1 Visão geral

```
┌─────────────────────────────────────────────────────────────────┐
│                         VERCEL                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Next.js Frontend (apps/web)                 │   │
│  │         TypeScript + Tailwind + shadcn/ui                │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DIGITAL OCEAN DROPLET                        │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │  FastAPI (api)   │  │ Telegram Worker  │  │ Email Worker │  │
│  │    Port 8000     │  │   (Telethon)     │  │   (IMAP)     │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
│           │                    │                    │           │
│           └────────────────────┼────────────────────┘           │
│                                ▼                                │
│                    Supabase Client (service role)               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         SUPABASE                                │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐    │
│  │ Postgres│  │Realtime │  │ Storage │  │      Auth       │    │
│  │   + RLS │  │   WS    │  │(private)│  │  (email/senha)  │    │
│  └─────────┘  └─────────┘  └─────────┘  └─────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      EXTERNAL SERVICES                          │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐    │
│  │Telegram │  │  Email  │  │OpenPhone│  │  Google AI      │    │
│  │ MTProto │  │IMAP/SMTP│  │   API   │  │ (Gemini 3)      │    │
│  └─────────┘  └─────────┘  └─────────┘  └─────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Componentes

| Componente | Localização | Tecnologia | Responsabilidade |
|------------|-------------|------------|------------------|
| `apps/web` | Vercel | Next.js 14, TypeScript, Tailwind, shadcn/ui | UI, Auth flow, Realtime subscription |
| `apps/api` | DO Droplet | FastAPI, Python 3.11+ | REST API, IA, Storage signed URLs |
| `apps/workers/telegram` | DO Droplet | Telethon, Python | Receber/enviar Telegram (múltiplas contas) |
| `apps/workers/email` | DO Droplet | imapclient, smtplib, Python | Receber/enviar Email (múltiplas contas) |
| Supabase | Cloud | Postgres, Realtime, Storage, Auth | Persistência, Realtime, Arquivos |

### 8.3 Fluxo de dados

**Inbound (Telegram):**
```
Telegram → Worker (Telethon) → Supabase (insert message) → Realtime → Frontend
```

**Inbound (Email):**
```
Email Server → Worker (IMAP) → Supabase (insert message) → Realtime → Frontend
```

**Inbound (SMS):**
```
OpenPhone → Webhook → API (FastAPI) → Supabase (insert message) → Realtime → Frontend
```

**Outbound (qualquer canal):**
```
Frontend → API (POST /messages/send) → Worker/API envia → Supabase (insert + status)
```

### 8.4 Estratégia de anexos

**Bucket:** `attachments` (privado)

**Upload:**
1. Frontend pede signed URL: `POST /storage/sign-upload`
2. Backend gera URL com service role (expira em 1h)
3. Frontend faz upload direto para Storage

**Download:**
1. Frontend pede signed URL: `POST /storage/sign-download`
2. Backend gera URL (expira em 1h)
3. Frontend exibe/baixa

### 8.5 Realtime Channels

```typescript
// Frontend subscriptions
supabase
  .channel('inbox-realtime')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `owner_id=eq.${userId}`
  }, handleNewMessage)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'messages',
    filter: `owner_id=eq.${userId}`
  }, handleMessageUpdate)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'conversations',
    filter: `owner_id=eq.${userId}`
  }, handleConversationChange)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'contacts',
    filter: `owner_id=eq.${userId}`
  }, handleNewContact)
  .subscribe()
```

---

## 9) Regras de TypeScript

### TS-01 — Strict mode

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitAny": true
  }
}
```

### TS-02 — Proibido `any`

- Proibido `any` em código do app
- Se inevitável, comentar motivo e usar `// eslint-disable-next-line`
- Preferir `unknown` + type guard

### TS-03 — Contratos via OpenAPI

- Backend (FastAPI + Pydantic) é fonte da verdade
- Frontend gera types via `openapi-typescript`:

```bash
npx openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.d.ts
```

- Proibido reinventar types que existem no schema gerado

### TS-04 — Validação de entrada

- Dados externos validados com **Zod**
- Usar `unknown` + parse, nunca `any`

```typescript
import { z } from 'zod';

const MessageSchema = z.object({
  id: z.string().uuid(),
  text: z.string().nullable(),
  channel: z.enum(['telegram', 'email', 'openphone_sms']),
});

type Message = z.infer<typeof MessageSchema>;
```

### TS-05 — Scripts obrigatórios

```json
// package.json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "lint": "eslint . --ext .ts,.tsx",
    "typecheck": "tsc --noEmit"
  }
}
```

CI deve rodar `lint` e `typecheck` antes de deploy.

---

## 10) Contratos de API (FastAPI)

Base URL: `https://api.seudominio.com/v1`

### 10.1 Health

| Method | Path | Descrição |
|--------|------|-----------|
| `GET` | `/health` | Status da API |
| `GET` | `/health/workers` | Status de cada worker |

**Response `/health/workers`:**
```json
{
  "telegram": [
    { "account_id": "uuid", "label": "Expert 1", "status": "connected", "last_heartbeat": "2025-12-19T10:00:00Z" },
    { "account_id": "uuid", "label": "Backup", "status": "disconnected", "last_heartbeat": "2025-12-19T09:55:00Z" }
  ],
  "email": [
    { "account_id": "uuid", "label": "contato@empresa.com", "status": "connected", "last_heartbeat": "2025-12-19T10:00:00Z" }
  ]
}
```

### 10.2 Integrações

| Method | Path | Descrição |
|--------|------|-----------|
| `GET` | `/integrations` | Listar todas |
| `POST` | `/integrations` | Criar nova |
| `GET` | `/integrations/{id}` | Detalhes |
| `PATCH` | `/integrations/{id}` | Atualizar |
| `DELETE` | `/integrations/{id}` | Remover |
| `POST` | `/integrations/{id}/test` | Testar conexão |

**Telegram específico:**

| Method | Path | Descrição |
|--------|------|-----------|
| `POST` | `/integrations/telegram/start-auth` | Iniciar auth (envia código) |
| `POST` | `/integrations/telegram/verify-code` | Verificar código SMS |
| `POST` | `/integrations/telegram/verify-2fa` | Verificar senha 2FA |

### 10.3 Contatos

| Method | Path | Descrição |
|--------|------|-----------|
| `GET` | `/contacts` | Listar (paginado, busca) |
| `POST` | `/contacts` | Criar |
| `GET` | `/contacts/{id}` | Detalhes |
| `PATCH` | `/contacts/{id}` | Atualizar |
| `DELETE` | `/contacts/{id}` | Soft delete |
| `POST` | `/contacts/{id}/link-identity` | Vincular identidade |
| `POST` | `/contacts/{id}/unlink-identity` | Desvincular identidade |

### 10.4 Conversas (Inbox)

| Method | Path | Descrição |
|--------|------|-----------|
| `GET` | `/conversations` | Listar (filtros, paginado) |
| `GET` | `/conversations/{id}` | Detalhes |
| `GET` | `/conversations/{id}/messages` | Mensagens (paginado) |
| `PATCH` | `/conversations/{id}` | Atualizar (status, assigned_to) |
| `POST` | `/conversations/{id}/tags` | Adicionar tag |
| `DELETE` | `/conversations/{id}/tags/{tag_id}` | Remover tag |
| `POST` | `/conversations/{id}/merge` | Merge com outra conversa |

**Query params para `GET /conversations`:**
```
?channel=telegram|email|openphone_sms
&status=open|pending|resolved
&tag_ids=uuid,uuid
&assigned_to=uuid
&unlinked=true
&search=texto
&cursor=uuid
&limit=20
```

### 10.5 Mensagens

| Method | Path | Descrição |
|--------|------|-----------|
| `POST` | `/messages/send` | Enviar (outbound) |
| `GET` | `/messages/{id}` | Detalhes |

**Request `POST /messages/send`:**
```json
{
  "conversation_id": "uuid",
  "channel": "telegram",
  "integration_account_id": "uuid",
  "text": "Hello!",
  "attachments": ["uuid"],
  "reply_to_message_id": "uuid"
}
```

### 10.6 Tags

| Method | Path | Descrição |
|--------|------|-----------|
| `GET` | `/tags` | Listar |
| `POST` | `/tags` | Criar |
| `PATCH` | `/tags/{id}` | Atualizar |
| `DELETE` | `/tags/{id}` | Remover |

### 10.7 Templates

| Method | Path | Descrição |
|--------|------|-----------|
| `GET` | `/templates` | Listar |
| `POST` | `/templates` | Criar |
| `PATCH` | `/templates/{id}` | Atualizar |
| `DELETE` | `/templates/{id}` | Remover |

### 10.8 Storage (Signed URLs)

| Method | Path | Descrição |
|--------|------|-----------|
| `POST` | `/storage/sign-upload` | URL para upload |
| `POST` | `/storage/sign-download` | URL para download |

### 10.9 Tradução

| Method | Path | Descrição |
|--------|------|-----------|
| `POST` | `/translate/message/{message_id}` | Traduzir mensagem |
| `POST` | `/translate/conversation/{conversation_id}` | Traduzir conversa (batch) |
| `GET` | `/translate/message/{message_id}` | Buscar tradução (cache) |

### 10.10 IA

| Method | Path | Descrição |
|--------|------|-----------|
| `POST` | `/ai/suggest-reply` | Sugerir resposta |
| `POST` | `/ai/summarize` | Resumir conversa |
| `POST` | `/ai/feedback` | Registrar feedback |

### 10.11 Prompts (Gerenciamento)

| Method | Path | Descrição |
|--------|------|-----------|
| `GET` | `/prompts` | Listar todos |
| `GET` | `/prompts/{type}` | Buscar por tipo |
| `PATCH` | `/prompts/{type}` | Atualizar (cria nova versão) |
| `GET` | `/prompts/{type}/versions` | Histórico de versões |

**Tipos de prompt:** `reply_suggestion`, `summary`, `translation`, `language_detection`

### 10.12 Webhooks

| Method | Path | Descrição |
|--------|------|-----------|
| `POST` | `/webhooks/openphone` | Webhook OpenPhone (inbound + status) |

### 10.13 Logs e Export

| Method | Path | Descrição |
|--------|------|-----------|
| `GET` | `/logs` | Listar logs (paginado, filtros) |
| `POST` | `/export` | Solicitar export |
| `GET` | `/export/{id}` | Status do export |

---

## 11) Milestones

### Milestone 1 — Bootstrap + Supabase + Auth

**Entregáveis:**
- Repositório estruturado
- Supabase configurado (migration, bucket, auth)
- Frontend com login funcionando
- Backend (FastAPI) rodando com health check

**Critérios de aceite:**
- [ ] Logar e ver UI base
- [ ] DB com tabelas e RLS ativo
- [ ] `GET /health` retorna 200

---

### Milestone 2 — Inbox Core (sem integrações)

**Entregáveis:**
- UI inbox completa (lista + chat + composer)
- CRUD contatos
- CRUD tags
- CRUD templates
- Status de conversa
- Busca
- Anexos via Storage
- "Não vinculados" (criar/vincular contato)
- Realtime funcionando

**Aceite:**
- [ ] Criar contato/conversa/mensagens via seed
- [ ] Navegar sem bugs
- [ ] Busca funciona
- [ ] Realtime atualiza lista

---

### Milestone 3 — Telegram (end-to-end)

**Entregáveis:**
- Flow de auth na UI (phone → code → 2FA)
- Worker Telegram (múltiplas contas)
- Sessão criptografada no banco
- Receber/enviar mensagens + mídias
- Health check de workers

**Aceite:**
- [ ] Cadastrar conta Telegram pela UI
- [ ] Mensagem do Telegram aparece na UI
- [ ] Resposta do sistema chega no Telegram
- [ ] Status do worker visível na UI

---

### Milestone 4 — Tradução EN→PT

**Entregáveis:**
- Detecção de idioma
- Endpoints de tradução
- Cache em `message_translations`
- UI toggle "Original | Português"
- Botão "Traduzir conversa"

**Aceite:**
- [ ] Traduzir e ver PT-BR
- [ ] Recarregar e tradução persiste
- [ ] Mensagem em PT não traduz

---

### Milestone 5 — IA Assistente

**Entregáveis:**
- Sugerir resposta (inglês)
- Resumir (português)
- Salvar `ai_suggestions` e `ai_feedback`
- UI: botões no chat
- Inserir sugestão no composer

**Aceite:**
- [ ] Sugestão útil aparece
- [ ] Feedback gravado
- [ ] Resumo em português

---

### Milestone 6 — Gerenciamento de Prompts

**Entregáveis:**
- Página de prompts na UI
- CRUD via API
- Versionamento automático
- Preview/test de prompt

**Aceite:**
- [ ] Editar prompt reflete na IA
- [ ] Histórico de versões visível

---

### Milestone 7 — OpenPhone SMS

**Entregáveis:**
- Webhook inbound/status
- Envio outbound
- Múltiplos números
- Anexo → link

**Aceite:**
- [ ] Inbound aparece
- [ ] Outbound chega

---

### Milestone 8 — Email IMAP/SMTP

**Entregáveis:**
- Cadastro de contas na UI
- Worker IMAP (idle + poll fallback)
- SMTP send
- Threading por headers
- Anexos

**Aceite:**
- [ ] Inbound aparece na conversa correta
- [ ] Outbound chega

---

### Milestone 9 — Logs + Export + Polish

**Entregáveis:**
- UI de logs
- Export JSON/CSV
- Bug fixes
- Performance tuning

**Aceite:**
- [ ] Logs ajudam debug
- [ ] Export funciona
- [ ] App estável

---

## 12) Estrutura do repositório

```
inbox-multicanal/
├── README.md
├── PRD.md
├── .env.example
├── docker-compose.yml (opcional, para dev local)
│
├── apps/
│   ├── web/                    # Next.js frontend
│   │   ├── src/
│   │   │   ├── app/            # App router
│   │   │   ├── components/     # UI components
│   │   │   ├── lib/            # Utils, supabase client
│   │   │   ├── api/            # Generated types (schema.d.ts)
│   │   │   └── hooks/          # React hooks
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── api/                    # FastAPI backend
│   │   ├── app/
│   │   │   ├── main.py
│   │   │   ├── config.py
│   │   │   ├── deps.py         # Dependencies (supabase, auth)
│   │   │   ├── routers/        # Route handlers
│   │   │   ├── services/       # Business logic
│   │   │   ├── models/         # Pydantic models
│   │   │   └── utils/          # Crypto, helpers
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   │
│   └── workers/                # Background workers
│       ├── telegram/
│       │   ├── worker.py
│       │   ├── handlers.py
│       │   └── requirements.txt
│       ├── email/
│       │   ├── worker.py
│       │   ├── handlers.py
│       │   └── requirements.txt
│       └── shared/
│           ├── db.py           # Supabase client
│           ├── crypto.py       # Encrypt/decrypt
│           └── heartbeat.py    # Worker health
│
├── supabase/
│   └── migrations/
│       └── 0001_init.sql
│
└── scripts/
    ├── generate-types.sh       # Gera schema.d.ts
    └── deploy.sh
```

---

## 13) Variáveis de ambiente

### apps/web/.env.local

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_API_URL=https://api.seudominio.com
```

### apps/api/.env

```bash
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Auth
OWNER_ID=seu-auth-uid-aqui

# Criptografia
ENCRYPTION_KEY=base64-encoded-32-bytes-key

# LLM (Gemini)
GEMINI_API_KEY=AIza...
GEMINI_FLASH_MODEL=gemini-3-flash-preview
GEMINI_PRO_MODEL=gemini-3-pro-preview

# OpenPhone
OPENPHONE_API_KEY=...
OPENPHONE_WEBHOOK_SECRET=...
```

### apps/workers/.env

```bash
# Mesmo do API
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OWNER_ID=seu-auth-uid-aqui
ENCRYPTION_KEY=base64-encoded-32-bytes-key

# Telegram (para criar API credentials)
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=abc123...
```

---

## 14) Setup do Digital Ocean Droplet

### Especificação recomendada

- **Droplet:** Basic, 2 vCPU, 4GB RAM, 80GB SSD (~$24/mês)
- **OS:** Ubuntu 24.04 LTS
- **Região:** NYC ou mais próximo dos seus leads

### Setup inicial

```bash
# 1. Update e dependências
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3.11 python3.11-venv python3-pip nginx certbot python3-certbot-nginx

# 2. Criar usuário app
sudo useradd -m -s /bin/bash appuser
sudo su - appuser

# 3. Clonar repo
git clone https://github.com/seu-usuario/inbox-multicanal.git
cd inbox-multicanal

# 4. Setup API
cd apps/api
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 5. Setup Workers
cd ../workers
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r telegram/requirements.txt -r email/requirements.txt
```

### Systemd services

**/etc/systemd/system/inbox-api.service:**
```ini
[Unit]
Description=Inbox API
After=network.target

[Service]
User=appuser
WorkingDirectory=/home/appuser/inbox-multicanal/apps/api
Environment="PATH=/home/appuser/inbox-multicanal/apps/api/.venv/bin"
EnvironmentFile=/home/appuser/inbox-multicanal/apps/api/.env
ExecStart=/home/appuser/inbox-multicanal/apps/api/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**/etc/systemd/system/inbox-telegram-worker.service:**
```ini
[Unit]
Description=Inbox Telegram Worker
After=network.target

[Service]
User=appuser
WorkingDirectory=/home/appuser/inbox-multicanal/apps/workers
Environment="PATH=/home/appuser/inbox-multicanal/apps/workers/.venv/bin"
EnvironmentFile=/home/appuser/inbox-multicanal/apps/workers/.env
ExecStart=/home/appuser/inbox-multicanal/apps/workers/.venv/bin/python telegram/worker.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**/etc/systemd/system/inbox-email-worker.service:**
```ini
[Unit]
Description=Inbox Email Worker
After=network.target

[Service]
User=appuser
WorkingDirectory=/home/appuser/inbox-multicanal/apps/workers
Environment="PATH=/home/appuser/inbox-multicanal/apps/workers/.venv/bin"
EnvironmentFile=/home/appuser/inbox-multicanal/apps/workers/.env
ExecStart=/home/appuser/inbox-multicanal/apps/workers/.venv/bin/python email/worker.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Ativar serviços
sudo systemctl daemon-reload
sudo systemctl enable inbox-api inbox-telegram-worker inbox-email-worker
sudo systemctl start inbox-api inbox-telegram-worker inbox-email-worker
```

### Nginx config

**/etc/nginx/sites-available/inbox-api:**
```nginx
server {
    listen 80;
    server_name api.seudominio.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/inbox-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d api.seudominio.com
```

---

## 15) Migration SQL

Cole em `supabase/migrations/0001_init.sql`:

```sql
-- =========================================================
-- 0) EXTENSIONS
-- =========================================================
create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_trgm;

-- =========================================================
-- 1) ENUMS
-- =========================================================
do $$ begin
  create type public.channel_type as enum ('telegram', 'email', 'openphone_sms');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.message_direction as enum ('inbound', 'outbound');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.conversation_status as enum ('open', 'pending', 'resolved');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.identity_type as enum ('telegram_user', 'email', 'phone');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.integration_type as enum ('telegram_user', 'email_imap_smtp', 'openphone');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.message_event_type as enum (
    'queued', 'sent', 'delivered', 'read',
    'failed', 'edited', 'deleted'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.log_level as enum ('debug', 'info', 'warn', 'error');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ai_suggestion_type as enum ('reply_suggestion', 'summary', 'tag_suggestion', 'next_step');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ai_feedback_action as enum ('accepted', 'rejected', 'edited');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.prompt_type as enum ('reply_suggestion', 'summary', 'translation', 'language_detection');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.worker_type as enum ('telegram', 'email');
exception when duplicate_object then null; end $$;

-- =========================================================
-- 2) HELPERS
-- =========================================================
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- =========================================================
-- 3) PROFILES (Auth)
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- =========================================================
-- 4) INTEGRATIONS
-- =========================================================
create table if not exists public.integration_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,

  type public.integration_type not null,
  label text not null,

  config jsonb not null default '{}'::jsonb,
  secrets_encrypted text,

  is_active boolean not null default true,
  last_sync_at timestamptz,
  last_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists integration_accounts_owner_type_idx
  on public.integration_accounts(owner_id, type);

drop trigger if exists set_updated_at_integration_accounts on public.integration_accounts;
create trigger set_updated_at_integration_accounts
before update on public.integration_accounts
for each row execute procedure public.tg_set_updated_at();

-- =========================================================
-- 5) WORKER HEARTBEATS
-- =========================================================
create table if not exists public.worker_heartbeats (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  integration_account_id uuid not null references public.integration_accounts(id) on delete cascade,
  
  worker_type public.worker_type not null,
  status text not null default 'unknown',
  last_heartbeat_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  unique(integration_account_id)
);

drop trigger if exists set_updated_at_worker_heartbeats on public.worker_heartbeats;
create trigger set_updated_at_worker_heartbeats
before update on public.worker_heartbeats
for each row execute procedure public.tg_set_updated_at();

-- =========================================================
-- 6) CONTACTS + IDENTITIES
-- =========================================================
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,

  display_name text not null,
  lead_stage text not null default 'new',
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists contacts_owner_updated_idx
  on public.contacts(owner_id, updated_at desc)
  where deleted_at is null;

create index if not exists contacts_name_trgm_idx
  on public.contacts using gin (display_name gin_trgm_ops);

drop trigger if exists set_updated_at_contacts on public.contacts;
create trigger set_updated_at_contacts
before update on public.contacts
for each row execute procedure public.tg_set_updated_at();

create table if not exists public.contact_identities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,

  contact_id uuid references public.contacts(id) on delete set null,

  type public.identity_type not null,
  value text not null,

  value_normalized text generated always as (
    case
      when type = 'email' then lower(trim(value))
      when type = 'phone' then regexp_replace(trim(value), '[^0-9+]', '', 'g')
      else trim(value)
    end
  ) stored,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists contact_identities_owner_type_value_norm_uniq
  on public.contact_identities(owner_id, type, value_normalized);

create index if not exists contact_identities_owner_contact_idx
  on public.contact_identities(owner_id, contact_id);

create index if not exists contact_identities_value_trgm_idx
  on public.contact_identities using gin (value gin_trgm_ops);

drop trigger if exists set_updated_at_contact_identities on public.contact_identities;
create trigger set_updated_at_contact_identities
before update on public.contact_identities
for each row execute procedure public.tg_set_updated_at();

-- =========================================================
-- 7) CONVERSATIONS
-- =========================================================
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,

  contact_id uuid references public.contacts(id) on delete set null,
  primary_identity_id uuid references public.contact_identities(id) on delete set null,

  status public.conversation_status not null default 'open',
  assigned_to_profile_id uuid references public.profiles(id) on delete set null,

  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_channel public.channel_type,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint conversations_contact_or_identity_chk
    check ((contact_id is not null) or (primary_identity_id is not null))
);

create unique index if not exists conversations_owner_contact_uniq
  on public.conversations(owner_id, contact_id)
  where contact_id is not null and deleted_at is null;

create unique index if not exists conversations_owner_primary_identity_uniq
  on public.conversations(owner_id, primary_identity_id)
  where contact_id is null and primary_identity_id is not null and deleted_at is null;

create index if not exists conversations_owner_last_message_idx
  on public.conversations(owner_id, last_message_at desc nulls last)
  where deleted_at is null;

drop trigger if exists set_updated_at_conversations on public.conversations;
create trigger set_updated_at_conversations
before update on public.conversations
for each row execute procedure public.tg_set_updated_at();

create table if not exists public.conversation_identities (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  identity_id uuid not null references public.contact_identities(id) on delete cascade,

  created_at timestamptz not null default now(),
  primary key (conversation_id, identity_id)
);

create index if not exists conversation_identities_owner_identity_idx
  on public.conversation_identities(owner_id, identity_id);

-- =========================================================
-- 8) MESSAGES
-- =========================================================
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,

  conversation_id uuid not null references public.conversations(id) on delete cascade,
  integration_account_id uuid not null references public.integration_accounts(id) on delete restrict,
  identity_id uuid not null references public.contact_identities(id) on delete restrict,

  channel public.channel_type not null,
  direction public.message_direction not null,

  external_message_id text not null,
  external_chat_id text,
  external_reply_to_message_id text,

  from_address text,
  to_address text,

  subject text,
  text text,
  html text,

  sent_at timestamptz not null,
  created_at timestamptz not null default now(),

  edited_at timestamptz,
  deleted_at timestamptz,

  raw_payload jsonb not null default '{}'::jsonb,

  search_tsv tsvector generated always as (
    to_tsvector('simple', coalesce(subject,'') || ' ' || coalesce(text,''))
  ) stored
);

create index if not exists messages_conversation_sent_at_idx
  on public.messages(conversation_id, sent_at desc);

create index if not exists messages_owner_sent_at_idx
  on public.messages(owner_id, sent_at desc);

create index if not exists messages_search_tsv_idx
  on public.messages using gin (search_tsv);

create unique index if not exists messages_telegram_dedupe_uniq
  on public.messages(integration_account_id, external_chat_id, external_message_id)
  where channel = 'telegram' and external_chat_id is not null;

create unique index if not exists messages_email_dedupe_uniq
  on public.messages(integration_account_id, external_message_id)
  where channel = 'email';

create unique index if not exists messages_openphone_dedupe_uniq
  on public.messages(integration_account_id, external_message_id)
  where channel = 'openphone_sms';

create or replace function public.tg_messages_after_insert()
returns trigger
language plpgsql
as $$
begin
  update public.conversations
  set
    last_message_at = greatest(coalesce(last_message_at, new.sent_at), new.sent_at),
    last_channel = new.channel,
    last_inbound_at = case
      when new.direction = 'inbound'
        then greatest(coalesce(last_inbound_at, new.sent_at), new.sent_at)
      else last_inbound_at
    end,
    last_outbound_at = case
      when new.direction = 'outbound'
        then greatest(coalesce(last_outbound_at, new.sent_at), new.sent_at)
      else last_outbound_at
    end,
    updated_at = now()
  where id = new.conversation_id;

  return new;
end $$;

drop trigger if exists messages_after_insert_update_conversation on public.messages;
create trigger messages_after_insert_update_conversation
after insert on public.messages
for each row execute procedure public.tg_messages_after_insert();

-- =========================================================
-- 9) MESSAGE EVENTS
-- =========================================================
create table if not exists public.message_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,

  message_id uuid not null references public.messages(id) on delete cascade,
  type public.message_event_type not null,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists message_events_message_idx
  on public.message_events(message_id, occurred_at desc);

-- =========================================================
-- 10) ATTACHMENTS
-- =========================================================
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,

  message_id uuid not null references public.messages(id) on delete cascade,

  storage_bucket text not null,
  storage_path text not null,

  file_name text,
  mime_type text,
  byte_size bigint,
  sha256 text,

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists attachments_message_idx
  on public.attachments(message_id);

-- =========================================================
-- 11) TAGS + TEMPLATES
-- =========================================================
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,

  name citext not null,
  color text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tags_name_len_chk check (char_length(name::text) between 1 and 60)
);

create unique index if not exists tags_owner_name_uniq
  on public.tags(owner_id, name);

drop trigger if exists set_updated_at_tags on public.tags;
create trigger set_updated_at_tags
before update on public.tags
for each row execute procedure public.tg_set_updated_at();

create table if not exists public.conversation_tags (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,

  created_at timestamptz not null default now(),
  primary key (conversation_id, tag_id)
);

create index if not exists conversation_tags_tag_idx
  on public.conversation_tags(tag_id);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,

  title text not null,
  content text not null,

  channel_hint public.channel_type,
  shortcut text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at_templates on public.templates;
create trigger set_updated_at_templates
before update on public.templates
for each row execute procedure public.tg_set_updated_at();

-- =========================================================
-- 12) IA
-- =========================================================
create table if not exists public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,

  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,

  type public.ai_suggestion_type not null,
  model text,
  prompt_version text,

  content text not null,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists ai_suggestions_conversation_idx
  on public.ai_suggestions(conversation_id, created_at desc);

create table if not exists public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,

  suggestion_id uuid not null references public.ai_suggestions(id) on delete cascade,
  action public.ai_feedback_action not null,

  final_content text,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_summaries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,

  conversation_id uuid not null references public.conversations(id) on delete cascade,

  model text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists conversation_summaries_conversation_idx
  on public.conversation_summaries(conversation_id, created_at desc);

-- =========================================================
-- 13) PROMPTS (versionado)
-- =========================================================
create table if not exists public.prompts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  
  type public.prompt_type not null,
  version int not null default 1,
  is_active boolean not null default false,
  
  content text not null,
  description text,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists prompts_owner_type_version_uniq
  on public.prompts(owner_id, type, version);

create index if not exists prompts_owner_type_active_idx
  on public.prompts(owner_id, type)
  where is_active = true;

drop trigger if exists set_updated_at_prompts on public.prompts;
create trigger set_updated_at_prompts
before update on public.prompts
for each row execute procedure public.tg_set_updated_at();

-- =========================================================
-- 14) TRANSLATIONS (cache EN->PT)
-- =========================================================
create table if not exists public.message_translations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,

  message_id uuid not null references public.messages(id) on delete cascade,

  source_lang text,
  target_lang text not null default 'pt-BR',
  provider text not null default 'gemini',
  model text,

  translated_text text not null,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists message_translations_message_target_uniq
  on public.message_translations(message_id, target_lang);

drop trigger if exists set_updated_at_message_translations on public.message_translations;
create trigger set_updated_at_message_translations
before update on public.message_translations
for each row execute procedure public.tg_set_updated_at();

-- =========================================================
-- 15) RAW EVENTS + LOGS
-- =========================================================
create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,

  integration_account_id uuid not null references public.integration_accounts(id) on delete cascade,
  channel public.channel_type not null,

  event_type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,

  status text not null default 'received',
  error text,

  payload jsonb not null
);

create index if not exists integration_events_account_received_idx
  on public.integration_events(integration_account_id, received_at desc);

create table if not exists public.app_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,

  source text not null,
  level public.log_level not null default 'info',
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  trace_id text,

  created_at timestamptz not null default now()
);

create index if not exists app_logs_owner_created_idx
  on public.app_logs(owner_id, created_at desc);

create index if not exists app_logs_trace_idx
  on public.app_logs(trace_id)
  where trace_id is not null;

create table if not exists public.backup_exports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,

  format text not null check (format in ('csv', 'json')),
  status text not null default 'requested',

  storage_bucket text,
  storage_path text,

  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  error text
);

-- =========================================================
-- 16) RLS POLICIES
-- =========================================================
alter table public.profiles enable row level security;
alter table public.integration_accounts enable row level security;
alter table public.worker_heartbeats enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_identities enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_identities enable row level security;
alter table public.messages enable row level security;
alter table public.message_events enable row level security;
alter table public.attachments enable row level security;
alter table public.tags enable row level security;
alter table public.conversation_tags enable row level security;
alter table public.templates enable row level security;
alter table public.ai_suggestions enable row level security;
alter table public.ai_feedback enable row level security;
alter table public.conversation_summaries enable row level security;
alter table public.prompts enable row level security;
alter table public.message_translations enable row level security;
alter table public.integration_events enable row level security;
alter table public.app_logs enable row level security;
alter table public.backup_exports enable row level security;

-- Profile
drop policy if exists profile_select_own on public.profiles;
create policy profile_select_own on public.profiles
for select using (id = auth.uid());

-- Generic owner policies
do $$
declare
  tbl text;
begin
  for tbl in 
    select unnest(array[
      'integration_accounts', 'worker_heartbeats', 'contacts', 'contact_identities',
      'conversations', 'conversation_identities', 'messages', 'message_events',
      'attachments', 'tags', 'conversation_tags', 'templates',
      'ai_suggestions', 'ai_feedback', 'conversation_summaries', 'prompts',
      'message_translations', 'integration_events', 'app_logs', 'backup_exports'
    ])
  loop
    execute format('drop policy if exists owner_all_%I on public.%I', tbl, tbl);
    execute format('create policy owner_all_%I on public.%I for all using (owner_id = auth.uid()) with check (owner_id = auth.uid())', tbl, tbl);
  end loop;
end $$;

-- =========================================================
-- 17) SEED DEFAULT PROMPTS
-- =========================================================
-- Prompts serão inseridos via API no primeiro acesso

-- =========================================================
-- 18) STORAGE BUCKET (run manually in Supabase dashboard)
-- =========================================================
-- Create bucket: attachments (private)
-- Enable RLS on storage.objects if not already
```

---

## 16) Error Handling

### API (FastAPI)

```python
# app/exceptions.py
from fastapi import HTTPException

class NotFoundError(HTTPException):
    def __init__(self, resource: str, id: str):
        super().__init__(status_code=404, detail=f"{resource} {id} not found")

class ValidationError(HTTPException):
    def __init__(self, message: str):
        super().__init__(status_code=400, detail=message)

class IntegrationError(HTTPException):
    def __init__(self, integration: str, message: str):
        super().__init__(status_code=502, detail=f"{integration}: {message}")
```

### Frontend (React)

```typescript
// lib/api.ts
export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string
  ) {
    super(detail);
  }
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new ApiError(res.status, body.detail);
  }
  
  return res.json();
}
```

### Retry Policy (Workers)

```python
# workers/shared/retry.py
import asyncio
from functools import wraps

def with_retry(max_attempts=3, base_delay=1.0, max_delay=60.0):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            attempt = 0
            while True:
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    attempt += 1
                    if attempt >= max_attempts:
                        raise
                    delay = min(base_delay * (2 ** attempt), max_delay)
                    await asyncio.sleep(delay)
        return wrapper
    return decorator
```

---

## 17) Checklist de Segurança

- [ ] RLS habilitado em todas as tabelas
- [ ] Service Role Key apenas em backend/workers
- [ ] Anon Key apenas no frontend (com RLS)
- [ ] ENCRYPTION_KEY gerada com `openssl rand -base64 32`
- [ ] ENCRYPTION_KEY em env var, nunca em código
- [ ] HTTPS obrigatório em produção
- [ ] Webhook secrets validados
- [ ] Rate limiting na API
- [ ] Logs não contêm secrets
- [ ] Prompts de IA sanitizados (sem injection)

---

## 18) Glossário

| Termo | Definição |
|-------|-----------|
| **Contato** | Lead/cliente com múltiplos identificadores |
| **Identidade** | Um identificador específico (email, phone, telegram_user) |
| **Conversa** | Thread de mensagens, única por contato |
| **Conversa não vinculada** | Conversa de identidade sem contato associado |
| **Merge** | Mover mensagens de uma conversa para outra |
| **Inbound** | Mensagem recebida do lead |
| **Outbound** | Mensagem enviada pelo sistema |
| **Worker** | Processo background que mantém conexão persistente |
| **Heartbeat** | Sinal periódico de que worker está vivo |

---

## 19) Referências

- [Supabase Docs](https://supabase.com/docs)
- [Telethon Docs](https://docs.telethon.dev/)
- [OpenPhone API](https://www.quo.com/docs/mdx/api-reference/introduction)
- [Google AI - Gemini 3](https://ai.google.dev/gemini-api/docs/gemini-3)
- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [Next.js Docs](https://nextjs.org/docs)
- [shadcn/ui](https://ui.shadcn.com/)

---

**Fim do PRD v2.0**