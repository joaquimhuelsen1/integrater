"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { ArrowLeft, Plus, Settings, BarChart3, RefreshCw, Zap } from "lucide-react"
import Link from "next/link"
import { PipelineBoard } from "./pipeline-board"
import { DealCard } from "./deal-card"
import { DealModal } from "./deal-modal"
import { PipelineSettings } from "./pipeline-settings"
import { LossReasonModal } from "./loss-reason-modal"
import { SendMessageModal } from "./send-message-modal"
import { DealFilters, defaultFilters, type DealFiltersState } from "./deal-filters"
import { WorkspaceSelector } from "@/components/workspace-selector"
import { ThemeToggle } from "@/components/theme-toggle"
import { useWorkspace } from "@/contexts/workspace-context"
import { apiFetch } from "@/lib/api"
import { useRealtimeDeals, RealtimeDeal } from "@/hooks/use-realtime-deals"

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
  tags?: { id: string; name: string; color: string }[]
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
  
  // Mobile: stage selecionada (tabs)
  const [selectedMobileStageId, setSelectedMobileStageId] = useState<string | null>(null)

  // Modals
  const [showSettings, setShowSettings] = useState(false)
  const [showDealModal, setShowDealModal] = useState(false)
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null)
  const [createDealStageId, setCreateDealStageId] = useState<string | null>(null)

  // Loss reason modal state
  const [pendingLossMove, setPendingLossMove] = useState<{
    deal: Deal
    targetStageId: string
  } | null>(null)

  // Send message modal state
  const [showSendMessageModal, setShowSendMessageModal] = useState(false)
  const [selectedDealForMessage, setSelectedDealForMessage] = useState<{
    dealId: string
    contactId: string | null
  } | null>(null)

  const { currentWorkspace } = useWorkspace()

  // Converte RealtimeDeal para Deal local
  const realtimeDealToDeal = useCallback((rtDeal: RealtimeDeal): Deal => ({
    id: rtDeal.id,
    title: rtDeal.title,
    value: rtDeal.value ?? 0,
    probability: rtDeal.probability ?? 0,
    expected_close_date: rtDeal.expected_close_date,
    stage_id: rtDeal.stage_id,
    contact_id: rtDeal.contact_id,
    won_at: rtDeal.won_at,
    lost_at: rtDeal.lost_at,
    created_at: rtDeal.created_at,
    updated_at: rtDeal.updated_at,
  }), [])

  // Hook de realtime para atualizar deals em tempo real
  const { isConnected: dealsRealtimeConnected } = useRealtimeDeals({
    pipelineId: selectedPipelineId,
    enabled: !!selectedPipelineId,
    onUpdate: (rtDeal: RealtimeDeal) => {
      const deal = realtimeDealToDeal(rtDeal)
      setStages(prevStages => {
        // Primeiro, encontrar deal antigo ANTES de remover para preservar campos extras
        let oldDeal: Deal | undefined
        for (const stage of prevStages) {
          oldDeal = stage.deals.find(d => d.id === deal.id)
          if (oldDeal) break
        }

        return prevStages.map(stage => {
          // Remover deal de todos os stages
          const filteredDeals = stage.deals.filter(d => d.id !== deal.id)

          // Se este é o stage destino do deal
          if (stage.id === deal.stage_id) {
            // Merge preservando campos extras do deal antigo (tags, contact, custom_fields)
            const mergedDeal = oldDeal ? {
              ...oldDeal,  // Preserva TUDO do deal antigo
              // Sobrescreve apenas campos que vêm do realtime
              id: deal.id,
              title: deal.title,
              value: deal.value,
              probability: deal.probability,
              stage_id: deal.stage_id,
              contact_id: deal.contact_id,
              expected_close_date: deal.expected_close_date,
              won_at: deal.won_at,
              lost_at: deal.lost_at,
              created_at: deal.created_at,
              updated_at: deal.updated_at,
            } : deal

            return {
              ...stage,
              deals: [...filteredDeals, mergedDeal]
            }
          }

          // Stage não é o destino, apenas retorna sem o deal
          return { ...stage, deals: filteredDeals }
        })
      })
      console.log(`[Realtime] Deal ${rtDeal.id} atualizado`)
    },
    onInsert: (rtDeal: RealtimeDeal) => {
      // Novo deal criado, adicionar ao stage correto
      const deal = realtimeDealToDeal(rtDeal)
      setStages(prevStages => {
        return prevStages.map(stage => {
          if (stage.id === deal.stage_id) {
            // Verificar se deal já existe (evitar duplicatas)
            const exists = stage.deals.some(d => d.id === deal.id)
            if (exists) return stage
            return {
              ...stage,
              deals: [...stage.deals, deal]
            }
          }
          return stage
        })
      })
    },
    onDelete: (rtDeal: RealtimeDeal) => {
      // Deal deletado, remover do estado
      setStages(prevStages => {
        return prevStages.map(stage => ({
          ...stage,
          deals: stage.deals.filter(d => d.id !== rtDeal.id)
        }))
      })
    }
  })

  const loadPipelines = useCallback(async () => {
    if (!currentWorkspace) return []

    try {
      const res = await apiFetch(`/pipelines?workspace_id=${currentWorkspace.id}`)
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
  }, [currentWorkspace])

  const loadStages = useCallback(async () => {
    if (!selectedPipelineId) return

    setIsLoading(true)
    try {
      const res = await apiFetch(`/deals/by-pipeline/${selectedPipelineId}`)
      if (res.ok) {
        const data = await res.json()
        setStages(data)
      }
    } catch (error) {
      console.error("Erro ao carregar stages:", error)
    } finally {
      setIsLoading(false)
    }
  }, [selectedPipelineId])

  const loadTags = useCallback(async () => {
    try {
      const res = await apiFetch(`/deal-tags`)
      if (res.ok) {
        const data = await res.json()
        setTags(data)
      }
    } catch (error) {
      console.error("Erro ao carregar tags:", error)
    }
  }, [])

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

  // Seleciona primeira stage quando stages carregam
  useEffect(() => {
    if (stages.length > 0 && !selectedMobileStageId && stages[0]) {
      setSelectedMobileStageId(stages[0].id)
    }
  }, [stages, selectedMobileStageId])

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
      const res = await apiFetch(`/deals/${deal.id}/move`, {
        method: "POST",
        body: JSON.stringify({ stage_id: newStageId }),
      })

      if (!res.ok) {
        loadStages()
        return
      }

      // Se é stage de ganho, marca como ganho
      if (isWin) {
        await apiFetch(`/deals/${deal.id}/win`, { method: "POST" })
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
      await apiFetch(`/deals/${deal.id}/move`, {
        method: "POST",
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

      await apiFetch(`/deals/${deal.id}/lose`, {
        method: "POST",
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

  const handleArchiveDeal = async (dealId: string) => {
    try {
      await apiFetch(`/deals/${dealId}/archive`, { method: "POST" })
      loadStages()
    } catch (error) {
      console.error("Erro ao arquivar deal:", error)
    }
  }

  const handleDeleteDeal = async (dealId: string) => {
    try {
      await apiFetch(`/deals/${dealId}`, { method: "DELETE" })
      loadStages()
    } catch (error) {
      console.error("Erro ao excluir deal:", error)
    }
  }

  const handleSendMessage = (dealId: string) => {
    // Encontrar o deal para obter contact_id
    let contactId: string | null = null
    for (const stage of stages) {
      const deal = stage.deals.find((d) => d.id === dealId)
      if (deal) {
        contactId = deal.contact_id
        break
      }
    }
    setSelectedDealForMessage({ dealId, contactId })
    setShowSendMessageModal(true)
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
      {/* Header - responsivo com 2 linhas no mobile */}
      <div className="flex flex-col border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {/* Linha 1: Navegação + Título */}
        <div className="flex items-center justify-between px-3 py-2 md:px-4 md:py-3">
          <div className="flex items-center gap-2 md:gap-4">
            <Link
              href="/"
              className="rounded-lg p-2 hover:bg-zinc-100 active:bg-zinc-200 dark:hover:bg-zinc-800"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>

            <h1 className="text-lg md:text-xl font-semibold">CRM</h1>
            
            {/* Pipeline selector - sempre visível */}
            {pipelines.length > 0 && (
              <select
                value={selectedPipelineId || ""}
                onChange={(e) => setSelectedPipelineId(e.target.value)}
                className="rounded-lg border border-zinc-300 bg-white px-2 md:px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 max-w-[120px] md:max-w-none truncate"
              >
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-1 md:gap-2">
            {/* Stats - esconde em mobile pequeno */}
            <div className="hidden sm:flex mr-2 md:mr-4 text-xs md:text-sm text-zinc-500">
              <span className="font-medium text-zinc-900 dark:text-white">{totalDeals}</span>
              <span className="hidden md:inline"> deals</span>
              <span className="mx-1">·</span>
              <span className="font-medium text-zinc-900 dark:text-white">{formatCurrency(totalValue)}</span>
            </div>

            {/* Workspace - esconde em mobile */}
            <div className="hidden md:block">
              <WorkspaceSelector compact />
            </div>

            <ThemeToggle />

            {/* Refresh - sempre visível */}
            <button
              onClick={() => loadStages()}
              className="flex items-center justify-center rounded-lg p-2 text-sm hover:bg-zinc-100 active:bg-zinc-200 dark:hover:bg-zinc-800"
              title="Atualizar"
            >
              <RefreshCw className="h-4 w-4" />
            </button>

            {/* Dashboard - esconde texto em mobile */}
            <Link
              href={currentWorkspace ? `/${currentWorkspace.id}/crm/dashboard` : "/crm/dashboard"}
              className="flex items-center gap-1 md:gap-2 rounded-lg border border-blue-200 bg-blue-50 p-2 md:px-3 md:py-2 text-sm text-blue-600 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
              title="Dashboard"
            >
              <BarChart3 className="h-4 w-4" />
              <span className="hidden md:inline">Dashboard</span>
            </Link>

            {/* Automações - esconde texto em mobile */}
            <Link
              href={currentWorkspace ? `/${currentWorkspace.id}/crm/automations` : "/crm/automations"}
              className="flex items-center gap-1 md:gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-2 md:px-3 md:py-2 text-sm text-yellow-600 hover:bg-yellow-100 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400"
              title="Automações"
            >
              <Zap className="h-4 w-4" />
              <span className="hidden md:inline">Automações</span>
            </Link>

            {/* Settings - sempre visível */}
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center justify-center rounded-lg p-2 text-sm hover:bg-zinc-100 active:bg-zinc-200 dark:hover:bg-zinc-800"
              title="Configurações"
            >
              <Settings className="h-4 w-4" />
            </button>

            {/* Novo Deal - sempre visível mas compacto em mobile */}
            <button
              onClick={() => handleCreateDeal(stages[0]?.id || "")}
              disabled={stages.length === 0}
              className="flex items-center gap-1 md:gap-2 rounded-lg bg-blue-500 p-2 md:px-4 md:py-2 text-sm font-medium text-white hover:bg-blue-600 active:bg-blue-700 disabled:opacity-50"
              title="Novo Deal"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden md:inline">Novo Deal</span>
            </button>
          </div>
        </div>
        
        {/* Stats mobile - só aparece em telas pequenas */}
        <div className="flex sm:hidden items-center justify-center gap-3 px-3 pb-2 text-xs text-zinc-500">
          <span>
            <span className="font-medium text-zinc-900 dark:text-white">{totalDeals}</span> deals
          </span>
          <span>·</span>
          <span className="font-medium text-zinc-900 dark:text-white">{formatCurrency(totalValue)}</span>
        </div>
      </div>

      {/* Filters - esconde em mobile */}
      <div className="hidden md:block">
        {pipelines.length > 0 && stages.length > 0 && (
          <DealFilters
            filters={filters}
            onFiltersChange={setFilters}
            stages={stages}
            tags={tags}
            onClear={() => setFilters(defaultFilters)}
          />
        )}
      </div>

      {/* Mobile: Stage Tabs */}
      {pipelines.length > 0 && stages.length > 0 && (
        <div className="flex md:hidden overflow-x-auto scrollbar-hide border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          {filteredStages.map((stage) => {
            const isSelected = selectedMobileStageId === stage.id
            const dealCount = stage.deals.length
            return (
              <button
                key={stage.id}
                onClick={() => setSelectedMobileStageId(stage.id)}
                className={`flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isSelected
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                <span>{stage.name}</span>
                {dealCount > 0 && (
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                    isSelected 
                      ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" 
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
                  }`}>
                    {dealCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>
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
          <>
            {/* Desktop: Pipeline Board tradicional */}
            <div className="hidden md:block h-full">
              <PipelineBoard
                stages={filteredStages}
                onDealMove={handleDealMove}
                onDealClick={handleDealClick}
                onCreateDeal={handleCreateDeal}
                onArchiveDeal={handleArchiveDeal}
                onDeleteDeal={handleDeleteDeal}
                onSendMessage={handleSendMessage}
              />
            </div>

            {/* Mobile: Lista de deals da stage selecionada */}
            <div className="flex md:hidden flex-col h-full overflow-y-auto p-3 space-y-3">
              {filteredStages
                .find((s) => s.id === selectedMobileStageId)
                ?.deals.map((deal) => (
                  <DealCard
                    key={deal.id}
                    deal={deal}
                    onClick={() => handleDealClick(deal.id)}
                    onArchive={handleArchiveDeal}
                    onDelete={handleDeleteDeal}
                    onSendMessage={handleSendMessage}
                  />
                )) || (
                <div className="flex flex-col items-center justify-center h-40 text-zinc-500 text-sm">
                  <p>Nenhum deal nesta etapa</p>
                  <button
                    onClick={() => handleCreateDeal(selectedMobileStageId || "")}
                    className="mt-3 flex items-center gap-1 text-blue-500 hover:text-blue-600"
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar deal
                  </button>
                </div>
              )}
            </div>
          </>
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
          onSendMessage={handleSendMessage}
        />
      )}

      {/* Settings Modal */}
      {showSettings && currentWorkspace && (
        <PipelineSettings
          pipelines={pipelines}
          selectedPipelineId={selectedPipelineId}
          workspaceId={currentWorkspace.id}
          workspaceName={currentWorkspace.name}
          onClose={() => setShowSettings(false)}
          onPipelineCreated={handlePipelineCreated}
          onPipelineUpdated={loadPipelines}
          onStagesUpdated={loadStages}
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

      {/* Send Message Modal */}
      {showSendMessageModal && selectedDealForMessage && (
        <SendMessageModal
          dealId={selectedDealForMessage.dealId}
          contactId={selectedDealForMessage.contactId}
          onClose={() => {
            setShowSendMessageModal(false)
            setSelectedDealForMessage(null)
          }}
          onSent={() => {
            setShowSendMessageModal(false)
            setSelectedDealForMessage(null)
          }}
        />
      )}
    </div>
  )
}
