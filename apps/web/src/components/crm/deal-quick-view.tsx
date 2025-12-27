"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Briefcase,
  Plus,
  ExternalLink,
  Trophy,
  XCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
} from "lucide-react"
import Link from "next/link"

interface Deal {
  id: string
  title: string
  value: number
  probability: number
  expected_close_date: string | null
  stage_id: string
  stage?: { id: string; name: string; color: string } | null
  won_at: string | null
  lost_at: string | null
  created_at: string
}

interface Pipeline {
  id: string
  name: string
  stages: { id: string; name: string; color: string; position: number }[]
}

interface DealQuickViewProps {
  conversationId: string
  contactId: string | null
  contactName: string | null
  onDealCreated?: () => void
}

export function DealQuickView({
  conversationId,
  contactId,
  contactName,
  onDealCreated,
}: DealQuickViewProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [deal, setDeal] = useState<Deal | null>(null)
  const [pipelines, setPipelines] = useState<Pipeline[]>([])

  // Form for new deal
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newValue, setNewValue] = useState("")
  const [selectedPipeline, setSelectedPipeline] = useState<string>("")
  const [selectedStage, setSelectedStage] = useState<string>("")

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  // Load deal for this conversation
  const loadDeal = useCallback(async () => {
    setIsLoading(true)
    try {
      // Search for deals linked to this conversation
      const res = await fetch(
        `${API_URL}/deals?include_closed=true&limit=1`
      )
      if (res.ok) {
        const deals = await res.json()
        // Find deal linked to this conversation
        const linkedDeal = deals.find(
          (d: Deal & { conversation_id?: string }) =>
            d.conversation_id === conversationId
        )
        if (linkedDeal) {
          // Load full deal details
          const detailRes = await fetch(`${API_URL}/deals/${linkedDeal.id}`)
          if (detailRes.ok) {
            setDeal(await detailRes.json())
          }
        }
      }
    } catch (error) {
      console.error("Erro ao carregar deal:", error)
    } finally {
      setIsLoading(false)
    }
  }, [API_URL, conversationId])

  // Load pipelines for create form
  const loadPipelines = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/pipelines`)
      if (res.ok) {
        const data = await res.json()
        // Load stages for each pipeline
        const pipelinesWithStages = await Promise.all(
          data.map(async (p: Pipeline) => {
            const stagesRes = await fetch(`${API_URL}/deals/by-pipeline/${p.id}`)
            if (stagesRes.ok) {
              const stages = await stagesRes.json()
              return { ...p, stages: stages.map((s: { id: string; name: string; color: string; position: number }) => ({ id: s.id, name: s.name, color: s.color, position: s.position })) }
            }
            return { ...p, stages: [] }
          })
        )
        setPipelines(pipelinesWithStages)
        if (pipelinesWithStages.length > 0) {
          setSelectedPipeline(pipelinesWithStages[0].id)
          if (pipelinesWithStages[0].stages.length > 0) {
            setSelectedStage(pipelinesWithStages[0].stages[0].id)
          }
        }
      }
    } catch (error) {
      console.error("Erro ao carregar pipelines:", error)
    }
  }, [API_URL])

  useEffect(() => {
    if (isOpen && !deal) {
      loadDeal()
    }
  }, [isOpen, deal, loadDeal])

  useEffect(() => {
    if (showCreateForm && pipelines.length === 0) {
      loadPipelines()
    }
  }, [showCreateForm, pipelines.length, loadPipelines])

  // Update stages when pipeline changes
  useEffect(() => {
    const pipeline = pipelines.find((p) => p.id === selectedPipeline)
    if (pipeline && pipeline.stages.length > 0) {
      setSelectedStage(pipeline.stages[0].id)
    }
  }, [selectedPipeline, pipelines])

  const handleCreateDeal = async () => {
    if (!newTitle.trim() || !selectedPipeline || !selectedStage) return

    setIsCreating(true)
    try {
      const payload: {
        title: string
        value: number
        pipeline_id: string
        stage_id: string
        conversation_id: string
        contact_id?: string
      } = {
        title: newTitle.trim(),
        value: parseFloat(newValue) || 0,
        pipeline_id: selectedPipeline,
        stage_id: selectedStage,
        conversation_id: conversationId,
      }

      if (contactId) {
        payload.contact_id = contactId
      }

      const res = await fetch(`${API_URL}/deals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        const newDeal = await res.json()
        // Load full deal with stage info
        const detailRes = await fetch(`${API_URL}/deals/${newDeal.id}`)
        if (detailRes.ok) {
          setDeal(await detailRes.json())
        }
        setShowCreateForm(false)
        setNewTitle("")
        setNewValue("")
        onDealCreated?.()
      }
    } catch (error) {
      console.error("Erro ao criar deal:", error)
    } finally {
      setIsCreating(false)
    }
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val)
  }

  const isWon = !!deal?.won_at
  const isLost = !!deal?.lost_at
  const isClosed = isWon || isLost

  const currentPipeline = pipelines.find((p) => p.id === selectedPipeline)

  return (
    <div className="relative">
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors ${
          deal
            ? "border-green-200 bg-green-50 text-green-600 hover:bg-green-100 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400"
            : "border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        }`}
        title={deal ? "Ver deal vinculado" : "CRM - Criar deal"}
      >
        <Briefcase className="h-3.5 w-3.5" />
        <span>{deal ? "Deal" : "CRM"}</span>
        {deal && (
          <span className="ml-1 rounded bg-green-200 px-1 text-[10px] font-medium dark:bg-green-800">
            1
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
            <h4 className="flex items-center gap-1.5 text-sm font-medium">
              <Briefcase className="h-4 w-4 text-zinc-500" />
              CRM
            </h4>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          <div className="p-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
              </div>
            ) : deal ? (
              /* Existing deal */
              <div className="space-y-2">
                {/* Status badge */}
                {isClosed && (
                  <div className="flex items-center gap-1">
                    {isWon ? (
                      <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/50 dark:text-green-400">
                        <Trophy className="h-3 w-3" />
                        Ganho
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/50 dark:text-red-400">
                        <XCircle className="h-3 w-3" />
                        Perdido
                      </span>
                    )}
                  </div>
                )}

                {/* Deal info */}
                <div>
                  <h5 className="font-medium text-sm">{deal.title}</h5>
                  <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                    {formatCurrency(deal.value)}
                  </p>
                </div>

                {/* Stage */}
                {deal.stage && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">Etapa:</span>
                    <span
                      className="rounded px-1.5 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: `${deal.stage.color}20`,
                        color: deal.stage.color,
                      }}
                    >
                      {deal.stage.name}
                    </span>
                  </div>
                )}

                {/* Probability */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">Probabilidade:</span>
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                      <div
                        className={`h-full rounded-full ${
                          deal.probability >= 70
                            ? "bg-green-500"
                            : deal.probability >= 40
                            ? "bg-yellow-500"
                            : "bg-red-500"
                        }`}
                        style={{ width: `${deal.probability}%` }}
                      />
                    </div>
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      {deal.probability}%
                    </span>
                  </div>
                </div>

                {/* Link to CRM */}
                <Link
                  href="/crm"
                  className="mt-2 flex items-center justify-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700/50"
                >
                  <ExternalLink className="h-3 w-3" />
                  Ver no CRM
                </Link>
              </div>
            ) : showCreateForm ? (
              /* Create form */
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium">Título</label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder={contactName ? `Deal - ${contactName}` : "Nome do deal"}
                    className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-700"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium">Valor (R$)</label>
                  <input
                    type="number"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder="0"
                    min="0"
                    step="0.01"
                    className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-700"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium">Pipeline</label>
                  <select
                    value={selectedPipeline}
                    onChange={(e) => setSelectedPipeline(e.target.value)}
                    className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-700"
                  >
                    {pipelines.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium">Etapa</label>
                  <select
                    value={selectedStage}
                    onChange={(e) => setSelectedStage(e.target.value)}
                    className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-700"
                  >
                    {currentPipeline?.stages
                      .sort((a, b) => a.position - b.position)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCreateForm(false)}
                    className="flex-1 rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-700"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCreateDeal}
                    disabled={isCreating || !newTitle.trim()}
                    className="flex-1 rounded bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                  >
                    {isCreating ? "Criando..." : "Criar Deal"}
                  </button>
                </div>
              </div>
            ) : (
              /* No deal - show create button */
              <div className="text-center">
                <p className="mb-3 text-sm text-zinc-500">
                  Nenhum deal vinculado a esta conversa
                </p>
                <button
                  onClick={() => {
                    setShowCreateForm(true)
                    setNewTitle(contactName ? `Deal - ${contactName}` : "")
                  }}
                  className="flex w-full items-center justify-center gap-1 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600"
                >
                  <Plus className="h-4 w-4" />
                  Criar Deal
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
