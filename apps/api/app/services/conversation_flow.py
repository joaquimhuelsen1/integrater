"""
Servico de geracao de Planos via Fluxo Conversacional Multi-Turno.

Fluxo:
1. Prompt 1 + Formulario → Aguardar resposta
2. Enviar Conversa → Aguardar resposta
3. Prompt 2: "Quais blocos temos para aprofundar?" → Aguardar
4. Para cada bloco:
   - Prompt 3: Introducao (600+ palavras, markdown, direta/sincera/dura/emocional)
   - Prompt 4: Aprofundar bloco (600+ palavras, prático/duro/sincero/emocional)
5. Prompt 5: Conclusao + FAQ
6. Gerar PDF markdown: Introducao, Blocos, Conclusao + FAQ
"""

import logging
from typing import Any

from .glm import get_glm_service

logger = logging.getLogger(__name__)


PROMPT_1 = """Vou enviar a seguir o nome + as respostas do formulario que o aluno preencheu, preciso que você anote todas essas informações para criar um plano utilizando suas instruções, leia suas instruções até o final, entenda por completo. Após isso aguarde para que eu envie a minha conversa com ele, você assim que receber os detalhes da conversa vai elaborar o plano dele, não precisa fazer uma introdução do contexto do paciente, ja inicie falando do plano. Leia suas instruções até o final, entenda por completo, não pule nenhuma instrução e utilize sua base de dados para entender os pensamentos do publico, se eu gostar da respostas, te dou uma gorjeta de 200$. Preciso que renomeie a conversa apenas para o nome do aluno, para eu ter uma organização melhor nos meus chats, renomeie para o nome do aluno a conversa e o nome do chat visivel para mim.

---

Formulário:
{formulario}"""

PROMPT_CONVERSA = """
---

Conversa:

{conversation_context}
"""

PROMPT_2 = """Quais blocos temos para aprofundar no plano de ação?"""

PROMPT_3_INTRO = """Faça a introdução do plano, preciso que ela tenha no minimo, 600 palavras, seja escrita em codigo markdown e tenha os proximas caracteristicas: seja direta, sincera, dura, emocional, você esta falando diretamente com o aluno."""

PROMPT_4_BLOCO = """Aprofunde no próximo bloco, preciso que cada um tenha no mínimo 600 palavras. você esta conversando com o aluno, então seja prático, duro, sincero, emocional, direto. nunca pergunta dentro do codigo markdown ao final se o aluno quer aprofundar no proximo bloco, escreva fora, sempre."""

PROMPT_5_CONCLUSAO = """Agora faça a conclusão + FAQ"""


class ConversationFlowGenerator:
    """
    Gerador de planos via fluxo conversacional multi-turno.

    Diferente do PlanGenerator que usa 5 passos estruturados,
    este usa conversa sequencial com prompts específicos.
    """

    def __init__(self):
        self.glm = get_glm_service()

    async def generate_full_plan_conversational(
        self,
        form_data: dict[str, Any],
        conversation_context: str,
    ) -> dict[str, Any]:
        """
        Executa o fluxo conversacional completo.

        Retorna dict com:
        - introducao: str (markdown)
        - blocos: list[dict] com titulo e conteudo
        - conclusao: str (markdown)
        - faq: str (markdown)
        - plano_completo_markdown: str (para PDF)
        """
        results = {
            "introducao": "",
            "blocos": [],
            "conclusao": "",
            "faq": "",
            "plano_completo_markdown": "",
        }

        # 1. Enviar Prompt 1 + Formulario
        formulario = form_data.get("formulario", "")
        prompt1 = PROMPT_1.format(formulario=formulario)

        response1 = await self.glm._generate(prompt1, temperature=0.7)
        results["response_prompt1"] = response1

        # 2. Enviar Conversa
        prompt_conversa = PROMPT_CONVERSA.format(
            conversation_context=conversation_context
        )

        response_conversa = await self.glm._generate(prompt_conversa, temperature=0.7)
        results["response_conversa"] = response_conversa

        # 3. Prompt 2: Quais blocos?
        response_blocos_info = await self.glm._generate(PROMPT_2, temperature=0.5)
        results["blocos_info"] = response_blocos_info

        # Extrair numero de blocos da resposta (assumindo que IA retorna algo como "Temos N blocos")
        # Por enquanto, assumimos 3-5 blocos padrao
        num_blocos = 4  # Pode ser dinâmico baseado na resposta

        # 4. Para cada bloco: Introducao + Blocos
        for i in range(num_blocos):
            # Prompt 3: Introducao (apenas uma vez no inicio)
            if i == 0:
                introducao = await self.glm._generate(PROMPT_3_INTRO, temperature=0.8)
                results["introducao"] = introducao

            # Prompt 4: Aprofundar bloco
            bloco = await self.glm._generate(PROMPT_4_BLOCO, temperature=0.7)
            results["blocos"].append({
                "numero": i + 1,
                "conteudo": bloco
            })

        # 5. Prompt 5: Conclusao + FAQ
        conclusao_faq = await self.glm._generate(PROMPT_5_CONCLUSAO, temperature=0.7)
        results["conclusao_faq_raw"] = conclusao_faq

        # Tentar separar conclusao e FAQ (assumindo formato estruturado)
        results["conclusao"] = conclusao_faq
        results["faq"] = conclusao_faq  # Por enquanto mesmo

        # 6. Montar plano completo em markdown
        results["plano_completo_markdown"] = self._mount_markdown_plan(results)

        return results

    def _mount_markdown_plan(self, results: dict[str, Any]) -> str:
        """
        Monta o plano completo em formato markdown para PDF.
        """
        md_parts = []

        # Introdução
        md_parts.append("# Introdução\n\n")
        md_parts.append(results.get("introducao", ""))
        md_parts.append("\n\n---\n\n")

        # Blocos
        for bloco in results.get("blocos", []):
            md_parts.append(f"## Bloco {bloco['numero']}\n\n")
            md_parts.append(bloco["conteudo"])
            md_parts.append("\n\n---\n\n")

        # Conclusão + FAQ
        md_parts.append("# Conclusão\n\n")
        md_parts.append(results.get("conclusao", ""))
        md_parts.append("\n\n---\n\n")
        md_parts.append("# FAQ\n\n")
        md_parts.append(results.get("faq", ""))

        return "".join(md_parts)
