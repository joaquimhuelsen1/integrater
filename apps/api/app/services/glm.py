"""
Serviço de integração com Zhipu AI (GLM 4.7).
- Geração de estrutura de plano de vendas
- Geração de introdução de plano
- Aprofundamento de blocos do plano
- Geração de resumo de plano
- Geração de FAQ de plano

Usa o SDK zhipuai com retry e exponential backoff.
"""

import asyncio
import json
import re
from typing import Any
from zhipuai import ZhipuAI
from zhipuai._client import NotGiven, NOT_GIVEN
from ..config import get_settings


settings = get_settings()


# Prompts padrão para geração de planos de vendas
DEFAULT_PLAN_PROMPTS = {
    "structure": """You are an expert sales consultant. Generate a comprehensive sales plan structure for the following context.

Context:
{context}

Rules:
- Output ONLY valid JSON, no markdown, no explanations
- Structure must include: phases, milestones, deliverables, timeline
- Each phase should have: title, description, duration_weeks, key_activities
- Timeline should be realistic and achievable

JSON format:
{{
  "title": "Sales Plan Title",
  "description": "Brief description",
  "total_duration_weeks": 12,
  "phases": [
    {{
      "title": "Phase 1",
      "description": "Description",
      "duration_weeks": 4,
      "key_activities": ["activity 1", "activity 2"]
    }}
  ]
}}

Generate the structure:""",

    "introduction": """You are an expert sales consultant. Write a compelling introduction for the following sales plan.

Plan structure:
{plan_structure}

Context:
{context}

Rules:
- Output ONLY valid JSON, no markdown, no explanations
- Introduction should be: professional, motivating, clear
- Include: executive_summary, objectives, expected_outcomes

JSON format:
{{
  "executive_summary": "2-3 sentences overview",
  "objectives": ["objective 1", "objective 2"],
  "expected_outcomes": ["outcome 1", "outcome 2"]
}}

Generate the introduction:""",

    "deepen_block": """You are an expert sales consultant. Expand on a specific block of the sales plan with more detail.

Plan structure:
{plan_structure}

Block to deepen:
{block_data}

Context:
{context}

Rules:
- Output ONLY valid JSON, no markdown, no explanations
- Add actionable details, resources needed, potential risks
- Include: detailed_steps, resources, risks, mitigation_strategies

JSON format:
{{
  "detailed_steps": ["step 1", "step 2"],
  "resources": ["resource 1", "resource 2"],
  "risks": ["risk 1"],
  "mitigation_strategies": ["strategy 1"]
}}

Expand the block:""",

    "summary": """You are an expert sales consultant. Create a concise summary of the sales plan.

Plan structure:
{plan_structure}

Introduction:
{introduction}

Context:
{context}

Rules:
- Output ONLY valid JSON, no markdown, no explanations
- Summary should be: clear, concise, executive-friendly
- Include: key_highlights, investment_summary, roi_projection

JSON format:
{{
  "key_highlights": ["highlight 1", "highlight 2"],
  "investment_summary": "brief investment overview",
  "roi_projection": "expected ROI description"
}}

Generate the summary:""",

    "faq": """You are an expert sales consultant. Generate a FAQ for the sales plan.

Plan structure:
{plan_structure}

Context:
{context}

Rules:
- Output ONLY valid JSON, no markdown, no explanations
- FAQ should address: common questions, objections, clarifications
- Include: question, answer pairs

JSON format:
{{
  "faqs": [
    {{
      "question": "Common question?",
      "answer": "Clear and concise answer"
    }}
  ]
}}

Generate the FAQ:"""
}


def _parse_json_response(response_text: str) -> dict[str, Any]:
    """
    Parse JSON response, removing markdown code blocks if present.
    """
    if not response_text:
        raise ValueError("Empty response from GLM")

    # Remove markdown code blocks (```json ... ```)
    cleaned = response_text.strip()

    # Pattern to match ```json or ``` followed by content and closing ```
    pattern = r"```(?:json)?\s*\n?([\s\S]*?)\n?```"
    match = re.search(pattern, cleaned)

    if match:
        cleaned = match.group(1)

    # Try to find JSON object if still surrounded by text
    json_start = cleaned.find("{")
    json_end = cleaned.rfind("}")

    if json_start != -1 and json_end != -1 and json_end > json_start:
        cleaned = cleaned[json_start:json_end + 1]

    return json.loads(cleaned)


class GLMService:
    def __init__(self):
        self.client = ZhipuAI(api_key=settings.zhipu_api_key)
        self.model = settings.zhipu_model
        self.timeout = settings.zhipu_timeout
        self.max_retries = settings.zhipu_max_retries

    def _generate_sync(
        self,
        prompt: str,
        temperature: float = 0.7,
        max_tokens: int | None = None
    ) -> str:
        """Chamada síncrona ao GLM com retry.

        Nota: max_tokens usa None para compatibilidade, mas SDK espera int | NotGiven.
        Internamente convertemos None para NOT_GIVEN.
        """
        import time

        last_error = None

        # Converter None para NOT_GIVEN (compativel com tipo do SDK)
        max_tokens_param: int | NotGiven = max_tokens if max_tokens is not None else NOT_GIVEN

        for attempt in range(self.max_retries):
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "user", "content": prompt}
                    ],
                    temperature=temperature,
                    max_tokens=max_tokens_param,
                    stream=False  # Garante retorno Completion, nao StreamResponse
                )
                # content e Optional[str], garantir retorno de str
                content = response.choices[0].message.content
                if content is None:
                    raise ValueError("GLM retornou resposta vazia (content=None)")
                return content

            except Exception as e:
                last_error = e
                if attempt < self.max_retries - 1:
                    # Exponential backoff: 2^attempt seconds
                    wait_time = 2 ** attempt
                    time.sleep(wait_time)
                    continue
                raise RuntimeError(f"GLM service failed after {self.max_retries} attempts: {e}") from e

        # Esta linha nunca deve ser alcancada, mas mypy precisa do return
        raise RuntimeError("Unexpected state in _generate_sync")

    async def _generate(
        self,
        prompt: str,
        temperature: float = 0.7,
        max_tokens: int | None = None
    ) -> str:
        """Chamada assíncrona ao GLM (via thread pool)."""
        return await asyncio.to_thread(
            self._generate_sync,
            prompt,
            temperature,
            max_tokens
        )

    async def generate_plan_structure(
        self,
        context: str,
        custom_prompt: str | None = None
    ) -> dict[str, Any]:
        """
        Passo 1: Gerar estrutura do plano de vendas.
        Retorna dict com title, description, total_duration_weeks, phases.
        """
        template = custom_prompt or DEFAULT_PLAN_PROMPTS["structure"]
        prompt = template.format(context=context)

        try:
            result = await self._generate(prompt, temperature=0.7)
            return _parse_json_response(result)
        except Exception as e:
            print(f"Erro ao gerar estrutura do plano: {e}")
            raise

    async def generate_plan_introduction(
        self,
        plan_structure: dict[str, Any],
        context: str,
        custom_prompt: str | None = None
    ) -> dict[str, Any]:
        """
        Passo 2: Gerar introdução do plano.
        Retorna dict com executive_summary, objectives, expected_outcomes.
        """
        template = custom_prompt or DEFAULT_PLAN_PROMPTS["introduction"]
        plan_json = json.dumps(plan_structure, ensure_ascii=False)
        prompt = template.format(plan_structure=plan_json, context=context)

        try:
            result = await self._generate(prompt, temperature=0.8)
            return _parse_json_response(result)
        except Exception as e:
            print(f"Erro ao gerar introdução do plano: {e}")
            raise

    async def deepen_plan_block(
        self,
        plan_structure: dict[str, Any],
        block_data: dict[str, Any],
        context: str,
        custom_prompt: str | None = None
    ) -> dict[str, Any]:
        """
        Passo 3: Aprofundar um bloco específico do plano.
        Retorna dict com detailed_steps, resources, risks, mitigation_strategies.
        """
        template = custom_prompt or DEFAULT_PLAN_PROMPTS["deepen_block"]
        plan_json = json.dumps(plan_structure, ensure_ascii=False)
        block_json = json.dumps(block_data, ensure_ascii=False)
        prompt = template.format(
            plan_structure=plan_json,
            block_data=block_json,
            context=context
        )

        try:
            result = await self._generate(prompt, temperature=0.6)
            return _parse_json_response(result)
        except Exception as e:
            print(f"Erro ao aprofundar bloco do plano: {e}")
            raise

    async def generate_plan_summary(
        self,
        plan_structure: dict[str, Any],
        introduction: dict[str, Any],
        context: str,
        custom_prompt: str | None = None
    ) -> dict[str, Any]:
        """
        Passo 4: Gerar resumo executivo do plano.
        Retorna dict com key_highlights, investment_summary, roi_projection.
        """
        template = custom_prompt or DEFAULT_PLAN_PROMPTS["summary"]
        plan_json = json.dumps(plan_structure, ensure_ascii=False)
        intro_json = json.dumps(introduction, ensure_ascii=False)
        prompt = template.format(
            plan_structure=plan_json,
            introduction=intro_json,
            context=context
        )

        try:
            result = await self._generate(prompt, temperature=0.5)
            return _parse_json_response(result)
        except Exception as e:
            print(f"Erro ao gerar resumo do plano: {e}")
            raise

    async def generate_plan_faq(
        self,
        plan_structure: dict[str, Any],
        context: str,
        custom_prompt: str | None = None
    ) -> dict[str, Any]:
        """
        Passo 5: Gerar FAQ do plano.
        Retorna dict com faqs (lista de {question, answer}).
        """
        template = custom_prompt or DEFAULT_PLAN_PROMPTS["faq"]
        plan_json = json.dumps(plan_structure, ensure_ascii=False)
        prompt = template.format(plan_structure=plan_json, context=context)

        try:
            result = await self._generate(prompt, temperature=0.6)
            return _parse_json_response(result)
        except Exception as e:
            print(f"Erro ao gerar FAQ do plano: {e}")
            raise

    async def _generate_with_history(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int | None = None
    ) -> str:
        """
        Chamada assincrona ao GLM com historico de conversa.

        Args:
            messages: Lista de mensagens no formato [{"role": "user|assistant|system", "content": "..."}]
            temperature: Temperatura para geracao
            max_tokens: Maximo de tokens (opcional)

        Returns:
            Conteudo da resposta como string
        """
        import time

        last_error = None
        max_tokens_param: int | NotGiven = max_tokens if max_tokens is not None else NOT_GIVEN

        for attempt in range(self.max_retries):
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens_param,
                    stream=False
                )
                content = response.choices[0].message.content
                if content is None:
                    raise ValueError("GLM retornou resposta vazia (content=None)")
                return content

            except Exception as e:
                last_error = e
                if attempt < self.max_retries - 1:
                    wait_time = 2 ** attempt
                    time.sleep(wait_time)
                    continue
                raise RuntimeError(f"GLM service failed after {self.max_retries} attempts: {e}") from e

        raise RuntimeError("Unexpected state in _generate_with_history")


# Singleton
_glm_service: GLMService | None = None


def get_glm_service() -> GLMService:
    global _glm_service
    if _glm_service is None:
        _glm_service = GLMService()
    return _glm_service
