"""
Servico de execucao de automacoes.

Responsavel por:
- Buscar regras ativas para um trigger
- Validar condicoes
- Executar acoes
- Logar execucoes em automation_executions
"""
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4

import httpx
from supabase import Client

from app.models.enums import AutomationTriggerType, AutomationActionType

logger = logging.getLogger(__name__)


class AutomationExecutor:
    """Executor de automacoes."""

    def __init__(self, db: Client, owner_id: str):
        self.db = db
        self.owner_id = owner_id

    async def dispatch_trigger(
        self,
        trigger_type: AutomationTriggerType,
        deal_id: UUID,
        trigger_data: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """
        Dispara um trigger e executa todas as regras ativas que correspondem.

        Args:
            trigger_type: Tipo do trigger (message_received, stage_changed, etc)
            deal_id: ID do deal afetado
            trigger_data: Dados adicionais do trigger (ex: from_stage_id, to_stage_id)

        Returns:
            Lista de execucoes realizadas
        """
        trigger_data = trigger_data or {}
        executions: list[dict[str, Any]] = []

        # Busca deal para obter pipeline_id
        deal = self.db.table("deals").select(
            "id, pipeline_id, stage_id, value, probability, custom_fields"
        ).eq("id", str(deal_id)).eq("owner_id", self.owner_id).single().execute()

        if not deal.data:
            logger.warning(f"Deal {deal_id} nao encontrado para automacao")
            return executions

        pipeline_id = deal.data["pipeline_id"]

        # Busca regras ativas para este pipeline e trigger
        rules = self.db.table("automation_rules").select("*").eq(
            "pipeline_id", pipeline_id
        ).eq("owner_id", self.owner_id).eq(
            "is_active", True
        ).eq("trigger_type", trigger_type.value).execute()

        if not rules.data:
            logger.debug(f"Nenhuma regra ativa para trigger {trigger_type} no pipeline {pipeline_id}")
            return executions

        for rule in rules.data:
            try:
                # Valida condicoes da regra
                if not self._check_conditions(rule, deal.data, trigger_data):
                    logger.debug(f"Regra {rule['id']} nao passou nas condicoes")
                    continue

                # Executa acao
                result = await self._execute_action(
                    rule=rule,
                    deal_id=str(deal_id),
                )

                # Loga execucao com sucesso
                execution = self._log_execution(
                    rule_id=rule["id"],
                    deal_id=str(deal_id),
                    trigger_type=trigger_type,
                    trigger_data=trigger_data,
                    action_type=rule["action_type"],
                    action_data=result.get("action_data", {}),
                    status="success",
                )
                executions.append(execution)

                logger.info(
                    f"Automacao executada: regra={rule['name']}, "
                    f"deal={deal_id}, acao={rule['action_type']}"
                )

            except Exception as e:
                logger.error(f"Erro ao executar regra {rule['id']}: {e}")

                # Loga execucao com falha
                execution = self._log_execution(
                    rule_id=rule["id"],
                    deal_id=str(deal_id),
                    trigger_type=trigger_type,
                    trigger_data=trigger_data,
                    action_type=rule["action_type"],
                    action_data=rule.get("action_config", {}),
                    status="failed",
                    error_message=str(e),
                )
                executions.append(execution)

        return executions

    def _check_conditions(
        self,
        rule: dict[str, Any],
        deal_data: dict[str, Any],
        trigger_data: dict[str, Any],
    ) -> bool:
        """
        Valida as condicoes da regra contra os dados do deal.

        Operadores suportados: eq, neq, gt, gte, lt, lte, contains
        """
        conditions = rule.get("conditions", [])

        if not conditions:
            return True

        for condition in conditions:
            field = condition.get("field")
            operator = condition.get("operator")
            expected_value = condition.get("value")

            # Busca valor atual do campo
            if field in deal_data:
                actual_value = deal_data[field]
            elif field in deal_data.get("custom_fields", {}):
                actual_value = deal_data["custom_fields"][field]
            elif field in trigger_data:
                actual_value = trigger_data[field]
            else:
                # Campo nao encontrado, condicao falha
                return False

            # Avalia condicao
            if not self._evaluate_condition(actual_value, operator, expected_value):
                return False

        return True

    def _evaluate_condition(
        self,
        actual: Any,
        operator: str,
        expected: Any,
    ) -> bool:
        """Avalia uma condicao individual."""
        try:
            if operator == "eq":
                return str(actual) == str(expected)
            elif operator == "neq":
                return str(actual) != str(expected)
            elif operator == "gt":
                return float(actual) > float(expected)
            elif operator == "gte":
                return float(actual) >= float(expected)
            elif operator == "lt":
                return float(actual) < float(expected)
            elif operator == "lte":
                return float(actual) <= float(expected)
            elif operator == "contains":
                return str(expected).lower() in str(actual).lower()
            else:
                logger.warning(f"Operador desconhecido: {operator}")
                return False
        except (ValueError, TypeError) as e:
            logger.warning(f"Erro ao avaliar condicao: {e}")
            return False

    async def _execute_action(
        self,
        rule: dict[str, Any],
        deal_id: str,
    ) -> dict[str, Any]:
        """
        Executa a acao definida na regra.

        Returns:
            Dict com dados da execucao (action_data)
        """
        action_type = rule["action_type"]
        action_config = rule.get("action_config", {})

        if action_type == AutomationActionType.move_stage.value:
            return await self._action_move_stage(deal_id, action_config)

        elif action_type == AutomationActionType.add_tag.value:
            return await self._action_add_tag(deal_id, action_config)

        elif action_type == AutomationActionType.update_field.value:
            return await self._action_update_field(deal_id, action_config)

        elif action_type == AutomationActionType.create_task.value:
            return await self._action_create_task(deal_id, action_config)

        elif action_type == AutomationActionType.send_notification.value:
            return await self._action_send_notification(deal_id, action_config)

        elif action_type == AutomationActionType.send_message.value:
            return await self._action_send_message(deal_id, action_config)

        else:
            raise ValueError(f"Tipo de acao desconhecido: {action_type}")

    async def _action_move_stage(
        self,
        deal_id: str,
        config: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Move deal para uma stage especifica.

        Config esperado: { "target_stage_id": "uuid" } ou { "stage_id": "uuid" }
        Aceita ambos para compatibilidade frontend/backend.
        """
        # Aceita target_stage_id (frontend) ou stage_id (fallback)
        target_stage_id = config.get("target_stage_id") or config.get("stage_id")

        if not target_stage_id:
            raise ValueError("target_stage_id ou stage_id nao especificado na action_config")

        # Busca deal atual para verificar pipeline
        deal = self.db.table("deals").select("pipeline_id, stage_id").eq(
            "id", deal_id
        ).single().execute()

        if not deal.data:
            raise ValueError(f"Deal {deal_id} nao encontrado")

        old_stage_id = deal.data["stage_id"]

        # Verifica se stage pertence ao pipeline
        stage = self.db.table("stages").select("id").eq(
            "id", target_stage_id
        ).eq("pipeline_id", deal.data["pipeline_id"]).single().execute()

        if not stage.data:
            raise ValueError(f"Stage {target_stage_id} nao pertence ao pipeline do deal")

        # Atualiza deal
        self.db.table("deals").update(
            {"stage_id": target_stage_id}
        ).eq("id", deal_id).execute()

        # Cria activity de mudanca de stage
        self.db.table("deal_activities").insert({
            "owner_id": self.owner_id,
            "deal_id": deal_id,
            "activity_type": "stage_change",
            "from_stage_id": old_stage_id,
            "to_stage_id": target_stage_id,
            "content": "Movido automaticamente por regra de automacao",
        }).execute()

        return {
            "action_data": {
                "from_stage_id": old_stage_id,
                "to_stage_id": target_stage_id,
            }
        }

    async def _action_add_tag(
        self,
        deal_id: str,
        config: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Adiciona tag ao deal.

        Config esperado: { "tag_id": "uuid" }
        """
        tag_id = config.get("tag_id")

        if not tag_id:
            raise ValueError("tag_id nao especificado na action_config")

        # Verifica se tag existe
        tag = self.db.table("deal_tags").select("id, name").eq(
            "id", tag_id
        ).eq("owner_id", self.owner_id).single().execute()

        if not tag.data:
            raise ValueError(f"Tag {tag_id} nao encontrada")

        # Adiciona relacao (ignora se ja existe)
        try:
            self.db.table("deal_tag_assignments").insert({
                "deal_id": deal_id,
                "tag_id": tag_id,
            }).execute()
        except Exception:
            # Ja existe, ignora
            pass

        return {
            "action_data": {
                "tag_id": tag_id,
                "tag_name": tag.data["name"],
            }
        }

    async def _action_update_field(
        self,
        deal_id: str,
        config: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Atualiza campo do deal.

        Config esperado: { "field": "nome_campo", "value": "novo_valor" }
        Para custom_fields: { "field": "custom_fields.nome", "value": "valor" }
        """
        field = config.get("field")
        value = config.get("value")

        if not field:
            raise ValueError("field nao especificado na action_config")

        if field.startswith("custom_fields."):
            # Campo customizado
            cf_name = field.replace("custom_fields.", "")
            deal = self.db.table("deals").select("custom_fields").eq(
                "id", deal_id
            ).single().execute()

            custom_fields = deal.data.get("custom_fields", {}) if deal.data else {}
            custom_fields[cf_name] = value

            self.db.table("deals").update(
                {"custom_fields": custom_fields}
            ).eq("id", deal_id).execute()
        else:
            # Campo padrao do deal
            allowed_fields = ["value", "probability", "expected_close_date", "title"]
            if field not in allowed_fields:
                raise ValueError(f"Campo {field} nao permitido para atualizacao")

            self.db.table("deals").update(
                {field: value}
            ).eq("id", deal_id).execute()

        return {
            "action_data": {
                "field": field,
                "value": value,
            }
        }

    async def _action_create_task(
        self,
        deal_id: str,
        config: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Cria task no deal.

        Config esperado: { "content": "descricao da task", "due_days": 3 }
        """
        content = config.get("content", "Task criada automaticamente")
        due_days = config.get("due_days")

        payload: dict[str, Any] = {
            "owner_id": self.owner_id,
            "deal_id": deal_id,
            "activity_type": "task",
            "content": content,
            "is_completed": False,
        }

        if due_days:
            due_date = datetime.now(timezone.utc) + timedelta(days=due_days)
            payload["due_date"] = due_date.isoformat()

        result = self.db.table("deal_activities").insert(payload).execute()

        return {
            "action_data": {
                "activity_id": result.data[0]["id"] if result.data else None,
                "content": content,
            }
        }

    async def _action_send_notification(
        self,
        deal_id: str,
        config: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Envia notificacao (placeholder - pode integrar com email/webhook).

        Config esperado: { "message": "texto da notificacao", "type": "email|webhook" }
        """
        message = config.get("message", "Automacao disparada")
        notification_type = config.get("type", "log")

        # Por enquanto, apenas loga
        logger.info(
            f"[NOTIFICATION] deal={deal_id}, type={notification_type}, message={message}"
        )

        # Cria nota no deal como registro
        self.db.table("deal_activities").insert({
            "owner_id": self.owner_id,
            "deal_id": deal_id,
            "activity_type": "note",
            "content": f"[Notificacao] {message}",
        }).execute()

        return {
            "action_data": {
                "type": notification_type,
                "message": message,
            }
        }

    async def _action_send_message(
        self,
        deal_id: str,
        config: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Envia mensagem via canal especificado (email ou openphone_sms).

        Config esperado: {
            "channel": "email" | "openphone_sms",
            "integration_account_id": "uuid",
            "body": "texto da mensagem",
            "subject": "assunto (apenas email, opcional)"
        }
        """
        channel = config.get("channel")
        integration_account_id = config.get("integration_account_id")
        body = config.get("body")
        subject = config.get("subject")

        if not channel:
            raise ValueError("channel nao especificado na action_config")
        if not integration_account_id:
            raise ValueError("integration_account_id nao especificado na action_config")
        if not body:
            raise ValueError("body nao especificado na action_config")
        if channel not in ("email", "openphone_sms"):
            raise ValueError(f"Canal invalido: {channel}. Use 'email' ou 'openphone_sms'")

        # Busca deal para obter contact_id e titulo
        deal_result = self.db.table("deals").select(
            "id, contact_id, title"
        ).eq("id", deal_id).eq("owner_id", self.owner_id).single().execute()

        if not deal_result.data:
            raise ValueError(f"Deal {deal_id} nao encontrado")

        deal = deal_result.data
        contact_id = deal.get("contact_id")

        if not contact_id:
            raise ValueError(f"Deal {deal_id} nao tem contact_id associado")

        # Busca identity do contato baseado no canal
        identity_type = "email" if channel == "email" else "phone"
        identity_result = self.db.table("contact_identities").select(
            "id, type, value"
        ).eq("contact_id", contact_id).eq("type", identity_type).limit(1).execute()

        if not identity_result.data:
            raise ValueError(f"Contato nao tem identity do tipo {identity_type}")

        identity = identity_result.data[0]
        to_address = identity.get("value")
        to_identity_id = identity.get("id")

        # Validar integration_account
        int_account_result = self.db.table("integration_accounts").select(
            "id, type, is_active"
        ).eq("id", integration_account_id).eq(
            "owner_id", self.owner_id
        ).eq("is_active", True).single().execute()

        if not int_account_result.data:
            raise ValueError(f"Integration account {integration_account_id} nao encontrada ou inativa")

        # Buscar conversation existente
        conv_result = self.db.table("conversations").select("id").eq(
            "owner_id", self.owner_id
        ).eq("primary_identity_id", to_identity_id).limit(1).execute()

        conversation_id = conv_result.data[0]["id"] if conv_result.data else None

        n8n_api_key = os.environ.get("N8N_API_KEY", "")
        message_id = str(uuid4())
        now = datetime.now(timezone.utc).isoformat()

        # Envia via n8n webhook
        if channel == "email":
            n8n_webhook_url = os.environ.get(
                "N8N_WEBHOOK_EMAIL_SEND",
                "https://n8nwebhook.thereconquestmap.com/webhook/email/send"
            )
            payload = {
                "id": message_id,
                "conversation_id": conversation_id,
                "integration_account_id": integration_account_id,
                "to": to_address,
                "subject": subject or f"Re: {deal.get('title', 'Deal')}",
                "text": body,
                "attachments": [],
            }
        else:  # openphone_sms
            n8n_webhook_url = os.environ.get(
                "N8N_WEBHOOK_OPENPHONE_SEND",
                "https://n8nwebhook.thereconquestmap.com/webhook/openphone/send"
            )
            payload = {
                "id": message_id,
                "conversation_id": conversation_id,
                "integration_account_id": integration_account_id,
                "to": to_address,
                "text": body,
            }

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                n8n_webhook_url,
                headers={
                    "X-API-KEY": n8n_api_key,
                    "Content-Type": "application/json",
                },
                json=payload,
            )

        if response.status_code != 200:
            raise ValueError(f"Erro n8n: status {response.status_code}")

        resp_data = response.json()
        if resp_data.get("status") != "ok":
            raise ValueError(resp_data.get("error", "Erro ao enviar mensagem"))

        logger.info(
            f"[SEND_MESSAGE] deal={deal_id}, channel={channel}, "
            f"to={to_address}, message_id={message_id}"
        )

        return {
            "action_data": {
                "message_id": message_id,
                "channel": channel,
                "to": to_address,
                "sent_at": now,
            }
        }

    def _log_execution(
        self,
        rule_id: str,
        deal_id: str,
        trigger_type: AutomationTriggerType,
        trigger_data: dict[str, Any],
        action_type: str,
        action_data: dict[str, Any],
        status: str,
        error_message: str | None = None,
    ) -> dict[str, Any]:
        """Registra execucao no banco."""
        payload = {
            "owner_id": self.owner_id,
            "rule_id": rule_id,
            "deal_id": deal_id,
            "trigger_type": trigger_type.value,
            "trigger_data": trigger_data,
            "action_type": action_type,
            "action_data": action_data,
            "status": status,
            "error_message": error_message,
        }

        result = self.db.table("automation_executions").insert(payload).execute()
        return result.data[0] if result.data else payload


def get_automation_executor(db: Client, owner_id: str) -> AutomationExecutor:
    """Factory function para criar executor."""
    return AutomationExecutor(db=db, owner_id=owner_id)
