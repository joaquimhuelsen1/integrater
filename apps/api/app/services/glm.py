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
import logging
import re
import uuid
from typing import Any
from zhipuai import ZhipuAI
from zhipuai._client import NotGiven, NOT_GIVEN
from ..config import get_settings


settings = get_settings()
logger = logging.getLogger(__name__)


# System prompt fixo do Ethan Heyes
ETHAN_HEYES_SYSTEM_PROMPT = """
## 1. Persona

Meu público-alvo são homens com mais de 30 anos. Eles estão em um estado emocional delicado e ansiosos para reconquistar suas ex-mulheres, e procuram soluções claras, práticas e personalizadas.

---

## 2. Tarefa
Como um especialista em psicologia e terapia de relacionamentos com +15 anos de atuação em recuperação de relacionamentos, especificamente reconquista masculina, onde o homem quer reconquistar sua ex mulher, você é Ethan Heyes, um plano baseado nas informações fornecidas, para ajudar o paciente a reconquistar sua ex-mulher.

Utilize uma abordagem que equilibre empatia com orientação, não precisa ter orientações práticas como exemplos de mensagens, mas pode citar de forma mais generica, usando uma linguagem casual e próxima, como a de um amigo.

Seu objetivo é desenvovler um plano que faça sentido para o paciente, ele ainda não pensou e nem tentou desse jeito, isso é realmente importante, porque o paciente precisa ter esse senso de novo, e tambem deixar um gostinho de quero mais, para o paciente querer saber mais afundo do plano.

Vou anexar uma analise do publico-alvo na sua base de dados, leia com atenção.

---

## Etapas para a Resposta

### Leitura e Análise do Caso

- Vou enviar a conversa com meu paciente.
- Leia com atenção e destrinche cada detalhe para entender profundamente o cenário emocional, psicológico e prático do paciente.

## Como deve ser a resposta.

Seja inovador, não reforçar o que ele já está fazendo, falar somente o que ele precisa fazer, o paciente não quer escutar mais do mesmo, ele quer escutar ideias novas, mas sempre pense com base nos principios de reconquista.

Evite usar termos técnicos como "plano de ação" ou "Com base na nossa metodologia".

Imagine que você está conversando com o paciente.

A resposta deve ser totalmente personalizada ao contexto do paciente, evitando generalizações.

Mostre sempre o lado positivo, mesmo nas piores situações, e ofereça soluções viáveis baseadas na metodologia da sua base de dados.
"""


# Prompts padrão para geração de planos de relacionamento
DEFAULT_PLAN_PROMPTS = {
    "structure": """{system_prompt}

## Informações do Paciente

Formulário:
{form_data}

Conversa:
{conversation_context}

## Tarefa

Com base nas informações acima, gere a ESTRUTURA do plano de reconquista em formato JSON.

Regras:
- Output SOMENTE JSON válido, sem markdown, sem explicações
- Seja inovador, não sugira o que ele já está fazendo
- A estrutura deve ter: fases, objetivos, psychological_shifts (mudanças psicológicas)
- Cada fase deve ter: titulo, descricao, duracao_semanas, mudancas_psicologicas, acoes_chave

JSON format:
{{
  "titulo": "Título do Plano",
  "descricao": "Descrição breve e personalizada",
  "duracao_total_semanas": 12,
  "fases": [
    {{
      "titulo": "Fase 1",
      "descricao": "Descrição personalizada",
      "duracao_semanas": 4,
      "mudancas_psicologicas": ["mudança 1", "mudança 2"],
      "acoes_chave": ["ação 1", "ação 2"]
    }}
  ]
}}

Gere a estrutura:""",

    "introduction": """{system_prompt}

## Informações do Paciente

Formulário:
{form_data}

Conversa:
{conversation_context}

## Estrutura do Plano
{plan_structure}

## Tarefa

Escreva uma INTRODUÇÃO personalizada para este plano de reconquista.

Regras:
- Output SOMENTE JSON válido, sem markdown
- Use linguagem casual, como um amigo conversando
- Seja empático mas direto
- Inclua: resumo_executivo, objetivos, resultados_esperados

JSON format:
{{
  "resumo_executivo": "2-3 frases de overview em linguagem casual",
  "objetivos": ["objetivo 1", "objetivo 2"],
  "resultados_esperados": ["resultado 1", "resultado 2"]
}}

Gere a introdução:""",

    "deepen_block": """{system_prompt}

## Informações do Paciente

Formulário:
{form_data}

Conversa:
{conversation_context}

## Estrutura do Plano
{plan_structure}

## Bloco para Aprofundar
{block_data}

## Tarefa

Aprofunde este bloco específico com mais detalhes práticos e psicológicos.

Regras:
- Output SOMENTE JSON válido, sem markdown
- Adicione detalhes acionáveis, mudanças internas necessárias
- Inclua: passos_detalhados, mudancas_internas, sinais_de_progresso

JSON format:
{{
  "passos_detalhados": ["passo 1", "passo 2"],
  "mudancas_internas": ["mudança psicológica 1", "mudança 2"],
  "sinais_de_progresso": ["sinal 1", "sinal 2"],
  "riscos": ["risco 1"],
  "estrategias": ["estratégia 1"]
}}

Aprofunde o bloco:""",

    "summary": """{system_prompt}

## Informações do Paciente

Formulário:
{form_data}

Conversa:
{conversation_context}

## Estrutura do Plano
{plan_structure}

## Introdução
{introduction}

## Tarefa

Crie um RESUMO executivo do plano de reconquista.

Regras:
- Output SOMENTE JSON válido, sem markdown
- Seja claro, conciso, motivador
- Inclua: destaques_principais, mudanca_necessaria, proximos_passos

JSON format:
{{
  "destaques_principais": ["destaque 1", "destaque 2"],
  "mudanca_necessaria": "descrição da transformação necessária",
  "proximos_passos": ["passo 1", "passo 2"]
}}

Gere o resumo:""",

    "faq": """{system_prompt}

## Informações do Paciente

Formulário:
{form_data}

Conversa:
{conversation_context}

## Estrutura do Plano
{plan_structure}

## Tarefa

Gere um FAQ personalizado para este plano de reconquista.

Regras:
- Output SOMENTE JSON válido, sem markdown
- FAQ deve abordar: dúvidas comuns, medos, objeções internas
- Inclua pares de pergunta e resposta

JSON format:
{{
  "faqs": [
    {{
      "pergunta": "Pergunta comum?",
      "resposta": "Resposta clara e empática"
    }}
  ]
}}

Gere o FAQ:"""
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

        # Gerar request_id unico para evitar dedupe pela API
        request_id = str(uuid.uuid4())

        for attempt in range(self.max_retries):
            try:
                logger.info(f"GLM API Request: model={self.model}, request_id={request_id}, temp={temperature}, attempt={attempt + 1}/{self.max_retries}")

                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "user", "content": prompt}
                    ],
                    temperature=temperature,
                    max_tokens=max_tokens_param,
                    stream=False,  # Garante retorno Completion, nao StreamResponse
                    request_id=request_id  # ID unico para evitar dedupe
                )

                logger.info(f"GLM API Response: request_id={request_id}, status=success")
                # content e Optional[str], garantir retorno de str
                content = response.choices[0].message.content
                if content is None:
                    raise ValueError("GLM retornou resposta vazia (content=None)")
                return content

            except Exception as e:
                last_error = e

                # Logging detalhado do erro
                logger.error(
                    f"GLM API Error (attempt {attempt + 1}/{self.max_retries}): "
                    f"type={type(e).__name__}, "
                    f"error={str(e)}, "
                    f"model={self.model}, "
                    f"request_id={request_id}"
                )

                # Tentar extrair detalhes do erro se for APIError
                if hasattr(e, 'status_code'):
                    logger.error(f"GLM API status_code={e.status_code}")
                if hasattr(e, 'body'):
                    logger.error(f"GLM API error_body={e.body}")

                if attempt < self.max_retries - 1:
                    # Exponential backoff: 2^attempt seconds
                    wait_time = 2 ** attempt
                    logger.warning(f"GLM API retrying in {wait_time}s...")
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
        form_data: dict[str, Any],
        conversation_context: str,
        custom_prompt: str | None = None
    ) -> dict[str, Any]:
        """
        Passo 1: Gerar estrutura do plano de reconquista.
        Retorna dict com titulo, descricao, duracao_total_semanas, fases.
        """
        template = custom_prompt or DEFAULT_PLAN_PROMPTS["structure"]
        form_data_str = json.dumps(form_data, ensure_ascii=False)
        prompt = template.format(
            system_prompt=ETHAN_HEYES_SYSTEM_PROMPT,
            form_data=form_data_str,
            conversation_context=conversation_context or "Nenhuma conversa adicional."
        )

        try:
            result = await self._generate(prompt, temperature=0.7)
            return _parse_json_response(result)
        except Exception as e:
            print(f"Erro ao gerar estrutura do plano: {e}")
            raise

    async def generate_plan_introduction(
        self,
        form_data: dict[str, Any],
        conversation_context: str,
        plan_structure: dict[str, Any],
        custom_prompt: str | None = None
    ) -> dict[str, Any]:
        """
        Passo 2: Gerar introdução do plano.
        Retorna dict com resumo_executivo, objetivos, resultados_esperados.
        """
        template = custom_prompt or DEFAULT_PLAN_PROMPTS["introduction"]
        form_data_str = json.dumps(form_data, ensure_ascii=False)
        plan_json = json.dumps(plan_structure, ensure_ascii=False)
        prompt = template.format(
            system_prompt=ETHAN_HEYES_SYSTEM_PROMPT,
            form_data=form_data_str,
            conversation_context=conversation_context or "Nenhuma conversa adicional.",
            plan_structure=plan_json
        )

        try:
            result = await self._generate(prompt, temperature=0.8)
            return _parse_json_response(result)
        except Exception as e:
            print(f"Erro ao gerar introdução do plano: {e}")
            raise

    async def deepen_plan_block(
        self,
        form_data: dict[str, Any],
        conversation_context: str,
        plan_structure: dict[str, Any],
        block_data: dict[str, Any],
        custom_prompt: str | None = None
    ) -> dict[str, Any]:
        """
        Passo 3: Aprofundar um bloco específico do plano.
        Retorna dict com passos_detalhados, mudancas_internas, sinais_de_progresso.
        """
        template = custom_prompt or DEFAULT_PLAN_PROMPTS["deepen_block"]
        form_data_str = json.dumps(form_data, ensure_ascii=False)
        plan_json = json.dumps(plan_structure, ensure_ascii=False)
        block_json = json.dumps(block_data, ensure_ascii=False)
        prompt = template.format(
            system_prompt=ETHAN_HEYES_SYSTEM_PROMPT,
            form_data=form_data_str,
            conversation_context=conversation_context or "Nenhuma conversa adicional.",
            plan_structure=plan_json,
            block_data=block_json
        )

        try:
            result = await self._generate(prompt, temperature=0.6)
            return _parse_json_response(result)
        except Exception as e:
            print(f"Erro ao aprofundar bloco do plano: {e}")
            raise

    async def generate_plan_summary(
        self,
        form_data: dict[str, Any],
        conversation_context: str,
        plan_structure: dict[str, Any],
        introduction: dict[str, Any],
        custom_prompt: str | None = None
    ) -> dict[str, Any]:
        """
        Passo 4: Gerar resumo executivo do plano.
        Retorna dict com destaques_principais, mudanca_necessaria, proximos_passos.
        """
        template = custom_prompt or DEFAULT_PLAN_PROMPTS["summary"]
        form_data_str = json.dumps(form_data, ensure_ascii=False)
        plan_json = json.dumps(plan_structure, ensure_ascii=False)
        intro_json = json.dumps(introduction, ensure_ascii=False)
        prompt = template.format(
            system_prompt=ETHAN_HEYES_SYSTEM_PROMPT,
            form_data=form_data_str,
            conversation_context=conversation_context or "Nenhuma conversa adicional.",
            plan_structure=plan_json,
            introduction=intro_json
        )

        try:
            result = await self._generate(prompt, temperature=0.5)
            return _parse_json_response(result)
        except Exception as e:
            print(f"Erro ao gerar resumo do plano: {e}")
            raise

    async def generate_plan_faq(
        self,
        form_data: dict[str, Any],
        conversation_context: str,
        plan_structure: dict[str, Any],
        custom_prompt: str | None = None
    ) -> dict[str, Any]:
        """
        Passo 5: Gerar FAQ do plano.
        Retorna dict com faqs (lista de {pergunta, resposta}).
        """
        template = custom_prompt or DEFAULT_PLAN_PROMPTS["faq"]
        form_data_str = json.dumps(form_data, ensure_ascii=False)
        plan_json = json.dumps(plan_structure, ensure_ascii=False)
        prompt = template.format(
            system_prompt=ETHAN_HEYES_SYSTEM_PROMPT,
            form_data=form_data_str,
            conversation_context=conversation_context or "Nenhuma conversa adicional.",
            plan_structure=plan_json
        )

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

        # Gerar request_id unico para evitar dedupe pela API
        request_id = str(uuid.uuid4())

        for attempt in range(self.max_retries):
            try:
                logger.info(f"GLM API Request (history): model={self.model}, request_id={request_id}, temp={temperature}, attempt={attempt + 1}/{self.max_retries}")

                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens_param,
                    stream=False,
                    request_id=request_id  # ID unico para evitar dedupe
                )

                logger.info(f"GLM API Response (history): request_id={request_id}, status=success")

                content = response.choices[0].message.content
                if content is None:
                    raise ValueError("GLM retornou resposta vazia (content=None)")
                return content

            except Exception as e:
                last_error = e

                # Logging detalhado do erro
                logger.error(
                    f"GLM API Error (history, attempt {attempt + 1}/{self.max_retries}): "
                    f"type={type(e).__name__}, "
                    f"error={str(e)}, "
                    f"model={self.model}, "
                    f"request_id={request_id}"
                )

                # Tentar extrair detalhes do erro se for APIError
                if hasattr(e, 'status_code'):
                    logger.error(f"GLM API status_code={e.status_code}")
                if hasattr(e, 'body'):
                    logger.error(f"GLM API error_body={e.body}")

                if attempt < self.max_retries - 1:
                    wait_time = 2 ** attempt
                    logger.warning(f"GLM API retrying in {wait_time}s...")
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
