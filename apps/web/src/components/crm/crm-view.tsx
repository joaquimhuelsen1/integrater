"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { ArrowLeft, Plus, Settings, BarChart3, RefreshCw } from "lucide-react"
import Link from "next/link"
import { PipelineBoard } from "./pipeline-board"
import { DealModal } from "./deal-modal"
import { PipelineSettings } from "./pipeline-settings"
import { CRMDashboard } from "./crm-dashboard"
import { LossReasonModal } from "./loss-reason-modal"
import { DealFilters, defaultFilters, type DealFiltersState } from "./deal-filters"
import { WorkspaceSelector } from "@/components/workspace-selector"
import { ThemeToggle } from "@/components/theme-toggle"
import { useWorkspace } from "@/contexts/workspace-context"

interface Pipeline {
  id: string
  name: string
  description: string | null
  color: string
  position: number
  is_archived: boolean
}

interface Stage {
  id: string
  name: string
  color: string
  position: number
  is_win: boolean
  is_loss: boolean
  deals: Deal[]
}

interface Deal {
  id: string
  title: string
  value: number
  probability: number
  expected_close_date: string | null
  stage_id: string
  contact_id: string | null
  contact?: { id: string; display_name: string | null } | null
  won_at: string | null
  lost_at: string | null
  created_at: string
  updated_at: string
}

interface DealTag {
  id: string
  name: string
  color: string
}

export function CRMView() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null)
  const [stages, setStages] = useState<Stage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [tags, setTags] = useState<DealTag[]>([])
  const [filters, setFilters] = useState<DealFiltersState>(defaultFilters)

  // Modals
  const [showSettings, setShowSettings] = useState(false)
  const [showDealModal, setShowDealModal] = useState(false)
  const [showDashboard, setShowDashboard] = useState(false)
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null)
  const [createDealStageId, setCreateDealStageId] = useState<string | null>(null)

  // Loss reason modal state
  const [pendingLossMove, setPendingLossMove] = useState<{
    deal: Deal
    targetStageId: string
  } | null>(null)

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
  const { currentWorkspace } = useWorkspace()

  const loadPipelines = useCallback(async () => {
    if (!currentWorkspace) return []

    try {
      const res = await fetch(`${API_URL}/pipelines?workspace_id=${currentWorkspace.id}`)
      if (res.ok) {
        const data = await res.json()
        setPipelines(data)
        if (data.length === 0) {
          setIsLoading(false)
        }
        return data
      } else {
        setIsLoading(false)
        return []
      }
    } catch (error) {
      console.error("Erro ao carregar pipelines:", error)
      setIsLoading(false)
      return []
    }
  }, [API_URL, currentWorkspace])

  const loadStages = useCallback(async () => {
    if (!selectedPipelineId) return

    setIsLoading(true)
    try {
      const res = await fetch(`${API_URL}/deals/by-pipeline/${selectedPipelineId}`)
      if (res.ok) {
        const data = await res.json()
        setStages(data)
      }
    } catch (error) {
      console.error("Erro ao carregar stages:", error)
    } finally {
      setIsLoading(false)
    }
  }, [API_URL, selectedPipelineId])

  const loadTags = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/deal-tags`)
      if (res.ok) {
        const data = await res.json()
        setTags(data)
      }
    } catch (error) {
      console.error("Erro ao carregar tags:", error)
    }
  }, [API_URL])

  useEffect(() => {
    loadPipelines().then((data) => {
      if (data.length > 0) {
        setSelectedPipelineId(data[0].id)
      }
    })
    loadTags()
  }, [loadPipelines, loadTags])

  useEffect(() => {
    if (selectedPipelineId) {
      loadStages()
    }
  }, [selectedPipelineId, loadStages])

  const handleDealMove = async (dealId: string, newStageId: string) => {
    // Encontra stage atual e o deal
    let deal: Deal | null = null
    let oldStageId: string | null = null

    for (const stage of stages) {
      const found = stage.deals.find((d) => d.id === dealId)
      if (found) {
        deal = found
        oldStageId = stage.id
        break
      }
    }

    if (!deal || !oldStageId || oldStageId === newStageId) return

    // Verifica se target stage é de perda
    const targetStage = stages.find((s) => s.id === newStageId)
    if (targetStage?.is_loss) {
      // Abre modal de motivo de perda
      setPendingLossMove({ deal, targetStageId: newStageId })
      return
    }

    // Verifica se target stage é de ganho
    if (targetStage?.is_win) {
      // Move e marca como ganho
      await executeDealMove(deal, oldStageId, newStageId, true)
      return
    }

    // Move normalmente
    await executeDealMove(deal, oldStageId, newStageId, false)
  }

  const executeDealMove = async (
    deal: Deal,
    oldStageId: string,
    newStageId: string,
    isWin: boolean
  ) => {
    // Atualização otimista - move localmente primeiro
    setStages((prev) =>
      prev.map((stage) => {
        if (stage.id === oldStageId) {
          return { ...stage, deals: stage.deals.filter((d) => d.id !== deal.id) }
        }
        if (stage.id === newStageId) {
          return { ...stage, deals: [...stage.deals, { ...deal, stage_id: newStageId }] }
        }
        return stage
      })
    )

    // Chama API em background
    try {
      const res = await fetch(`${API_URL}/deals/${deal.id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage_id: newStageId }),
      })

      if (!res.ok) {
        loadStages()
        return
      }

      // Se é stage de ganho, marca como ganho
      if (isWin) {
        await fetch(`${API_URL}/deals/${deal.id}/win`, { method: "POST" })
        loadStages()
      }
    } catch (error) {
      console.error("Erro ao mover deal:", error)
      loadStages()
    }
  }

  const handleLossConfirm = async (reasonId: string | null, description: string) => {
    if (!pendingLossMove) return

    const { deal, targetStageId } = pendingLossMove
    const oldStageId = deal.stage_id

    // Move primeiro
    setStages((prev) =>
      prev.map((stage) => {
        if (stage.id === oldStageId) {
          return { ...stage, deals: stage.deals.filter((d) => d.id !== deal.id) }
        }
        if (stage.id === targetStageId) {
          return { ...stage, deals: [...stage.deals, { ...deal, stage_id: targetStageId }] }
        }
        return stage
      })
    )

    try {
      // Move para nova stage
      await fetch(`${API_URL}/deals/${deal.id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage_id: targetStageId }),
      })

      // Marca como perdido com motivo
      const losePayload: { reason?: string; reason_id?: string; description?: string } = {}

      // Se reasonId é um UUID válido (não é um dos defaults), envia como reason_id
      if (reasonId && !reasonId.startsWith("no_") && !["competitor", "timing", "other"].includes(reasonId)) {
        losePayload.reason_id = reasonId
      } else if (reasonId) {
        // É um default, usa o nome como reason
        const defaultReasons: Record<string, string> = {
          no_budget: "Falta de dinheiro",
          competitor: "Optou por concorrente",
          timing: "Timing ruim",
          no_need: "Não precisa mais",
          no_response: "Sem resposta",
          other: "Outro",
        }
        losePayload.reason = defaultReasons[reasonId] || reasonId
      }

      if (description) {
        losePayload.description = description
      }

      await fetch(`${API_URL}/deals/${deal.id}/lose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(losePayload),
      })

      loadStages()
    } catch (error) {
      console.error("Erro ao marcar deal como perdido:", error)
      loadStages()
    }

    setPendingLossMove(null)
  }

  const handleDealClick = (dealId: string) => {
    setSelectedDealId(dealId)
    setShowDealModal(true)
  }

  const handleCreateDeal = (stageId: string) => {
    setCreateDealStageId(stageId)
    setSelectedDealId(null)
    setShowDealModal(true)
  }

  const handleDealSaved = () => {
    setShowDealModal(false)
    setSelectedDealId(null)
    setCreateDealStageId(null)
    loadStages()
  }

  const handlePipelineCreated = async () => {
    await loadPipelines()
    setShowSettings(false)
  }

  // Apply filters to stages/deals
  const filteredStages = useMemo(() => {
    return stages.map((stage) => {
      // Filter stages if stageIds filter is active
      if (filters.stageIds.length > 0 && !filters.stageIds.includes(stage.id)) {
        return { ...stage, deals: [] }
      }

      const filteredDeals = stage.deals.filter((deal) => {
        // Search filter
        if (filters.search) {
          const searchLower = filters.search.toLowerCase()
          const matchesSearch =
            deal.title.toLowerCase().includes(searchLower) ||
            deal.contact?.display_name?.toLowerCase().includes(searchLower)
          if (!matchesSearch) return false
        }

        // Date filter
        if (filters.dateFrom && deal.expected_close_date) {
          if (new Date(deal.expected_close_date) < new Date(filters.dateFrom)) {
            return false
          }
        }
        if (filters.dateTo && deal.expected_close_date) {
          if (new Date(deal.expected_close_date) > new Date(filters.dateTo)) {
            return false
          }
        }

        // Won/Lost filter
        if (!filters.showWon && deal.won_at) return false
        if (!filters.showLost && deal.lost_at) return false

        return true
      })

      return { ...stage, deals: filteredDeals }
    })
  }, [stages, filters])

  const selectedPipeline = pipelines.find(p => p.id === selectedPipelineId)

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value)
  }

  // Calcula totais (usa filteredStages para refletir os filtros)
  const totalDeals = filteredStages.reduce((sum, s) => sum + s.deals.length, 0)
  const totalValue = filteredStages.reduce(
    (sum, s) => sum + s.deals.reduce((ds, d) => ds + d.value, 0),
    0
  )

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>

          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">CRM</h1>
            <WorkspaceSelector compact />

            {pipelines.length > 0 && (
              <select
                value={selectedPipelineId || ""}
                onChange={(e) => setSelectedPipelineId(e.target.value)}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="mr-4 text-sm text-zinc-500">
            <span className="font-medium text-zinc-900 dark:text-white">{totalDeals}</span> deals
            {" · "}
            <span className="font-medium text-zinc-900 dark:text-white">{formatCurrency(totalValue)}</span>
          </div>

          <ThemeToggle />

          <button
            onClick={() => loadStages()}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <RefreshCw className="h-4 w-4" />
          </button>

          <button
            onClick={() => setShowDashboard(true)}
            className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-600 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
          >
            <BarChart3 className="h-4 w-4" />
            Dashboard
          </button>

          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <Settings className="h-4 w-4" />
          </button>

          <button
            onClick={() => handleCreateDeal(stages[0]?.id || "")}
            disabled={stages.length === 0}
            className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Novo Deal
          </button>
        </div>
      </div>

      {/* Filters */}
      {pipelines.length > 0 && stages.length > 0 && (
        <DealFilters
          filters={filters}
          onFiltersChange={setFilters}
          stages={stages}
          tags={tags}
          onClear={() => setFilters(defaultFilters)}
        />
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-zinc-500">
            Carregando...
          </div>
        ) : pipelines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-zinc-500">
            <p>Nenhum pipeline criado</p>
            <button
              onClick={() => setShowSettings(true)}
              className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
            >
              Criar Pipeline
            </button>
          </div>
        ) : (
          <PipelineBoard
            stages={filteredStages}
            onDealMove={handleDealMove}
            onDealClick={handleDealClick}
            onCreateDeal={handleCreateDeal}
          />
        )}
      </div>

      {/* Deal Modal */}
      {showDealModal && selectedPipelineId && (
        <DealModal
          dealId={selectedDealId}
          pipelineId={selectedPipelineId}
          initialStageId={createDealStageId}
          stages={stages}
          onClose={() => {
            setShowDealModal(false)
            setSelectedDealId(null)
            setCreateDealStageId(null)
          }}
          onSave={handleDealSaved}
        />
      )}

      {/* Settings Modal */}
      {showSettings && currentWorkspace && (
        <PipelineSettings
          pipelines={pipelines}
          selectedPipelineId={selectedPipelineId}
          workspaceId={currentWorkspace.id}
          onClose={() => setShowSettings(false)}
          onPipelineCreated={handlePipelineCreated}
          onPipelineUpdated={loadPipelines}
          onStagesUpdated={loadStages}
        />
      )}

      {/* Dashboard Modal */}
      {showDashboard && (
        <CRMDashboard
          pipelineId={selectedPipelineId}
          onClose={() => setShowDashboard(false)}
        />
      )}

      {/* Loss Reason Modal */}
      {pendingLossMove && selectedPipelineId && (
        <LossReasonModal
          dealId={pendingLossMove.deal.id}
          dealTitle={pendingLossMove.deal.title}
          pipelineId={selectedPipelineId}
          stageId={pendingLossMove.targetStageId}
          onClose={() => setPendingLossMove(null)}
          onConfirm={handleLossConfirm}
        />
      )}
    </div>
  )
}
