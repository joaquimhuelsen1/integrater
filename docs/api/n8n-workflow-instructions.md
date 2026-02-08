# n8n Workflow: Instrucoes Personalizadas (GLM 4.7)

## Visao Geral

Workflow que recebe dados do formulario + conversa do aluno via webhook,
gera instrucoes personalizadas usando GLM 4.7, e salva no Supabase.

## Estrutura do Workflow

```
[Webhook] --> [Set: Montar Prompt] --> [HTTP Request: GLM API] --> [Supabase: Salvar Resultado]
                                              |
                                              v (erro)
                                       [Supabase: Salvar Erro]
```

## Node 1: Webhook Trigger

- **Tipo:** Webhook
- **Metodo:** POST
- **URL:** `https://n8nwebhook.thereconquestmap.com/webhook/instructions/generate`
- **Authentication:** None (ou Header Auth se preferir)

### Payload Recebido

```json
{
  "instruction_id": "uuid-do-registro",
  "conversation_id": "uuid-da-conversa",
  "form_data": "fonte Google Forms idade 62 nome ex Victoria Boyer...",
  "conversation_text": "Lead: Hi, I need help\nVoce: Hello, tell me more...",
  "contact_name": "Daniel Manoff",
  "owner_id": "uuid-do-usuario"
}
```

## Node 2: Set - Montar Prompt

- **Tipo:** Set
- **Campos:**

### Campo: `prompt` (String)

Montar o prompt completo combinando:

```
{{ $json.systemPrompt }}

{{ $json.knowledgeBase }}

---

## Dados do Formulario do Paciente
{{ $json.body.form_data }}

## Conversa com o Paciente
{{ $json.body.conversation_text }}
```

### Campo: `systemPrompt` (String, FIXO no node)

Colar aqui o system prompt completo do Ethan Heyes (o prompt grande com persona,
tarefa, etapas, exemplo de plano de acao).

### Campo: `knowledgeBase` (String, FIXO no node)

Colar aqui o conteudo dos 11 arquivos .docx convertidos para texto.

**Como converter:** Abrir cada .docx, copiar todo o texto, colar aqui separando
cada documento com um header:

```
### Documento 1: [Nome do arquivo]
[Conteudo do documento]

### Documento 2: [Nome do arquivo]
[Conteudo do documento]

...
```

## Node 3: HTTP Request - GLM 4.7 API

- **Tipo:** HTTP Request
- **Metodo:** POST
- **URL:** `https://open.bigmodel.cn/api/paas/v4/chat/completions`
- **Headers:**
  - `Authorization`: `Bearer {{ $credentials.zhipuApiKey }}`
  - `Content-Type`: `application/json`

### Body (JSON)

```json
{
  "model": "glm-4-plus",
  "messages": [
    {
      "role": "user",
      "content": "{{ $json.prompt }}"
    }
  ],
  "temperature": 0.7,
  "max_tokens": 4096
}
```

**Nota sobre modelo:** Use `glm-4-plus` ou `glm-4.7` dependendo da disponibilidade.
Verifique a API da Zhipu para o model ID correto.

### Credenciais

Criar credencial "Header Auth" no n8n com:
- **Name:** `Authorization`
- **Value:** `Bearer SUA_ZHIPU_API_KEY`

Ou use o n8n credential store com tipo "HTTP Header Auth".

## Node 4: Supabase - Salvar Resultado (Sucesso)

- **Tipo:** Supabase
- **Operacao:** Update
- **Tabela:** `conversation_instructions`
- **Filtro:** `id` = `{{ $('Webhook').item.json.body.instruction_id }}`

### Campos a Atualizar

| Campo | Valor |
|-------|-------|
| `instructions` | `{{ $json.choices[0].message.content }}` |
| `status` | `completed` |
| `model_used` | `{{ $json.model }}` |
| `generation_completed_at` | `{{ $now.toISO() }}` |

## Node 5: Supabase - Salvar Erro (Error Handler)

- **Tipo:** Supabase (conectado ao Error Output do node HTTP Request)
- **Operacao:** Update
- **Tabela:** `conversation_instructions`
- **Filtro:** `id` = `{{ $('Webhook').item.json.body.instruction_id }}`

### Campos a Atualizar

| Campo | Valor |
|-------|-------|
| `status` | `error` |
| `error_message` | `{{ $json.error?.message || 'Erro desconhecido na geracao' }}` |

## Configuracao no .env da API

Apos criar o workflow no n8n, copiar a URL do webhook e adicionar no `.env`:

```
N8N_INSTRUCTIONS_WEBHOOK_URL=https://n8nwebhook.thereconquestmap.com/webhook/instructions/generate
```

## Teste Manual

1. Ativar o workflow no n8n
2. Abrir uma conversa no inbox
3. Clicar no menu (tres pontos) > "Gerar Instrucoes"
4. Colar dados do formulario no modal
5. Clicar "Gerar"
6. Verificar no n8n se o webhook foi recebido
7. Verificar no Supabase se o registro foi atualizado para `completed`
8. Verificar no inbox se o painel amber aparece com as instrucoes

## Troubleshooting

| Problema | Solucao |
|----------|---------|
| Webhook nao recebe dados | Verificar URL no .env, verificar se workflow esta ativo |
| GLM retorna erro 401 | Verificar API key da Zhipu |
| GLM retorna erro 429 | Rate limit - aguardar ou usar modelo diferente |
| Status fica "pending" | Verificar logs do n8n, webhook pode nao estar respondendo |
| Instrucoes nao aparecem no inbox | Verificar se n8n esta fazendo UPDATE correto na tabela |
