"""
Servico de geracao de Planos de Relacionamento com IA.

Orquestra o fluxo de 5 passos para geracao de planos de vendas:
1. Estrutura (generate_plan_structure)
2. Introducao (generate_plan_introduction)
3. Aprofundamento de blocos (deepen_plan_block) - loop
4. Resumo (generate_plan_summary)
5. FAQ (generate_plan_faq)

Gerencia estado intermediario, retry com exponential backoff e
salvamento parcial para recuperacao de falhas.
"""

import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any

from supabase import Client

from .glm import get_glm_service

logger = logging.getLogger(__name__)


# Status do plano durante geracao
PLAN_STATUS = {
    "DRAFT": "draft",
    "GENERATING_STRUCTURE": "generating_structure",
    "GENERATING_INTRO": "generating_intro",
    "DEEPENING_BLOCKS": "deepening_blocks",
    "GENERATING_SUMMARY": "generating_summary",
    "COMPLETED": "completed",
    "ERROR": "error",
}


class PlanGenerator:
    """
    Orquestrador da geracao de Planos de Relacionamento.

    Fluxo:
    1. Buscar system prompt customizado (se existir)
    2. Gerar estrutura -> salvar
    3. Gerar introducao -> salvar
    4. Aprofundar blocos (loop) -> salvar parcial
    5. Gerar resumo -> salvar
    6. Gerar FAQ -> finalizar

    Tratamento de erros:
    - Salva estado intermediario sempre
    - Retry com exponential backoff
    - Status 'error' com mensagem se falhar
    """

    def __init__(self, db: Client, owner_id: str, workspace_id: str):
        self.db = db
        self.owner_id = owner_id
        self.workspace_id = workspace_id
        self.glm = get_glm_service()

    async def generate_full_plan(
        self,
        plan_id: str,
        form_data: dict[str, Any],
        conversation_context: str | None,
    ) -> dict[str, Any]:
        """
        Metodo principal: executa o fluxo completo de geracao.

        Args:
            plan_id: UUID do plano em relationship_plans
            form_data: Dicionario com respostas do formulario
            conversation_context: Texto livre com contexto adicional

        Returns:
            Dicionario com o plano completo gerado

        Raises:
            RuntimeError: Se falhar apos max retries
        """
        start_time = time.time()
        structure: dict[str, Any] = {}
        introduction: dict[str, Any] = {}
        deepened_blocks: dict[str, Any] = {}
        summary: dict[str, Any] = {}
        faq: dict[str, Any] = {}

        try:
            # 1. Buscar prompts customizados se existirem
            custom_prompts = await self._get_custom_prompts()

            # 2. Gerar estrutura
            await self._update_status(plan_id, PLAN_STATUS["GENERATING_STRUCTURE"])
            context = self._build_context(form_data, conversation_context)

            # Salvar mensagem inicial (user com contexto)
            self._save_conversation_message(
                plan_id,
                "user",
                f"Generate a sales plan with this context:\n{context}",
                step="structure",
            )

            structure = await self._retry_generate(
                self.glm.generate_plan_structure,
                context,
                custom_prompts.get("structure"),
            )

            # Salvar resposta da estrutura
            self._save_conversation_message(
                plan_id,
                "assistant",
                json.dumps(structure, ensure_ascii=False),
                step="structure",
                tokens_estimate=self._estimate_tokens(json.dumps(structure)),
            )

            await self._save_structure(plan_id, structure)
            logger.info(f"Plan {plan_id}: estrutura gerada")

            # 3. Gerar introducao
            await self._update_status(plan_id, PLAN_STATUS["GENERATING_INTRO"])

            # Salvar prompt da introducao
            intro_prompt = f"Generate an introduction for this plan:\n{json.dumps(structure, ensure_ascii=False)}\n\nContext:\n{context}"
            self._save_conversation_message(
                plan_id,
                "user",
                intro_prompt,
                step="intro",
            )

            introduction = await self._retry_generate(
                self.glm.generate_plan_introduction,
                structure,
                context,
                custom_prompts.get("introduction"),
            )

            # Salvar resposta da introducao
            self._save_conversation_message(
                plan_id,
                "assistant",
                json.dumps(introduction, ensure_ascii=False),
                step="intro",
                tokens_estimate=self._estimate_tokens(json.dumps(introduction)),
            )

            await self._save_introduction(plan_id, introduction)
            logger.info(f"Plan {plan_id}: introducao gerada")

            # 4. Aprofundar blocos (loop)
            await self._update_status(plan_id, PLAN_STATUS["DEEPENING_BLOCKS"])
            phases = structure.get("phases", [])
            deepened_blocks = {}

            for idx, phase in enumerate(phases):
                block_id = f"phase_{idx}"
                step_name = f"block_{idx}"
                block_data = {"title": phase.get("title", ""), "phase": phase}

                try:
                    # Salvar prompt do bloco
                    block_prompt = f"Expand this block:\n{json.dumps(block_data, ensure_ascii=False)}\n\nContext:\n{context}"
                    self._save_conversation_message(
                        plan_id,
                        "user",
                        block_prompt,
                        step=step_name,
                        block_id=block_id,
                    )

                    deepened = await self._retry_generate(
                        self.glm.deepen_plan_block,
                        structure,
                        block_data,
                        context,
                        custom_prompts.get("deepen_block"),
                    )

                    # Salvar resposta do bloco
                    self._save_conversation_message(
                        plan_id,
                        "assistant",
                        json.dumps(deepened, ensure_ascii=False),
                        step=step_name,
                        block_id=block_id,
                        tokens_estimate=self._estimate_tokens(json.dumps(deepened)),
                    )

                    deepened_blocks[block_id] = {
                        "phase": phase,
                        "details": deepened,
                    }
                    # Salva parcialmente a cada bloco
                    await self._save_blocks_partial(plan_id, deepened_blocks)
                    logger.info(f"Plan {plan_id}: bloco {block_id} aprofundado")

                    # Compactar historico se necessario
                    self._compact_history_if_needed(plan_id)

                except Exception as e:
                    logger.error(f"Plan {plan_id}: erro ao aprofundar bloco {block_id}: {e}")
                    # Continua com proximo bloco, salva o que conseguiu
                    deepened_blocks[block_id] = {
                        "phase": phase,
                        "error": str(e),
                    }
                    await self._save_blocks_partial(plan_id, deepened_blocks)

            # 5. Gerar resumo
            await self._update_status(plan_id, PLAN_STATUS["GENERATING_SUMMARY"])

            # Salvar prompt do resumo
            summary_prompt = f"Generate a summary for this plan:\nStructure: {json.dumps(structure, ensure_ascii=False)}\n\nIntroduction: {json.dumps(introduction, ensure_ascii=False)}"
            self._save_conversation_message(
                plan_id,
                "user",
                summary_prompt,
                step="summary",
            )

            summary = await self._retry_generate(
                self.glm.generate_plan_summary,
                structure,
                introduction,
                context,
                custom_prompts.get("summary"),
            )

            # Salvar resposta do resumo
            self._save_conversation_message(
                plan_id,
                "assistant",
                json.dumps(summary, ensure_ascii=False),
                step="summary",
                tokens_estimate=self._estimate_tokens(json.dumps(summary)),
            )

            await self._save_summary(plan_id, summary)
            logger.info(f"Plan {plan_id}: resumo gerado")

            # 6. Gerar FAQ e finalizar
            # Salvar prompt da FAQ
            faq_prompt = f"Generate FAQ for this plan:\n{json.dumps(structure, ensure_ascii=False)}"
            self._save_conversation_message(
                plan_id,
                "user",
                faq_prompt,
                step="faq",
            )

            faq = await self._retry_generate(
                self.glm.generate_plan_faq,
                structure,
                context,
                custom_prompts.get("faq"),
            )

            # Salvar resposta da FAQ
            self._save_conversation_message(
                plan_id,
                "assistant",
                json.dumps(faq, ensure_ascii=False),
                step="faq",
                tokens_estimate=self._estimate_tokens(json.dumps(faq)),
            )

            # 7. Finalizar plano
            duration = int(time.time() - start_time)
            final_plan = await self._finalize_plan(
                plan_id,
                {
                    "structure": structure,
                    "introduction": introduction,
                    "deepened_blocks": deepened_blocks,
                    "summary": summary,
                    "faq": faq,
                    "duration_seconds": duration,
                },
            )
            logger.info(f"Plan {plan_id}: geracao completada em {duration}s")

            return final_plan

        except Exception as e:
            logger.error(f"Plan {plan_id}: erro fatal na geracao: {e}")
            await self._update_status(
                plan_id,
                PLAN_STATUS["ERROR"],
                error_message=str(e),
            )
            raise RuntimeError(f"Falha na geracao do plano {plan_id}: {e}") from e

    async def _get_custom_prompts(self) -> dict[str, str]:
        """
        Busca prompts customizados em plan_prompts para este workspace.
        Retorna dict com prompt_type -> content.
        """
        prompts = {}

        try:
            result = (
                self.db.table("plan_prompts")
                .select("prompt_type", "content")
                .eq("workspace_id", self.workspace_id)
                .eq("owner_id", self.owner_id)
                .eq("is_active", True)
                .execute()
            )

            if result.data:
                for row in result.data:
                    prompt_type = row.get("prompt_type")
                    content = row.get("content")
                    if prompt_type and content:
                        # Mapeamento de tipos para os metodos GLM
                        type_map = {
                            "plan_system": None,  # Nao usado diretamente
                            "structure": "structure",
                            "structure_context": "structure",
                            "intro_context": "introduction",
                            "block_deepen": "deepen_block",
                            "summary_context": "summary",
                        }
                        glm_key = type_map.get(prompt_type)
                        if glm_key:
                            prompts[glm_key] = content

        except Exception as e:
            logger.warning(f"Erro ao buscar prompts customizados: {e}")

        return prompts

    def _build_context(
        self, form_data: dict[str, Any], conversation_context: str | None
    ) -> str:
        """
        Constroi o contexto completo para a IA a partir do formulario
        e contexto de conversa opcional.
        """
        context_parts = ["# Form Data:"]

        for key, value in form_data.items():
            if value:
                context_parts.append(f"- {key}: {value}")

        if conversation_context:
            context_parts.append("\n# Additional Context:")
            context_parts.append(conversation_context)

        return "\n".join(context_parts)

    async def _retry_generate(
        self,
        generate_func,
        *args,
        max_retries: int = 3,
        **kwargs,
    ) -> dict[str, Any]:
        """
        Executa funcao de geracao com retry e exponential backoff.
        """
        last_error = None

        for attempt in range(max_retries):
            try:
                result = await generate_func(*args, **kwargs)
                return result

            except Exception as e:
                last_error = e
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt  # 1s, 2s, 4s
                    logger.warning(
                        f"Erro na geracao (tentativa {attempt + 1}/{max_retries}): {e}. "
                        f"Retry em {wait_time}s..."
                    )
                    await asyncio.sleep(wait_time)
                else:
                    logger.error(f"Erro na geracao apos {max_retries} tentativas: {e}")

        raise RuntimeError(
            f"Falha na geracao apos {max_retries} tentativas: {last_error}"
        ) from last_error

    async def _update_status(
        self,
        plan_id: str,
        status: str,
        error_message: str | None = None,
    ) -> None:
        """Atualiza status do plano no banco."""
        update_data: dict[str, Any] = {"status": status}

        if status == PLAN_STATUS["GENERATING_STRUCTURE"] and not update_data.get(
            "generation_started_at"
        ):
            update_data["generation_started_at"] = datetime.now(
                timezone.utc
            ).isoformat()

        if error_message:
            update_data["error_message"] = error_message
            update_data["generation_completed_at"] = datetime.now(
                timezone.utc
            ).isoformat()

        self.db.table("relationship_plans").update(update_data).eq(
            "id", plan_id
        ).execute()
        logger.debug(f"Plan {plan_id}: status -> {status}")

    async def _save_structure(
        self, plan_id: str, structure: dict[str, Any]
    ) -> None:
        """Salva estrutura do plano."""
        self.db.table("relationship_plans").update(
            {"structure": structure}
        ).eq("id", plan_id).execute()

    async def _save_introduction(
        self, plan_id: str, introduction: dict[str, Any]
    ) -> None:
        """Salva introducao do plano."""
        # Convert dict JSON to text
        intro_text = (
            f"## Executive Summary\n{introduction.get('executive_summary', '')}\n\n"
            f"## Objectives\n"
            + "\n".join(f"- {o}" for o in introduction.get("objectives", []))
            + "\n\n"
            f"## Expected Outcomes\n"
            + "\n".join(f"- {o}" for o in introduction.get("expected_outcomes", []))
        )

        self.db.table("relationship_plans").update({"introduction": intro_text}).eq(
            "id", plan_id
        ).execute()

    async def _save_blocks_partial(
        self, plan_id: str, blocks: dict[str, Any]
    ) -> None:
        """Salva estado parcial dos blocos aprofundados."""
        self.db.table("relationship_plans").update(
            {"deepened_blocks": blocks}
        ).eq("id", plan_id).execute()

    async def _save_summary(self, plan_id: str, summary: dict[str, Any]) -> None:
        """Salva resumo do plano."""
        summary_text = (
            f"## Key Highlights\n"
            + "\n".join(f"- {h}" for h in summary.get("key_highlights", []))
            + "\n\n"
            f"## Investment Summary\n{summary.get('investment_summary', '')}\n\n"
            f"## ROI Projection\n{summary.get('roi_projection', '')}"
        )

        self.db.table("relationship_plans").update({"summary": summary_text}).eq(
            "id", plan_id
        ).execute()

    async def _finalize_plan(
        self, plan_id: str, final_data: dict[str, Any]
    ) -> dict[str, Any]:
        """
        Finaliza o plano, salvando FAQ e metadados finais.
        Retorna o plano completo.
        """
        faq = final_data.get("faq", {})
        duration = final_data.get("duration_seconds", 0)

        update_data = {
            "status": PLAN_STATUS["COMPLETED"],
            "faq": faq.get("faqs", []),
            "generation_completed_at": datetime.now(timezone.utc).isoformat(),
            "generation_duration_seconds": duration,
            "error_message": None,  # Limpa erro se existia
        }

        result = (
            self.db.table("relationship_plans").update(update_data)
            .eq("id", plan_id)
            .execute()
        )

        # Busca plano atualizado para retornar
        plan_result = (
            self.db.table("relationship_plans")
            .select("*")
            .eq("id", plan_id)
            .single()
            .execute()
        )

        return plan_result.data if plan_result.data else {}

    # ============================================
    # Contexto Conversacional
    # ============================================

    def _save_conversation_message(
        self,
        plan_id: str,
        role: str,
        content: str,
        step: str | None = None,
        block_id: str | None = None,
        tokens_estimate: int | None = None,
    ) -> None:
        """
        Salva mensagem no historico de conversa do plano.

        Args:
            plan_id: UUID do plano
            role: 'system', 'user', ou 'assistant'
            content: Conteudo da mensagem
            step: Etapa do plano (structure, intro, block_N, summary, faq)
            block_id: ID do bloco (para deepening)
            tokens_estimate: Estimativa de tokens (opcional)
        """
        try:
            self.db.table("plan_conversation_history").insert({
                "plan_id": plan_id,
                "role": role,
                "content": content,
                "step": step,
                "block_id": block_id,
                "tokens_estimate": tokens_estimate,
            }).execute()
            logger.debug(f"Plan {plan_id}: mensagem {role} salva (step={step})")
        except Exception as e:
            logger.warning(f"Plan {plan_id}: erro ao salvar mensagem no historico: {e}")

    def _get_conversation_history(
        self,
        plan_id: str,
        step: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """
        Busca historico de conversa do plano.

        Args:
            plan_id: UUID do plano
            step: Filtrar por etapa (opcional)
            limit: Maximo de mensagens a retornar

        Returns:
            Lista de mensagens em ordem cronologica
        """
        try:
            query = (
                self.db.table("plan_conversation_history")
                .select("*")
                .eq("plan_id", plan_id)
                .order("created_at", desc=False)
                .limit(limit)
            )

            if step:
                query = query.eq("step", step)

            result = query.execute()
            return result.data or []

        except Exception as e:
            logger.warning(f"Plan {plan_id}: erro ao buscar historico: {e}")
            return []

    def _estimate_tokens(self, text: str) -> int:
        """Estima quantidade de tokens (aprox 4 chars por token)."""
        return len(text) // 4

    def _compact_history_if_needed(self, plan_id: str) -> None:
        """
        Compacta historico se estiver muito grande.

        Mantem as ultimas 50 mensagens e as primeiras 10 (contexto inicial).
        """
        try:
            # Contar mensagens
            count_result = (
                self.db.table("plan_conversation_history")
                .select("id")
                .eq("plan_id", plan_id)
                .execute()
            )

            total = len(count_result.data) if count_result.data else 0

            # Compactar se tiver mais de 100 mensagens
            if total > 100:
                # Buscar IDs para manter (primeiras 10 + ultimas 50)
                all_msgs = (
                    self.db.table("plan_conversation_history")
                    .select("id")
                    .eq("plan_id", plan_id)
                    .order("created_at", desc=False)
                    .execute()
                )

                ids_to_keep = set()
                if all_msgs.data:
                    # Manter primeiras 10 (contexto inicial)
                    ids_to_keep.update(m["id"] for m in all_msgs.data[:10])
                    # Manter ultimas 50 (conversa recente)
                    ids_to_keep.update(m["id"] for m in all_msgs.data[-50:])

                # Deletar mensagens que nao estao nos IDs para manter
                if len(ids_to_keep) > 0:
                    # Buscar todos os IDs
                    all_ids = [m["id"] for m in all_msgs.data]
                    ids_to_delete = [id_ for id_ in all_ids if id_ not in ids_to_keep]

                    if ids_to_delete:
                        # Deletar em lotes de 50
                        for i in range(0, len(ids_to_delete), 50):
                            batch = ids_to_delete[i:i+50]
                            self.db.table("plan_conversation_history").delete().in_(
                                "id", batch
                            ).execute()

                        logger.info(f"Plan {plan_id}: historico compactado ({len(ids_to_delete)} mensagens removidas)")

        except Exception as e:
            logger.warning(f"Plan {plan_id}: erro ao compactar historico: {e}")


def get_plan_generator(
    db: Client, owner_id: str, workspace_id: str
) -> PlanGenerator:
    """Factory function para criar PlanGenerator."""
    return PlanGenerator(db=db, owner_id=owner_id, workspace_id=workspace_id)
