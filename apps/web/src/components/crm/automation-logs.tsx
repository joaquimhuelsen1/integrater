"use client"

import { useEffect, useState, useCallback } from "react"
import { AlertCircle, CheckCircle2, Clock, Loader2, Mail, ArrowRight, Tag, RefreshCw } from "lucide-react"
import { apiFetch } from "@/lib/api"

interface AutomationExecution {
  id: string
  owner_id: string
  rule_id: string
  deal_id: string
  trigger_type: string
  trigger_data: Record<string, unknown>
  action_type: string
  action_data: Record<string, unknown>
  status: "success" | "failed"
  error_message?: string
  executed_at: string
  rule_name?: string
}

interface AutomationLogsProps {
  dealId?: string  // Se passado, filtra por deal
  pipelineId?: string  // Se passado, filtra por pipeline
  limit?: number
  showRefresh?: boolean
}

const TRIGGER_LABELS: Record<string, string> = {
  message_sent: "Mensagem Enviada",
  message_received: "Mensagem Recebida",
  stage_changed: "Etapa Alterada",
  deal_created: "Deal Criado",
  field_changed: "Campo Alterado",
  time_in_stage: "Tempo na Etapa",
}

const ACTION_LABELS: Record<string, string> = {
  move_stage: "Mover Etapa",
  add_tag: "Adicionar Tag",
  send_message: "Enviar Mensagem",
  update_field: "Atualizar Campo",
  create_task: "Criar Tarefa",
  send_notification: "Enviar Notificacao",
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "Agora"
  if (diffMins < 60) return `${diffMins} min atras`
  if (diffHours < 24) return `${diffHours}h atras`
  if (diffDays < 7) return `${diffDays}d atras`

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function AutomationLogs({ dealId, pipelineId, limit = 20, showRefresh = true }: AutomationLogsProps) {
  const [executions, setExecutions] = useState<AutomationExecution[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: String(limit) })
      if (dealId) params.append("deal_id", dealId)
      if (pipelineId) params.append("pipeline_id", pipelineId)

      const res = await apiFetch(`/automations/executions?${params}`)
      if (!res.ok) throw new Error("Erro ao buscar logs")
      const data = await res.json()
      setExecutions(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setLoading(false)
    }
  }, [dealId, pipelineId, limit])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const getIcon = (actionType: string, status: string) => {
    if (status === "failed") return <AlertCircle className="h-4 w-4 text-red-500" />

    switch (actionType) {
      case "move_stage": return <ArrowRight className="h-4 w-4 text-blue-500" />
      case "add_tag": return <Tag className="h-4 w-4 text-purple-500" />
      case "send_message": return <Mail className="h-4 w-4 text-green-500" />
      default: return <CheckCircle2 className="h-4 w-4 text-green-500" />
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <AlertCircle className="h-8 w-8 text-red-400 mb-2" />
        <p className="text-sm text-zinc-500">{error}</p>
        <button
          onClick={fetchLogs}
          className="mt-2 flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <RefreshCw className="h-4 w-4" />
          Tentar novamente
        </button>
      </div>
    )
  }

  if (executions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Clock className="h-8 w-8 text-zinc-300 mb-2" />
        <p className="text-sm text-zinc-500">Nenhuma execucao de automacao</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {showRefresh && (
        <div className="flex justify-end mb-2">
          <button
            onClick={fetchLogs}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      )}

      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {executions.map((exec) => (
          <div key={exec.id} className="py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 px-2 rounded-md transition-colors">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">{getIcon(exec.action_type, exec.status)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {ACTION_LABELS[exec.action_type] || exec.action_type}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      exec.status === "success"
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    }`}
                  >
                    {exec.status === "success" ? "Sucesso" : "Falha"}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Trigger: {TRIGGER_LABELS[exec.trigger_type] || exec.trigger_type}
                </p>
                {exec.error_message && (
                  <p className="text-xs text-red-500 mt-1">{exec.error_message}</p>
                )}
                <p className="text-xs text-zinc-400 mt-1">
                  {formatRelativeTime(exec.executed_at)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
