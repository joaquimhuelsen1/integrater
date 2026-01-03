---
motivo: Documentar implementação de sincronização de contatos OpenPhone
milestone: M7
data: 2026-01-03
area: api
impacto: medio
---

# Sincronização de Contatos OpenPhone

## Contexto
OpenPhone não envia nome do contato nos webhooks de SMS - apenas números de telefone.
Para exibir nomes no inbox, precisamos sincronizar contatos manualmente.

## Descoberta
API OpenPhone `/v1/contacts` retorna:
```json
{
  "data": [{
    "defaultFields": {
      "firstName": "John",
      "lastName": "Doe",
      "company": "OpenPhone",
      "phoneNumbers": [{"value": "+12345678901"}]
    }
  }]
}
```

## Ação
Endpoint criado: `POST /openphone/contacts/sync`

### Parâmetros
- `account_id`: UUID da conta OpenPhone (integration_accounts)
- `workspace_id`: UUID do workspace

### Fluxo
1. Busca conta OpenPhone e valida ownership
2. Descriptografa API key
3. Chama `GET https://api.openphone.com/v1/contacts`
4. Para cada contato:
   - Monta display_name: `firstName lastName` ou `company`
   - Para cada phoneNumber, busca identity em `contact_identities`
   - Se existe, atualiza `metadata.display_name` e `metadata.company`
5. Retorna contagem: synced, skipped, errors

### Response
```json
{
  "synced": 15,
  "skipped": 3,
  "errors": 0
}
```

## Implicações
- Frontend pode chamar sync manualmente ou automaticamente
- Nomes aparecem no inbox após sync
- Identities que não existem são ignoradas (criadas quando receber primeira msg)
- Sync pode ser re-executado quantas vezes necessário (idempotente)

## Uso
```bash
curl -X POST "https://api.thereconquestmap.com/openphone/contacts/sync" \
  -H "Authorization: Bearer <token>" \
  -d "account_id=<uuid>&workspace_id=<uuid>"
```

## Próximos Passos
- [ ] Adicionar botão no frontend para sincronizar
- [ ] Opcional: sync automático ao cadastrar conta OpenPhone
