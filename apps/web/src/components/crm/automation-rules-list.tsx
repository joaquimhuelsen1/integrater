"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, Zap, Edit2, Trash2, Loader2 } from "lucide-react"
import { apiFetch } from "@/lib/api"
import { AutomationRuleBuilder, type AutomationRule as BuilderRule } from "./automation-rule-builder"

// Labels para exibicao
const TRIGGER_LABELS: Record<string, string> = {
  message_received: "Mensagem recebida",
  stage_changed: "Estagio alterado",
  time_in_stage: "Tempo no estagio",
  field_changed: "Campo alterado",
  deal_created: "Deal criado",
  message_sent: "Mensagem enviada",
}

const ACTION_LABELS: Record<string, string> = {
  move_stage: "Mover estagio",
  update_field: "Atualizar campo",
  create_task: "Criar tarefa",
  send_notification: "Notificacao",
  add_tag: "Adicionar tag",
  send_message: "Enviar mensagem",
}

// Extende BuilderRule com campos adicionais da API
interface AutomationRule extends BuilderRule {
  created_at: string
  updated_at: string
}

interface AutomationRulesListProps {
  workspaceId: string
  pipelineId?: string
}

export function AutomationRulesList({ workspaceId, pipelineId }: AutomationRulesListProps) {
  const [rules, setRules] = useState<AutomationRule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal state
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null)
  const [togglingRule, setTogglingRule] = useState<string | null>(null)
  const [deletingRule, setDeletingRule] = useState<string | null>(null)

  const loadRules = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const url = pipelineId
        ? `/automations?pipeline_id=${pipelineId}`
        : "/automations"
      const res = await apiFetch(url)
      if (res.ok) {
        const data = await res.json()
        setRules(data)
      } else {
        setError("Erro ao carregar regras")
      }
    } catch (err) {
      console.error("Erro ao carregar regras:", err)
      setError("Erro ao carregar regras")
    } finally {
      setIsLoading(false)
    }
  }, [pipelineId])

  useEffect(() => {
    loadRules()
  }, [loadRules])

  const handleToggleActive = async (rule: AutomationRule) => {
    setTogglingRule(rule.id)
    try {
      const res = await apiFetch(`/automations/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !rule.is_active }),
      })
      if (res.ok) {
        setRules((prev) =>
          prev.map((r) =>
            r.id === rule.id ? { ...r, is_active: !r.is_active } : r
          )
        )
      }
    } catch (err) {
      console.error("Erro ao alternar regra:", err)
    } finally {
      setTogglingRule(null)
    }
  }

  const handleDelete = async (ruleId: string) => {
    if (!confirm("Tem certeza que deseja excluir esta regra?")) return

    setDeletingRule(ruleId)
    try {
      const res = await apiFetch(`/automations/${ruleId}`, {
        method: "DELETE",
      })
      if (res.ok) {
        setRules((prev) => prev.filter((r) => r.id !== ruleId))
      }
    } catch (err) {
      console.error("Erro ao excluir regra:", err)
    } finally {
      setDeletingRule(null)
    }
  }

  const handleEdit = (rule: AutomationRule) => {
    setEditingRule(rule)
    setShowBuilder(true)
  }

  const handleCreate = () => {
    setEditingRule(null)
    setShowBuilder(true)
  }

  const handleBuilderClose = () => {
    setShowBuilder(false)
    setEditingRule(null)
  }

  const handleBuilderSave = () => {
    setShowBuilder(false)
    setEditingRule(null)
    loadRules()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-center text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
        {error}
        <button
          onClick={loadRules}
          className="ml-2 underline hover:no-underline"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header com botao */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-500">
            Configure regras automaticas para suas conversas e deals
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600"
        >
          <Plus className="h-4 w-4" />
          Nova Regra
        </button>
      </div>

      {/* Lista de regras */}
      {rules.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="mb-4 rounded-full bg-violet-100 p-4 dark:bg-violet-900/30">
              <Zap className="h-8 w-8 text-violet-500" />
            </div>
            <h3 className="mb-2 text-lg font-medium">Nenhuma automacao configurada</h3>
            <p className="max-w-sm text-sm text-zinc-500">
              Crie regras para automatizar acoes como mover deals, enviar notificacoes
              e adicionar tags baseado em triggers.
            </p>
            <button
              onClick={handleCreate}
              className="mt-4 flex items-center gap-2 rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600"
            >
              <Plus className="h-4 w-4" />
              Criar primeira regra
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-800">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                {/* Icone de status */}
                <div
                  className={`rounded-full p-2 ${
                    rule.is_active
                      ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800"
                  }`}
                >
                  <Zap className="h-5 w-5" />
                </div>

                {/* Info da regra */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{rule.name}</p>
                    {!rule.is_active && (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800">
                        Inativa
                      </span>
                    )}
                  </div>
                  {rule.description && (
                    <p className="text-sm text-zinc-500 truncate">{rule.description}</p>
                  )}

                  {/* Badges de trigger e action */}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                      {TRIGGER_LABELS[rule.trigger_type] || rule.trigger_type}
                    </span>
                    <span className="text-zinc-400">-&gt;</span>
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      {ACTION_LABELS[rule.action_type] || rule.action_type}
                    </span>
                    {rule.conditions.length > 0 && (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        +{rule.conditions.length} condicao(oes)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Acoes */}
              <div className="flex items-center gap-2 ml-4">
                {/* Toggle ativo/inativo */}
                <button
                  onClick={() => handleToggleActive(rule)}
                  disabled={togglingRule === rule.id}
                  className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${
                    rule.is_active
                      ? "bg-green-500"
                      : "bg-zinc-300 dark:bg-zinc-600"
                  }`}
                  title={rule.is_active ? "Desativar" : "Ativar"}
                >
                  {togglingRule === rule.id ? (
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                      <Loader2 className="h-3 w-3 animate-spin text-white" />
                    </span>
                  ) : (
                    <span
                      className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        rule.is_active ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  )}
                </button>

                {/* Botao editar */}
                <button
                  onClick={() => handleEdit(rule)}
                  className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                  title="Editar"
                >
                  <Edit2 className="h-4 w-4" />
                </button>

                {/* Botao excluir */}
                <button
                  onClick={() => handleDelete(rule.id)}
                  disabled={deletingRule === rule.id}
                  className="rounded-lg p-2 text-zinc-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                  title="Excluir"
                >
                  {deletingRule === rule.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Builder Modal */}
      {showBuilder && (
        <AutomationRuleBuilder
          rule={editingRule}
          pipelineId={pipelineId}
          workspaceId={workspaceId}
          onClose={handleBuilderClose}
          onSave={handleBuilderSave}
        />
      )}
    </div>
  )
}
