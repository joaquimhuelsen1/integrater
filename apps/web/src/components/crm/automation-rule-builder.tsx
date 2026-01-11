"use client"

import { useState, useEffect } from "react"
import { X, Loader2, Plus, Trash2 } from "lucide-react"
import { apiFetch } from "@/lib/api"

// Tipos de triggers disponiveis
const TRIGGER_TYPES = [
  { value: "message_received", label: "Mensagem recebida" },
  { value: "stage_changed", label: "Estagio alterado" },
  { value: "time_in_stage", label: "Tempo no estagio" },
  { value: "field_changed", label: "Campo alterado" },
  { value: "deal_created", label: "Deal criado" },
  { value: "message_sent", label: "Mensagem enviada" },
] as const

// Tipos de actions disponiveis
const ACTION_TYPES = [
  { value: "move_stage", label: "Mover para estagio" },
  { value: "update_field", label: "Atualizar campo" },
  { value: "create_task", label: "Criar tarefa" },
  { value: "send_notification", label: "Enviar notificacao" },
  { value: "add_tag", label: "Adicionar tag" },
  { value: "send_message", label: "Enviar mensagem" },
] as const

export type TriggerType = typeof TRIGGER_TYPES[number]["value"]
export type ActionType = typeof ACTION_TYPES[number]["value"]

export interface AutomationCondition {
  id: string
  field: string
  operator: "equals" | "contains" | "greater_than" | "less_than"
  value: string
}

interface Stage {
  id: string
  name: string
  pipeline_id: string
}

interface Pipeline {
  id: string
  name: string
}

export interface AutomationRule {
  id: string
  name: string
  description: string | null
  trigger_type: TriggerType
  trigger_config: Record<string, unknown>
  conditions: AutomationCondition[]
  action_type: ActionType
  action_config: Record<string, unknown>
  is_active: boolean
  pipeline_id: string | null
}

interface AutomationRuleBuilderProps {
  rule: AutomationRule | null // null = nova regra
  pipelineId?: string
  workspaceId: string // OBRIGATORIO - correcao do bug
  onClose: () => void
  onSave: () => void
}

// Funcao para resolver placeholders com dados de exemplo
const resolvePreviewPlaceholders = (text: string): string => {
  const examples: Record<string, string> = {
    '{nome}': 'Joao',
    '{primeiro_nome}': 'Joao',
    '{nome_completo}': 'Joao Silva',
    '{deal}': 'Proposta Comercial',
    '{deal_title}': 'Proposta Comercial',
    '{valor}': 'R$ 5.000,00',
    '{deal_value}': 'R$ 5.000,00',
    '{canal}': 'SMS',
    '{email}': 'joao@exemplo.com',
    '{telefone}': '+55 11 99999-0000',
  }

  let result = text
  for (const [placeholder, value] of Object.entries(examples)) {
    result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'gi'), value)
  }
  return result
}

export function AutomationRuleBuilder({
  rule,
  pipelineId,
  workspaceId,
  onClose,
  onSave,
}: AutomationRuleBuilderProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState(rule?.name || "")
  const [description, setDescription] = useState(rule?.description || "")
  const [triggerType, setTriggerType] = useState<TriggerType>(rule?.trigger_type || "message_received")
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(rule?.trigger_config || {})
  const [conditions, setConditions] = useState<AutomationCondition[]>(rule?.conditions || [])
  const [actionType, setActionType] = useState<ActionType>(rule?.action_type || "move_stage")
  const [actionConfig, setActionConfig] = useState<Record<string, unknown>>(rule?.action_config || {})

  // Data para selects
  const [stages, setStages] = useState<Stage[]>([])
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>(pipelineId || rule?.pipeline_id || "")
  const [templates, setTemplates] = useState<Array<{
    id: string
    title: string
    content: string
    channel_hint: string | null
    subject: string | null
  }>>([])

  const isNew = !rule

  // Carrega pipelines e stages - CORRIGIDO: agora usa workspace_id
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      try {
        // CORRECAO: Carregar pipelines COM workspace_id
        const pipelinesRes = await apiFetch(`/pipelines?workspace_id=${workspaceId}`)
        if (pipelinesRes.ok) {
          const data = await pipelinesRes.json()
          setPipelines(data)
          if (!selectedPipelineId && data.length > 0) {
            setSelectedPipelineId(data[0].id)
          }
        }
      } catch (err) {
        console.error("Erro ao carregar dados:", err)
      } finally {
        setIsLoading(false)
      }
    }
    loadData()

    // Carregar templates
    const loadTemplates = async () => {
      try {
        const response = await apiFetch("/templates")
        if (response.ok) {
          const data = await response.json()
          setTemplates(data)
        }
      } catch (error) {
        console.error("Erro ao carregar templates:", error)
      }
    }
    loadTemplates()
  }, [workspaceId, selectedPipelineId])

  // Carrega stages quando pipeline muda
  useEffect(() => {
    const loadStages = async () => {
      if (!selectedPipelineId) return
      try {
        const stagesRes = await apiFetch(`/pipelines/${selectedPipelineId}/stages`)
        if (stagesRes.ok) {
          const data = await stagesRes.json()
          setStages(data)
        }
      } catch (err) {
        console.error("Erro ao carregar stages:", err)
      }
    }
    loadStages()
  }, [selectedPipelineId])

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Nome e obrigatorio")
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        trigger_type: triggerType,
        trigger_config: triggerConfig,
        conditions,
        action_type: actionType,
        action_config: actionConfig,
        pipeline_id: selectedPipelineId || null,
        is_active: rule?.is_active ?? true,
      }

      const url = isNew ? "/automations" : `/automations/${rule.id}`
      const method = isNew ? "POST" : "PATCH"

      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        onSave()
      } else {
        const data = await res.json()
        setError(data.detail || "Erro ao salvar regra")
      }
    } catch (err) {
      console.error("Erro ao salvar:", err)
      setError("Erro ao salvar regra")
    } finally {
      setIsSaving(false)
    }
  }

  // Adiciona uma condicao
  const addCondition = () => {
    setConditions([
      ...conditions,
      {
        id: crypto.randomUUID(),
        field: "",
        operator: "equals",
        value: "",
      },
    ])
  }

  // Remove uma condicao
  const removeCondition = (id: string) => {
    setConditions(conditions.filter((c) => c.id !== id))
  }

  // Atualiza uma condicao
  const updateCondition = (id: string, updates: Partial<AutomationCondition>) => {
    setConditions(
      conditions.map((c) => (c.id === id ? { ...c, ...updates } : c))
    )
  }

  // Renderiza config do trigger baseado no tipo
  const renderTriggerConfig = () => {
    switch (triggerType) {
      case "stage_changed":
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">De estagio (opcional)</label>
              <select
                value={(triggerConfig.from_stage_id as string) || ""}
                onChange={(e) =>
                  setTriggerConfig({ ...triggerConfig, from_stage_id: e.target.value || null })
                }
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="">Qualquer estagio</option>
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Para estagio (opcional)</label>
              <select
                value={(triggerConfig.to_stage_id as string) || ""}
                onChange={(e) =>
                  setTriggerConfig({ ...triggerConfig, to_stage_id: e.target.value || null })
                }
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="">Qualquer estagio</option>
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )

      case "time_in_stage":
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Estagio</label>
              <select
                value={(triggerConfig.stage_id as string) || ""}
                onChange={(e) =>
                  setTriggerConfig({ ...triggerConfig, stage_id: e.target.value })
                }
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="">Selecione...</option>
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Tempo (horas)</label>
              <input
                type="number"
                min="1"
                value={(triggerConfig.hours as number) || ""}
                onChange={(e) =>
                  setTriggerConfig({ ...triggerConfig, hours: parseInt(e.target.value) || 0 })
                }
                placeholder="Ex: 24"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
          </div>
        )

      case "message_received":
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Contem palavra-chave (opcional)</label>
              <input
                type="text"
                value={(triggerConfig.keyword as string) || ""}
                onChange={(e) =>
                  setTriggerConfig({ ...triggerConfig, keyword: e.target.value || null })
                }
                placeholder="Ex: orcamento, preco"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Canal (opcional)</label>
              <select
                value={(triggerConfig.channel as string) || ""}
                onChange={(e) =>
                  setTriggerConfig({ ...triggerConfig, channel: e.target.value || null })
                }
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="">Todos os canais</option>
                <option value="telegram">Telegram</option>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
              </select>
            </div>
          </div>
        )

      case "message_sent":
        return (
          <div className="space-y-3 mt-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
            <p className="text-sm font-medium">Filtros do Trigger</p>

            {/* Dropdown de Template */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Quando template especifico for usado (opcional)
              </label>
              <select
                value={(triggerConfig.template_id as string) || ""}
                onChange={(e) => setTriggerConfig({
                  ...triggerConfig,
                  template_id: e.target.value || null
                })}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="">Qualquer mensagem (sem filtro)</option>
                {templates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.title} {template.channel_hint ? `(${template.channel_hint})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Dropdown de Canal */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Via canal (opcional)
              </label>
              <select
                value={(triggerConfig.channel as string) || ""}
                onChange={(e) => setTriggerConfig({
                  ...triggerConfig,
                  channel: e.target.value || null
                })}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="">Qualquer canal</option>
                <option value="email">Email</option>
                <option value="openphone_sms">SMS (OpenPhone)</option>
                <option value="telegram">Telegram</option>
              </select>
            </div>
          </div>
        )

      case "field_changed":
        return (
          <div>
            <label className="block text-sm font-medium mb-1">Nome do campo</label>
            <input
              type="text"
              value={(triggerConfig.field_name as string) || ""}
              onChange={(e) =>
                setTriggerConfig({ ...triggerConfig, field_name: e.target.value })
              }
              placeholder="Ex: status, prioridade"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>
        )

      case "deal_created":
        return (
          <div className="text-sm text-zinc-500 italic">
            Dispara quando um novo deal e criado no pipeline selecionado.
          </div>
        )

      default:
        return null
    }
  }

  // Renderiza config da action baseado no tipo
  const renderActionConfig = () => {
    switch (actionType) {
      case "move_stage":
        return (
          <div>
            <label className="block text-sm font-medium mb-1">Mover para estagio</label>
            <select
              value={(actionConfig.target_stage_id as string) || ""}
              onChange={(e) =>
                setActionConfig({ ...actionConfig, target_stage_id: e.target.value })
              }
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="">Selecione...</option>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </div>
        )

      case "update_field":
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Campo</label>
              <input
                type="text"
                value={(actionConfig.field_name as string) || ""}
                onChange={(e) =>
                  setActionConfig({ ...actionConfig, field_name: e.target.value })
                }
                placeholder="Ex: prioridade"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Valor</label>
              <input
                type="text"
                value={(actionConfig.field_value as string) || ""}
                onChange={(e) =>
                  setActionConfig({ ...actionConfig, field_value: e.target.value })
                }
                placeholder="Ex: alta"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
          </div>
        )

      case "create_task":
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Titulo da tarefa</label>
              <input
                type="text"
                value={(actionConfig.task_title as string) || ""}
                onChange={(e) =>
                  setActionConfig({ ...actionConfig, task_title: e.target.value })
                }
                placeholder="Ex: Ligar para cliente"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Prazo (dias)</label>
              <input
                type="number"
                min="1"
                value={(actionConfig.due_days as number) || ""}
                onChange={(e) =>
                  setActionConfig({ ...actionConfig, due_days: parseInt(e.target.value) || 1 })
                }
                placeholder="Ex: 3"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
          </div>
        )

      case "send_notification":
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Tipo</label>
              <select
                value={(actionConfig.notification_type as string) || "email"}
                onChange={(e) =>
                  setActionConfig({ ...actionConfig, notification_type: e.target.value })
                }
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="email">Email</option>
                <option value="webhook">Webhook</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                {(actionConfig.notification_type as string) === "webhook" ? "URL" : "Email"}
              </label>
              <input
                type="text"
                value={(actionConfig.target as string) || ""}
                onChange={(e) =>
                  setActionConfig({ ...actionConfig, target: e.target.value })
                }
                placeholder={(actionConfig.notification_type as string) === "webhook" ? "https://..." : "email@exemplo.com"}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Mensagem</label>
              <textarea
                value={(actionConfig.message as string) || ""}
                onChange={(e) =>
                  setActionConfig({ ...actionConfig, message: e.target.value })
                }
                placeholder="Mensagem da notificacao..."
                rows={3}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
          </div>
        )

      case "add_tag":
        return (
          <div>
            <label className="block text-sm font-medium mb-1">Nome da tag</label>
            <input
              type="text"
              value={(actionConfig.tag_name as string) || ""}
              onChange={(e) =>
                setActionConfig({ ...actionConfig, tag_name: e.target.value })
              }
              placeholder="Ex: urgente, vip"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>
        )

      case "send_message":
        return (
          <div className="space-y-3">
            {/* Canal */}
            <div>
              <label className="block text-sm font-medium mb-1">Canal</label>
              <select
                value={(actionConfig.channel as string) || ""}
                onChange={(e) =>
                  setActionConfig({ ...actionConfig, channel: e.target.value })
                }
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="">Mesmo canal da conversa</option>
                <option value="telegram">Telegram</option>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
              </select>
            </div>

            {/* Template (opcional) */}
            <div>
              <label className="block text-sm font-medium mb-1">Template (opcional)</label>
              <select
                value={(actionConfig.template_id as string) || ""}
                onChange={(e) => {
                  const templateId = e.target.value || null
                  const selectedTemplate = templates.find(t => t.id === templateId)
                  setActionConfig({
                    ...actionConfig,
                    template_id: templateId,
                    // Se template selecionado, preencher mensagem e subject
                    message: selectedTemplate?.content || actionConfig.message,
                    subject: selectedTemplate?.subject || actionConfig.subject,
                  })
                }}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="">Sem template (mensagem manual)</option>
                {templates
                  .filter(t => {
                    // Se não tem canal definido, mostra todos os templates
                    if (!actionConfig.channel) return true
                    // Se canal definido, mostra apenas templates:
                    // 1. Com mesmo channel_hint
                    // 2. OU templates sem channel_hint (universais)
                    return t.channel_hint === actionConfig.channel || t.channel_hint === null
                  })
                  .map(template => (
                    <option key={template.id} value={template.id}>
                      {template.title} {template.channel_hint ? `(${template.channel_hint})` : '(universal)'}
                    </option>
                  ))}
              </select>
            </div>

            {/* Destinatario */}
            <div>
              <label className="block text-sm font-medium mb-1">Enviar para</label>
              <select
                value={(actionConfig.recipient as string) || "auto"}
                onChange={(e) => setActionConfig({ ...actionConfig, recipient: e.target.value })}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="auto">Email do contato (automatico)</option>
                <option value="custom">Email especifico</option>
              </select>
            </div>

            {actionConfig.recipient === "custom" && (
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={(actionConfig.recipient_email as string) || ""}
                  onChange={(e) => setActionConfig({ ...actionConfig, recipient_email: e.target.value })}
                  placeholder="email@exemplo.com"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
            )}

            {/* Mensagem - condicional baseado em template */}
            {actionConfig.template_id ? (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Preview do template
                  <span className="ml-2 inline-flex items-center rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                    Dados de exemplo
                  </span>
                </label>

                {/* Mostrar subject */}
                {typeof actionConfig.subject === 'string' && actionConfig.subject && (
                  <div className="mb-2">
                    <span className="text-xs text-zinc-500">Assunto:</span>
                    <div className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 font-medium">
                      {resolvePreviewPlaceholders(actionConfig.subject)}
                    </div>
                  </div>
                )}

                {/* Body */}
                <div>
                  <span className="text-xs text-zinc-500">Corpo:</span>
                  <div className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 whitespace-pre-wrap italic">
                    {resolvePreviewPlaceholders((actionConfig.message as string) || "Template sem conteudo")}
                  </div>
                </div>

                <p className="text-xs text-zinc-500 mt-1">
                  Preview com dados de exemplo. Variaveis disponiveis: {"{nome}"}, {"{deal}"}, {"{valor}"}
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium mb-1">Mensagem</label>
                <textarea
                  value={(actionConfig.message as string) || ""}
                  onChange={(e) =>
                    setActionConfig({ ...actionConfig, message: e.target.value })
                  }
                  placeholder="Digite a mensagem automatica..."
                  rows={3}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Variaveis: {"{nome}"}, {"{primeiro_nome}"}, {"{canal}"}
                </p>
              </div>
            )}
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-lg bg-white shadow-xl dark:bg-zinc-900 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 flex-shrink-0">
          <h2 className="text-lg font-semibold">
            {isNew ? "Nova Regra de Automacao" : "Editar Regra"}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : (
            <>
              {/* Nome e Descricao */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Nome da regra *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Mover para Qualificado apos mensagem"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Descricao (opcional)</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Descreva o que esta regra faz..."
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </div>
              </div>

              {/* Pipeline */}
              <div>
                <label className="block text-sm font-medium mb-1">Pipeline</label>
                <select
                  value={selectedPipelineId}
                  onChange={(e) => setSelectedPipelineId(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                >
                  <option value="">Todos os pipelines</option>
                  {pipelines.map((pipeline) => (
                    <option key={pipeline.id} value={pipeline.id}>
                      {pipeline.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Trigger */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">
                  Quando (Trigger)
                </h3>
                <div>
                  <label className="block text-sm font-medium mb-1">Tipo de gatilho</label>
                  <select
                    value={triggerType}
                    onChange={(e) => {
                      setTriggerType(e.target.value as TriggerType)
                      setTriggerConfig({}) // Reset config quando muda tipo
                    }}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    {TRIGGER_TYPES.map((trigger) => (
                      <option key={trigger.value} value={trigger.value}>
                        {trigger.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="pl-3 border-l-2 border-violet-200 dark:border-violet-800">
                  {renderTriggerConfig()}
                </div>
              </div>

              {/* Conditions */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">
                    Condicoes (opcional)
                  </h3>
                  <button
                    onClick={addCondition}
                    className="flex items-center gap-1 text-sm text-violet-600 hover:text-violet-700"
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar
                  </button>
                </div>
                {conditions.length === 0 ? (
                  <p className="text-sm text-zinc-500 italic">
                    Nenhuma condicao adicional. A regra sera executada sempre que o trigger ocorrer.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {conditions.map((condition) => (
                      <div
                        key={condition.id}
                        className="flex items-center gap-2 rounded-lg border border-zinc-200 p-2 dark:border-zinc-700"
                      >
                        <input
                          type="text"
                          value={condition.field}
                          onChange={(e) =>
                            updateCondition(condition.id, { field: e.target.value })
                          }
                          placeholder="Campo"
                          className="flex-1 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                        />
                        <select
                          value={condition.operator}
                          onChange={(e) =>
                            updateCondition(condition.id, {
                              operator: e.target.value as AutomationCondition["operator"],
                            })
                          }
                          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                        >
                          <option value="equals">igual a</option>
                          <option value="contains">contem</option>
                          <option value="greater_than">maior que</option>
                          <option value="less_than">menor que</option>
                        </select>
                        <input
                          type="text"
                          value={condition.value}
                          onChange={(e) =>
                            updateCondition(condition.id, { value: e.target.value })
                          }
                          placeholder="Valor"
                          className="flex-1 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                        />
                        <button
                          onClick={() => removeCondition(condition.id)}
                          className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">
                  Entao (Action)
                </h3>
                <div>
                  <label className="block text-sm font-medium mb-1">Tipo de acao</label>
                  <select
                    value={actionType}
                    onChange={(e) => {
                      setActionType(e.target.value as ActionType)
                      setActionConfig({}) // Reset config quando muda tipo
                    }}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    {ACTION_TYPES.map((action) => (
                      <option key={action.value} value={action.value}>
                        {action.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="pl-3 border-l-2 border-green-200 dark:border-green-800">
                  {renderActionConfig()}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800 flex-shrink-0">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            className="flex items-center gap-2 rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-50"
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isNew ? "Criar Regra" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  )
}
