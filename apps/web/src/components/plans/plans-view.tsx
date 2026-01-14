"use client"

import { useState, useEffect, useCallback } from "react"
import { ArrowLeft, Plus, FileText, Loader2, Trash2, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react"
import Link from "next/link"
import { ThemeToggle } from "../theme-toggle"
import { useWorkspace } from "@/contexts/workspace-context"
import { apiGet, apiPost, apiDelete } from "@/lib/api"
import { PlanForm } from "./plan-form"
import { PlanViewer } from "./plan-viewer"

type PlanStatusType = "draft" | "generating_structure" | "generating_intro" | "deepening_blocks" | "generating_summary" | "completed" | "error"

interface Plan {
  id: string
  owner_id: string
  workspace_id: string
  form_data: Record<string, unknown>
  conversation_context: string | null
  status: PlanStatusType
  structure: Record<string, unknown> | null
  introduction: string | null
  deepened_blocks: Record<string, unknown>
  summary: string | null
  faq: unknown[]
  model_used: string
  generation_started_at: string | null
  generation_completed_at: string | null
  generation_duration_seconds: number | null
  tokens_estimated: number | null
  error_message: string | null
  created_at: string
  updated_at: string
}

const statusConfig: Record<PlanStatusType, { label: string; icon: typeof Loader2; color: string }> = {
  draft: { label: "Rascunho", icon: Clock, color: "text-zinc-500" },
  generating_structure: { label: "Gerando estrutura...", icon: Loader2, color: "text-blue-500" },
  generating_intro: { label: "Gerando introdução...", icon: Loader2, color: "text-blue-500" },
  deepening_blocks: { label: "Aprofundando blocos...", icon: Loader2, color: "text-blue-500" },
  generating_summary: { label: "Gerando resumo...", icon: Loader2, color: "text-blue-500" },
  completed: { label: "Concluído", icon: CheckCircle2, color: "text-green-500" },
  error: { label: "Erro", icon: XCircle, color: "text-red-500" },
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export function PlansView() {
  const { currentWorkspace } = useWorkspace()
  const [plans, setPlans] = useState<Plan[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [pollingIds, setPollingIds] = useState<Set<string>>(new Set())

  const loadPlans = useCallback(async () => {
    if (!currentWorkspace) return

    setIsLoading(true)
    try {
      const data = await apiGet<Plan[]>("/plans")
      setPlans(data)
    } catch {
      console.error("Erro ao carregar planos")
    } finally {
      setIsLoading(false)
    }
  }, [currentWorkspace])

  const loadPlan = useCallback(async (planId: string) => {
    try {
      const data = await apiGet<Plan>(`/plans/${planId}`)
      return data
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    loadPlans()
  }, [loadPlans])

  // Poll plans in progress
  useEffect(() => {
    if (pollingIds.size === 0) return

    const interval = setInterval(async () => {
      const updatedPlans: Plan[] = []
      let stillPolling = false

      for (const planId of Array.from(pollingIds)) {
        const updated = await loadPlan(planId)
        if (updated) {
          updatedPlans.push(updated)
          if (updated.status === "generating_structure" ||
              updated.status === "generating_intro" ||
              updated.status === "deepening_blocks" ||
              updated.status === "generating_summary" ||
              updated.status === "draft") {
            stillPolling = true
          }
        }
      }

      if (updatedPlans.length > 0) {
        setPlans((prev) =>
          (prev || []).map((p) => {
            const updated = updatedPlans.find((u) => u.id === p.id)
            return updated || p
          })
        )
      }

      if (!stillPolling) {
        setPollingIds(new Set())
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [pollingIds, loadPlan])

  const startPolling = (planId: string) => {
    setPollingIds((prev) => new Set(prev).add(planId))
  }

  const createPlan = async (formData: Record<string, unknown>, conversationContext: string) => {
    try {
      const data = await apiPost<Plan>("/plans/generate", {
        form_data: formData,
        conversation_context: conversationContext || null,
      })

      setPlans((prev) => [data, ...(prev || [])])
      setIsCreating(false)
      startPolling(data.id)
      return data
    } catch {
      console.error("Erro ao criar plano")
      return null
    }
  }

  const deletePlan = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este plano?")) return

    try {
      await apiDelete(`/plans/${id}`)
      setPlans((prev) => prev.filter((p) => p.id !== id))
      if (selectedPlan?.id === id) {
        setSelectedPlan(null)
      }
    } catch {
      console.error("Erro ao excluir plano")
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    })
  }

  const getStatusDisplay = (status: PlanStatusType) => {
    const config = statusConfig[status]
    const Icon = config.icon
    const isSpinning = status.includes("generating") || status === "draft"

    return (
      <div className={`flex items-center gap-1.5 text-xs ${config.color}`}>
        <Icon className={`h-3.5 w-3.5 ${isSpinning ? "animate-spin" : ""}`} />
        <span>{config.label}</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-4">
            {selectedPlan ? (
              <button
                onClick={() => setSelectedPlan(null)}
                className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            ) : (
              <Link
                href="/"
                className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
            )}
            <h1 className="text-xl font-semibold">
              {selectedPlan ? "Plano de Relacionamento" : "Planos"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {!selectedPlan && (
              <button
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
              >
                <Plus className="h-4 w-4" />
                Novo Plano
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6">
        {selectedPlan ? (
          <PlanViewer
            plan={selectedPlan}
            onRefresh={loadPlans}
            onClose={() => setSelectedPlan(null)}
          />
        ) : (
          <>
            {/* Create Modal */}
            {isCreating && (
              <PlanForm
                onSubmit={createPlan}
                onCancel={() => setIsCreating(false)}
              />
            )}

            {/* Plans List */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {isLoading ? (
                <div className="col-span-full py-12 text-center text-zinc-500">
                  <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin" />
                  <p>Carregando planos...</p>
                </div>
              ) : plans.length === 0 ? (
                <div className="col-span-full py-12 text-center text-zinc-500">
                  <FileText className="mx-auto mb-3 h-12 w-12 text-zinc-300" />
                  <p className="mb-2">Nenhum plano encontrado</p>
                  <p className="text-sm">Crie seu primeiro plano para começar</p>
                </div>
              ) : (
                plans.map((plan) => {
                  const title = plan.form_data?.situacao as string || "Plano sem título"
                  const objetivos = plan.form_data?.objetivos as string || ""

                  return (
                    <div
                      key={plan.id}
                      onClick={() => setSelectedPlan(plan)}
                      className="group cursor-pointer rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div className="mb-3 flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-medium">{title}</h3>
                          {objetivos && (
                            <p className="mt-1 text-xs text-zinc-500 line-clamp-2">{objetivos}</p>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            deletePlan(plan.id)
                          }}
                          className="opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <Trash2 className="h-4 w-4 text-zinc-400 hover:text-red-500" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between">
                        {getStatusDisplay(plan.status)}
                        <span className="text-xs text-zinc-400">{formatDate(plan.created_at)}</span>
                      </div>

                      {plan.error_message && (
                        <div className="mt-2 flex items-start gap-1.5 text-xs text-red-500">
                          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                          <span className="line-clamp-2">{plan.error_message}</span>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
