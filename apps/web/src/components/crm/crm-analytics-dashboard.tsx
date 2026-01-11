"use client"

import { useState, useEffect, useCallback, ReactNode } from "react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { apiFetch } from "@/lib/api"
import { useWorkspace } from "@/contexts/workspace-context"
import Link from "next/link"
import {
  TrendChart,
  LossReasonsChart,
  StageWinRateChart,
  ChannelPerformanceChart,
  type TrendData,
  type LossReasonData,
  type StageWinRateData,
  type ChannelData,
} from "./charts/index"
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Trophy,
  XCircle,
  Clock,
  AlertTriangle,
  BarChart3,
  RefreshCw,
  Zap,
  Calendar,
  GripVertical,
  ArrowLeft,
  RotateCcw,
} from "lucide-react"

// ============= Interfaces =============
interface Stats {
  total_deals: number
  total_value: number
  open_deals: number
  open_value: number
  weighted_value: number
  won_deals: number
  won_value: number
  lost_deals: number
  conversion_rate: number
  avg_deal_value: number
  period_days: number
  new_deals_period: number
  won_deals_period: number
  won_value_period: number
}

interface FunnelStage {
  stage_id: string
  stage_name: string
  stage_color: string
  position: number
  is_win: boolean
  is_loss: boolean
  deals_count: number
  total_value: number
}

interface TopDeal {
  id: string
  title: string
  value: number
  probability: number
  expected_close_date: string | null
  stage: { name: string; color: string } | null
  contact: { display_name: string } | null
}

interface SalesCycleData {
  avg_days: number
  min_days: number
  max_days: number
  deals_count: number
}

interface ComparisonData {
  current_period: { new_deals: number; won_deals: number; won_value: number }
  previous_period: { new_deals: number; won_deals: number; won_value: number }
  variations: { new_deals_pct: number; won_deals_pct: number; won_value_pct: number }
}

interface DashboardBlock {
  id: string
  title: string
  size: "small" | "medium" | "large"
}

interface CRMAnalyticsDashboardProps {
  pipelineId?: string | null
}

// ============= Constants =============
const PERIODS = [
  { value: 1, label: "Hoje" },
  { value: 7, label: "7 dias" },
  { value: 30, label: "30 dias" },
  { value: 90, label: "Trimestre" },
  { value: 365, label: "1 ano" },
]

const DEFAULT_BLOCKS: DashboardBlock[] = [
  { id: "deals-abertos", title: "Deals Abertos", size: "small" },
  { id: "valor-ponderado", title: "Valor Ponderado", size: "small" },
  { id: "ganhos-periodo", title: "Ganhos no Periodo", size: "small" },
  { id: "conversao", title: "Taxa de Conversao", size: "small" },
  { id: "ticket-medio", title: "Ticket Medio", size: "small" },
  { id: "novos-deals", title: "Novos Deals", size: "small" },
  { id: "total-pipeline", title: "Total Pipeline", size: "small" },
  { id: "ciclo-vendas", title: "Ciclo de Vendas", size: "small" },
  { id: "velocity", title: "Velocity", size: "small" },
  { id: "funil", title: "Funil de Vendas", size: "large" },
  { id: "tendencias", title: "Tendencias", size: "medium" },
  { id: "loss-reasons", title: "Motivos de Perda", size: "medium" },
  { id: "win-rate", title: "Win Rate por Stage", size: "medium" },
  { id: "channel-performance", title: "Performance por Canal", size: "medium" },
  { id: "top-deals", title: "Maiores Deals", size: "medium" },
  { id: "overdue-deals", title: "Deals Atrasados", size: "medium" },
]

const STORAGE_KEY = "crm-dashboard-layout"

// ============= Sortable Block Component =============
interface SortableBlockProps {
  id: string
  children: ReactNode
  size: string
}

function SortableBlock({ id, children, size }: SortableBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const sizeClass = size === "large" ? "col-span-4" : size === "medium" ? "col-span-2" : "col-span-1"

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative ${sizeClass} ${isDragging ? "z-50 opacity-75" : ""}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 right-2 z-10 cursor-grab rounded p-1 hover:bg-zinc-200 active:cursor-grabbing dark:hover:bg-zinc-700"
      >
        <GripVertical className="h-4 w-4 text-zinc-400" />
      </div>
      {children}
    </div>
  )
}

// ============= Skeleton Components =============
function SkeletonCard({ size = "small" }: { size?: "small" | "medium" | "large" }) {
  const heightClass = size === "small" ? "h-28" : size === "medium" ? "h-64" : "h-80"
  return (
    <div className={`animate-pulse rounded-lg border border-zinc-200 p-4 dark:border-zinc-800 ${heightClass}`}>
      <div className="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-3 h-8 w-32 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-2 h-4 w-20 rounded bg-zinc-200 dark:bg-zinc-700" />
    </div>
  )
}

// ============= Main Component =============
export function CRMAnalyticsDashboard({ pipelineId = null }: CRMAnalyticsDashboardProps) {
  // Workspace context para Link dinâmico
  const { currentWorkspace } = useWorkspace()

  // Blocks state - inicializa com DEFAULT para evitar hydration mismatch
  const [blocks, setBlocks] = useState<DashboardBlock[]>(DEFAULT_BLOCKS)
  const [isLayoutLoaded, setIsLayoutLoaded] = useState(false)

  // Data states
  const [days, setDays] = useState(30)
  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState<Stats | null>(null)
  const [funnel, setFunnel] = useState<FunnelStage[]>([])
  const [topDeals, setTopDeals] = useState<TopDeal[]>([])
  const [overdueDeals, setOverdueDeals] = useState<TopDeal[]>([])
  const [salesCycle, setSalesCycle] = useState<SalesCycleData | null>(null)
  const [comparison, setComparison] = useState<ComparisonData | null>(null)
  const [lossReasons, setLossReasons] = useState<LossReasonData[]>([])
  const [winRateByStage, setWinRateByStage] = useState<StageWinRateData[]>([])
  const [channelPerformance, setChannelPerformance] = useState<ChannelData[]>([])
  const [trendData, setTrendData] = useState<TrendData[]>([])

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Carregar layout do localStorage após montagem (evita hydration mismatch)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        setBlocks(JSON.parse(saved))
      }
    } catch (error) {
      console.error("Erro ao carregar layout do dashboard:", error)
      localStorage.removeItem(STORAGE_KEY)
    }
    setIsLayoutLoaded(true)
  }, [])

  // Persist blocks order to localStorage (só após carregamento inicial)
  useEffect(() => {
    if (isLayoutLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks))
    }
  }, [blocks, isLayoutLoaded])

  // Load data function
  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ days: days.toString() })
      if (pipelineId) {
        params.set("pipeline_id", pipelineId)
      }

      const [
        statsRes,
        funnelRes,
        topRes,
        overdueRes,
        salesCycleRes,
        comparisonRes,
        lossReasonsRes,
        winRateRes,
        channelRes,
        performanceRes,
      ] = await Promise.all([
        apiFetch(`/crm/stats?${params}`),
        pipelineId ? apiFetch(`/crm/funnel/${pipelineId}`) : Promise.resolve(null),
        apiFetch(`/crm/top-deals?${params}&limit=5`),
        apiFetch(`/crm/overdue-deals?${params}&limit=5`),
        apiFetch(`/crm/sales-cycle?${params}`),
        apiFetch(`/crm/comparison?${params}`),
        apiFetch(`/crm/loss-reasons-stats?${params}`),
        pipelineId ? apiFetch(`/crm/win-rate-by-stage/${pipelineId}?${params}`) : Promise.resolve(null),
        apiFetch(`/crm/channel-performance?${params}`),
        pipelineId ? apiFetch(`/crm/performance/${pipelineId}?${params}`) : Promise.resolve(null),
      ])

      if (statsRes.ok) {
        setStats(await statsRes.json())
      }

      if (funnelRes && funnelRes.ok) {
        const data = await funnelRes.json()
        setFunnel(data.stages || [])
      }

      if (topRes.ok) {
        const data = await topRes.json()
        setTopDeals(data.deals || [])
      }

      if (overdueRes.ok) {
        const data = await overdueRes.json()
        setOverdueDeals(data.deals || [])
      }

      if (salesCycleRes.ok) {
        setSalesCycle(await salesCycleRes.json())
      }

      if (comparisonRes.ok) {
        setComparison(await comparisonRes.json())
      }

      if (lossReasonsRes.ok) {
        const data = await lossReasonsRes.json()
        setLossReasons(data.reasons || [])
      }

      if (winRateRes && winRateRes.ok) {
        const data = await winRateRes.json()
        setWinRateByStage(data.stages || [])
      }

      if (channelRes.ok) {
        const data = await channelRes.json()
        setChannelPerformance(data.channels || [])
      }

      if (performanceRes && performanceRes.ok) {
        const data = await performanceRes.json()
        setTrendData(data.trend || [])
      }
    } catch (error) {
      console.error("Erro ao carregar dashboard:", error)
    } finally {
      setIsLoading(false)
    }
  }, [pipelineId, days])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setBlocks((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id)
        const newIndex = items.findIndex((i) => i.id === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  // Reset layout
  const resetLayout = () => {
    setBlocks(DEFAULT_BLOCKS)
    localStorage.removeItem(STORAGE_KEY)
  }

  // ============= Formatters =============
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      notation: val >= 1000000 ? "compact" : "standard",
      maximumFractionDigits: val >= 1000000 ? 1 : 0,
    }).format(val)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    })
  }

  const renderVariation = (pct: number) => {
    if (pct > 0) return <span className="text-green-500">+{pct.toFixed(1)}%</span>
    if (pct < 0) return <span className="text-red-500">{pct.toFixed(1)}%</span>
    return <span className="text-zinc-400">-</span>
  }

  // Calculate velocity (monthly)
  const velocity = stats && days > 0 ? (stats.won_value_period / days) * 30 : 0

  // Calculate max for funnel bar widths
  const maxFunnelValue = Math.max(...funnel.map((s) => s.total_value), 1)

  const periodLabel = PERIODS.find((p) => p.value === days)?.label || `${days}d`

  // ============= Render Block Content =============
  const renderBlockContent = (blockId: string): ReactNode => {
    if (isLoading && !stats) {
      const block = blocks.find((b) => b.id === blockId)
      return <SkeletonCard size={block?.size} />
    }

    switch (blockId) {
      case "deals-abertos":
        return (
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Target className="h-4 w-4" />
              <span>Deals Abertos</span>
            </div>
            <div className="mt-1 text-2xl font-bold">{stats?.open_deals ?? 0}</div>
            <div className="mt-1 text-sm text-zinc-500">{formatCurrency(stats?.open_value ?? 0)}</div>
          </div>
        )

      case "valor-ponderado":
        return (
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <DollarSign className="h-4 w-4" />
              <span>Valor Ponderado</span>
            </div>
            <div className="mt-1 truncate text-2xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(stats?.weighted_value ?? 0)}
            </div>
            <div className="mt-1 text-sm text-zinc-500">Baseado na probabilidade</div>
          </div>
        )

      case "ganhos-periodo":
        return (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/30">
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <Trophy className="h-4 w-4" />
              <span>Ganhos ({periodLabel})</span>
            </div>
            <div className="mt-1 text-2xl font-bold text-green-700 dark:text-green-300">
              {stats?.won_deals_period ?? 0}
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <span>{formatCurrency(stats?.won_value_period ?? 0)}</span>
              {comparison && <span className="text-xs">{renderVariation(comparison.variations.won_value_pct)}</span>}
            </div>
          </div>
        )

      case "conversao":
        return (
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <TrendingUp className="h-4 w-4" />
              <span>Conversao</span>
            </div>
            <div className="mt-1 text-2xl font-bold">{stats?.conversion_rate ?? 0}%</div>
            <div className="mt-1 text-sm text-zinc-500">
              {stats?.won_deals ?? 0}W / {stats?.lost_deals ?? 0}L
            </div>
          </div>
        )

      case "ticket-medio":
        return (
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="text-sm text-zinc-500">Ticket Medio</div>
            <div className="mt-1 truncate text-xl font-semibold">{formatCurrency(stats?.avg_deal_value ?? 0)}</div>
          </div>
        )

      case "novos-deals":
        return (
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">Novos ({periodLabel})</span>
              {comparison && <span className="text-xs">{renderVariation(comparison.variations.new_deals_pct)}</span>}
            </div>
            <div className="mt-1 text-xl font-semibold">{stats?.new_deals_period ?? 0}</div>
          </div>
        )

      case "total-pipeline":
        return (
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="text-sm text-zinc-500">Total Pipeline</div>
            <div className="mt-1 truncate text-xl font-semibold">{formatCurrency(stats?.total_value ?? 0)}</div>
          </div>
        )

      case "ciclo-vendas":
        return (
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Clock className="h-4 w-4" />
              <span>Ciclo de Vendas</span>
            </div>
            <div className="mt-1 text-xl font-semibold">
              {salesCycle ? `${salesCycle.avg_days.toFixed(0)} dias` : "-"}
            </div>
            {salesCycle && salesCycle.deals_count > 0 && (
              <div className="mt-1 text-xs text-zinc-500">{salesCycle.deals_count} deals fechados</div>
            )}
          </div>
        )

      case "velocity":
        return (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
            <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
              <Zap className="h-4 w-4" />
              <span>Velocity</span>
            </div>
            <div className="mt-1 truncate text-xl font-semibold text-blue-700 dark:text-blue-300">
              {formatCurrency(velocity)}/mes
            </div>
            <div className="mt-1 text-xs text-blue-600 dark:text-blue-400">Ritmo de fechamento</div>
          </div>
        )

      case "funil":
        if (funnel.length === 0) {
          return (
            <div className="flex h-80 items-center justify-center rounded-lg border border-zinc-200 p-4 text-zinc-400 dark:border-zinc-800">
              Selecione um pipeline para ver o funil
            </div>
          )
        }
        return (
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <h3 className="mb-4 font-semibold">Funil de Vendas</h3>
            <div className="space-y-3">
              {funnel
                .filter((s) => !s.is_win && !s.is_loss)
                .map((stage) => (
                  <div key={stage.stage_id} className="flex items-center gap-3">
                    <div
                      className="w-24 flex-shrink-0 truncate text-sm font-medium"
                      style={{ color: stage.stage_color }}
                    >
                      {stage.stage_name}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="h-6 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${(stage.total_value / maxFunnelValue) * 100}%`,
                              backgroundColor: stage.stage_color,
                            }}
                          />
                        </div>
                        <span className="w-20 text-right text-sm font-medium">{formatCurrency(stage.total_value)}</span>
                      </div>
                    </div>
                    <div className="w-16 text-right text-sm text-zinc-500">{stage.deals_count} deals</div>
                  </div>
                ))}
            </div>
          </div>
        )

      case "tendencias":
        return (
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <h3 className="mb-4 flex items-center gap-2 font-semibold">
              <Calendar className="h-4 w-4 text-blue-500" />
              Tendencias
            </h3>
            <TrendChart data={trendData} isLoading={isLoading} />
          </div>
        )

      case "loss-reasons":
        return (
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <h3 className="mb-4 flex items-center gap-2 font-semibold">
              <XCircle className="h-4 w-4 text-red-500" />
              Motivos de Perda
            </h3>
            <LossReasonsChart data={lossReasons} isLoading={isLoading} />
          </div>
        )

      case "win-rate":
        return (
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <h3 className="mb-4 flex items-center gap-2 font-semibold">
              <TrendingUp className="h-4 w-4 text-green-500" />
              Win Rate por Stage
            </h3>
            <StageWinRateChart data={winRateByStage} isLoading={isLoading} />
          </div>
        )

      case "channel-performance":
        return (
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <h3 className="mb-4 flex items-center gap-2 font-semibold">
              <BarChart3 className="h-4 w-4 text-indigo-500" />
              Performance por Canal
            </h3>
            <ChannelPerformanceChart data={channelPerformance} isLoading={isLoading} />
          </div>
        )

      case "top-deals":
        return (
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <h3 className="mb-3 flex items-center gap-2 font-semibold">
              <TrendingUp className="h-4 w-4 text-green-500" />
              Maiores Deals
            </h3>
            {topDeals.length === 0 ? (
              <p className="py-4 text-center text-sm text-zinc-400">Nenhum deal aberto</p>
            ) : (
              <div className="space-y-2">
                {topDeals.map((deal) => (
                  <div
                    key={deal.id}
                    className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{deal.title}</div>
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        {deal.stage && (
                          <span
                            className="rounded px-1.5 py-0.5"
                            style={{
                              backgroundColor: `${deal.stage.color}20`,
                              color: deal.stage.color,
                            }}
                          >
                            {deal.stage.name}
                          </span>
                        )}
                        <span>{deal.probability}%</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-green-600 dark:text-green-400">
                        {formatCurrency(deal.value)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )

      case "overdue-deals":
        return (
          <div className="rounded-lg border border-red-200 bg-red-50/50 p-4 dark:border-red-800 dark:bg-red-950/20">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" />
              Deals Atrasados
            </h3>
            {overdueDeals.length === 0 ? (
              <p className="py-4 text-center text-sm text-zinc-400">Nenhum deal atrasado</p>
            ) : (
              <div className="space-y-2">
                {overdueDeals.map((deal) => (
                  <div
                    key={deal.id}
                    className="flex items-center justify-between rounded-lg bg-white px-3 py-2 dark:bg-zinc-800/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{deal.title}</div>
                      <div className="text-xs text-red-500">
                        Venceu em {deal.expected_close_date && formatDate(deal.expected_close_date)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{formatCurrency(deal.value)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      {/* Header fixo */}
      <div className="sticky top-0 z-40 border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-700 dark:bg-zinc-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={currentWorkspace ? `/${currentWorkspace.id}/crm` : "/crm"}
              className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700"
              title="Voltar para CRM"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <BarChart3 className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl font-semibold">Dashboard CRM</h1>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value))}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            >
              {PERIODS.map((period) => (
                <option key={period.value} value={period.value}>
                  {period.label}
                </option>
              ))}
            </select>
            <button
              onClick={loadData}
              className="rounded-lg p-2 hover:bg-zinc-100 active:bg-zinc-200 dark:hover:bg-zinc-700"
              title="Atualizar"
            >
              <RefreshCw className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={resetLayout}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-zinc-100 active:bg-zinc-200 dark:hover:bg-zinc-700"
              title="Resetar Layout"
            >
              <RotateCcw className="h-4 w-4" />
              <span className="hidden md:inline">Resetar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Grid canvas com drag */}
      <div className="p-6">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={blocks.map((b) => b.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {blocks.map((block) => (
                <SortableBlock key={block.id} id={block.id} size={block.size}>
                  {renderBlockContent(block.id)}
                </SortableBlock>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  )
}
