"use client"

import { useState, useEffect, useCallback } from "react"
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
  ChevronDown,
  Zap,
  Calendar,
} from "lucide-react"
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

interface CRMDashboardProps {
  pipelineId: string | null
  onClose: () => void
}

// ============= Constants =============
const PERIODS = [
  { value: 1, label: "Hoje" },
  { value: 7, label: "7 dias" },
  { value: 30, label: "30 dias" },
  { value: 90, label: "Trimestre" },
  { value: 365, label: "1 ano" },
]

// ============= Component =============
export function CRMDashboard({ pipelineId, onClose }: CRMDashboardProps) {
  // Existing states
  const [stats, setStats] = useState<Stats | null>(null)
  const [funnel, setFunnel] = useState<FunnelStage[]>([])
  const [topDeals, setTopDeals] = useState<TopDeal[]>([])
  const [overdueDeals, setOverdueDeals] = useState<TopDeal[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [days, setDays] = useState(30)

  // New states for expanded metrics
  const [salesCycle, setSalesCycle] = useState<SalesCycleData | null>(null)
  const [comparison, setComparison] = useState<ComparisonData | null>(null)
  const [lossReasons, setLossReasons] = useState<LossReasonData[]>([])
  const [winRateByStage, setWinRateByStage] = useState<StageWinRateData[]>([])
  const [channelPerformance, setChannelPerformance] = useState<ChannelData[]>([])
  const [trendData, setTrendData] = useState<TrendData[]>([])

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ days: days.toString() })
      if (pipelineId) {
        params.set("pipeline_id", pipelineId)
      }

      // Load all data in parallel
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
        fetch(`${API_URL}/crm/stats?${params}`),
        pipelineId ? fetch(`${API_URL}/crm/funnel/${pipelineId}`) : Promise.resolve(null),
        fetch(`${API_URL}/crm/top-deals?${params}&limit=5`),
        fetch(`${API_URL}/crm/overdue-deals?${params}&limit=5`),
        fetch(`${API_URL}/crm/sales-cycle?${params}`),
        fetch(`${API_URL}/crm/comparison?${params}`),
        fetch(`${API_URL}/crm/loss-reasons-stats?${params}`),
        pipelineId ? fetch(`${API_URL}/crm/win-rate-by-stage/${pipelineId}?${params}`) : Promise.resolve(null),
        fetch(`${API_URL}/crm/channel-performance?${params}`),
        pipelineId ? fetch(`${API_URL}/crm/performance/${pipelineId}?${params}`) : Promise.resolve(null),
      ])

      // Process existing responses
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

      // Process new responses
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
  }, [API_URL, pipelineId, days])

  useEffect(() => {
    loadData()
  }, [loadData])

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
    if (pct > 0) return <span className="text-green-500">▲ {pct.toFixed(1)}%</span>
    if (pct < 0) return <span className="text-red-500">▼ {Math.abs(pct).toFixed(1)}%</span>
    return <span className="text-zinc-400">-</span>
  }

  // Calculate velocity (monthly)
  const velocity = stats && days > 0 ? (stats.won_value_period / days) * 30 : 0

  // Calculate max for funnel bar widths
  const maxFunnelValue = Math.max(...funnel.map((s) => s.total_value), 1)
  const maxFunnelCount = Math.max(...funnel.map((s) => s.deals_count), 1)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-0 md:p-4">
      <div className="h-full md:h-auto md:max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-none md:rounded-lg bg-white shadow-xl dark:bg-zinc-900 flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-3 md:px-6 py-3 md:py-4 dark:border-zinc-800 dark:bg-zinc-900 flex-shrink-0">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <BarChart3 className="h-5 w-5 md:h-6 md:w-6 text-blue-500 flex-shrink-0" />
            <h2 className="text-lg md:text-xl font-semibold truncate">Dashboard CRM</h2>
          </div>
          <div className="flex items-center gap-1 md:gap-3">
            {/* Period selector - expanded */}
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value))}
              className="rounded-lg border border-zinc-300 px-2 md:px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            >
              {PERIODS.map((period) => (
                <option key={period.value} value={period.value}>
                  {period.label}
                </option>
              ))}
            </select>

            <button
              onClick={loadData}
              className="rounded-lg p-2 hover:bg-zinc-100 active:bg-zinc-200 dark:hover:bg-zinc-800 dark:active:bg-zinc-700"
              title="Atualizar"
            >
              <RefreshCw className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`} />
            </button>

            <button
              onClick={onClose}
              className="rounded-lg px-3 md:px-4 py-2 text-sm hover:bg-zinc-100 active:bg-zinc-200 dark:hover:bg-zinc-800 dark:active:bg-zinc-700"
            >
              <span className="hidden md:inline">Fechar</span>
              <span className="md:hidden">X</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 md:p-6">
          {isLoading && !stats ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-zinc-400" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Stats Cards - Row 1 */}
              {stats && (
                <div className="grid grid-cols-2 gap-2 md:gap-4 md:grid-cols-4">
                  {/* Open Deals */}
                  <div className="rounded-lg border border-zinc-200 p-3 md:p-4 dark:border-zinc-800">
                    <div className="flex items-center gap-1 md:gap-2 text-xs md:text-sm text-zinc-500">
                      <Target className="h-3 w-3 md:h-4 md:w-4" />
                      <span className="truncate">Deals Abertos</span>
                    </div>
                    <div className="mt-1 text-xl md:text-2xl font-bold">{stats.open_deals}</div>
                    <div className="mt-1 text-xs md:text-sm text-zinc-500 truncate">
                      {formatCurrency(stats.open_value)}
                    </div>
                  </div>

                  {/* Weighted Value */}
                  <div className="rounded-lg border border-zinc-200 p-3 md:p-4 dark:border-zinc-800">
                    <div className="flex items-center gap-1 md:gap-2 text-xs md:text-sm text-zinc-500">
                      <DollarSign className="h-3 w-3 md:h-4 md:w-4" />
                      <span className="truncate">Valor Ponderado</span>
                    </div>
                    <div className="mt-1 text-xl md:text-2xl font-bold text-green-600 dark:text-green-400 truncate">
                      {formatCurrency(stats.weighted_value)}
                    </div>
                    <div className="hidden md:block mt-1 text-sm text-zinc-500">
                      Baseado na probabilidade
                    </div>
                  </div>

                  {/* Won in Period */}
                  <div className="rounded-lg border border-green-200 bg-green-50 p-3 md:p-4 dark:border-green-800 dark:bg-green-950/30">
                    <div className="flex items-center gap-1 md:gap-2 text-xs md:text-sm text-green-600 dark:text-green-400">
                      <Trophy className="h-3 w-3 md:h-4 md:w-4" />
                      <span className="truncate">Ganhos ({PERIODS.find(p => p.value === days)?.label || `${days}d`})</span>
                    </div>
                    <div className="mt-1 text-xl md:text-2xl font-bold text-green-700 dark:text-green-300">
                      {stats.won_deals_period}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs md:text-sm text-green-600 dark:text-green-400">
                      <span className="truncate">{formatCurrency(stats.won_value_period)}</span>
                      {comparison && (
                        <span className="text-xs">{renderVariation(comparison.variations.won_value_pct)}</span>
                      )}
                    </div>
                  </div>

                  {/* Conversion Rate */}
                  <div className="rounded-lg border border-zinc-200 p-3 md:p-4 dark:border-zinc-800">
                    <div className="flex items-center gap-1 md:gap-2 text-xs md:text-sm text-zinc-500">
                      <TrendingUp className="h-3 w-3 md:h-4 md:w-4" />
                      <span className="truncate">Conversao</span>
                    </div>
                    <div className="mt-1 text-xl md:text-2xl font-bold">
                      {stats.conversion_rate}%
                    </div>
                    <div className="mt-1 text-xs md:text-sm text-zinc-500 truncate">
                      {stats.won_deals}W / {stats.lost_deals}L
                    </div>
                  </div>
                </div>
              )}

              {/* Stats Cards - Row 2 (expanded) */}
              {stats && (
                <div className="grid grid-cols-2 gap-2 md:gap-4 md:grid-cols-5">
                  <div className="rounded-lg border border-zinc-200 p-3 md:p-4 dark:border-zinc-800">
                    <div className="text-xs md:text-sm text-zinc-500 truncate">Ticket Medio</div>
                    <div className="mt-1 text-base md:text-xl font-semibold truncate">
                      {formatCurrency(stats.avg_deal_value)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-zinc-200 p-3 md:p-4 dark:border-zinc-800">
                    <div className="flex items-center justify-between">
                      <span className="text-xs md:text-sm text-zinc-500 truncate">Novos ({PERIODS.find(p => p.value === days)?.label || `${days}d`})</span>
                      {comparison && (
                        <span className="text-xs">{renderVariation(comparison.variations.new_deals_pct)}</span>
                      )}
                    </div>
                    <div className="mt-1 text-base md:text-xl font-semibold">
                      {stats.new_deals_period}
                    </div>
                  </div>
                  <div className="rounded-lg border border-zinc-200 p-3 md:p-4 dark:border-zinc-800">
                    <div className="text-xs md:text-sm text-zinc-500 truncate">Total Pipeline</div>
                    <div className="mt-1 text-base md:text-xl font-semibold truncate">
                      {formatCurrency(stats.total_value)}
                    </div>
                  </div>

                  {/* Ciclo de Vendas */}
                  <div className="rounded-lg border border-zinc-200 p-3 md:p-4 dark:border-zinc-800">
                    <div className="flex items-center gap-1 md:gap-2 text-xs md:text-sm text-zinc-500">
                      <Clock className="h-3 w-3 md:h-4 md:w-4" />
                      <span className="truncate">Ciclo de Vendas</span>
                    </div>
                    <div className="mt-1 text-base md:text-xl font-semibold">
                      {salesCycle ? `${salesCycle.avg_days.toFixed(0)} dias` : "-"}
                    </div>
                    {salesCycle && salesCycle.deals_count > 0 && (
                      <div className="mt-1 text-xs text-zinc-500">
                        {salesCycle.deals_count} deals fechados
                      </div>
                    )}
                  </div>

                  {/* Velocity */}
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 md:p-4 dark:border-blue-800 dark:bg-blue-950/30">
                    <div className="flex items-center gap-1 md:gap-2 text-xs md:text-sm text-blue-600 dark:text-blue-400">
                      <Zap className="h-3 w-3 md:h-4 md:w-4" />
                      <span className="truncate">Velocity</span>
                    </div>
                    <div className="mt-1 text-base md:text-xl font-semibold text-blue-700 dark:text-blue-300 truncate">
                      {formatCurrency(velocity)}/mes
                    </div>
                    <div className="hidden md:block mt-1 text-xs text-blue-600 dark:text-blue-400">
                      Ritmo de fechamento
                    </div>
                  </div>
                </div>
              )}

              {/* Funnel */}
              {funnel.length > 0 && (
                <div className="rounded-lg border border-zinc-200 p-3 md:p-4 dark:border-zinc-800">
                  <h3 className="mb-3 md:mb-4 font-semibold text-sm md:text-base">Funil de Vendas</h3>
                  <div className="space-y-2 md:space-y-3">
                    {funnel
                      .filter((s) => !s.is_win && !s.is_loss)
                      .map((stage) => (
                        <div key={stage.stage_id} className="flex items-center gap-2 md:gap-3">
                          <div
                            className="w-16 md:w-24 flex-shrink-0 truncate text-xs md:text-sm font-medium"
                            style={{ color: stage.stage_color }}
                          >
                            {stage.stage_name}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 md:gap-2">
                              <div className="h-5 md:h-6 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${(stage.total_value / maxFunnelValue) * 100}%`,
                                    backgroundColor: stage.stage_color,
                                  }}
                                />
                              </div>
                              <span className="w-16 md:w-20 text-right text-xs md:text-sm font-medium truncate">
                                {formatCurrency(stage.total_value)}
                              </span>
                            </div>
                          </div>
                          <div className="hidden md:block w-16 text-right text-sm text-zinc-500">
                            {stage.deals_count} deals
                          </div>
                          <div className="md:hidden w-8 text-right text-xs text-zinc-500">
                            {stage.deals_count}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Trend Chart Section */}
              {trendData.length > 0 && (
                <div className="rounded-lg border border-zinc-200 p-3 md:p-4 dark:border-zinc-800">
                  <h3 className="mb-3 md:mb-4 flex items-center gap-2 font-semibold text-sm md:text-base">
                    <Calendar className="h-4 w-4 text-blue-500" />
                    Tendencias
                  </h3>
                  <TrendChart data={trendData} />
                </div>
              )}

              {/* Two columns: Charts */}
              <div className="grid gap-4 md:grid-cols-2">
                {/* Loss Reasons */}
                <div className="rounded-lg border border-zinc-200 p-3 md:p-4 dark:border-zinc-800">
                  <h3 className="mb-3 md:mb-4 flex items-center gap-2 font-semibold text-sm md:text-base">
                    <XCircle className="h-4 w-4 text-red-500" />
                    Motivos de Perda
                  </h3>
                  <LossReasonsChart data={lossReasons} />
                </div>

                {/* Win Rate by Stage */}
                {winRateByStage.length > 0 && (
                  <div className="rounded-lg border border-zinc-200 p-3 md:p-4 dark:border-zinc-800">
                    <h3 className="mb-3 md:mb-4 flex items-center gap-2 font-semibold text-sm md:text-base">
                      <TrendingUp className="h-4 w-4 text-green-500" />
                      Win Rate por Stage
                    </h3>
                    <StageWinRateChart data={winRateByStage} />
                  </div>
                )}
              </div>

              {/* Channel Performance */}
              {channelPerformance.length > 0 && (
                <div className="rounded-lg border border-zinc-200 p-3 md:p-4 dark:border-zinc-800">
                  <h3 className="mb-3 md:mb-4 flex items-center gap-2 font-semibold text-sm md:text-base">
                    <BarChart3 className="h-4 w-4 text-indigo-500" />
                    Performance por Canal
                  </h3>
                  <ChannelPerformanceChart data={channelPerformance} />
                </div>
              )}

              {/* Two columns: Top Deals & Overdue */}
              <div className="grid gap-2 md:gap-4 md:grid-cols-2">
                {/* Top Deals */}
                <div className="rounded-lg border border-zinc-200 p-3 md:p-4 dark:border-zinc-800">
                  <h3 className="mb-2 md:mb-3 flex items-center gap-2 font-semibold text-sm md:text-base">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    Maiores Deals
                  </h3>
                  {topDeals.length === 0 ? (
                    <p className="py-4 text-center text-sm text-zinc-400">
                      Nenhum deal aberto
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {topDeals.map((deal) => (
                        <div
                          key={deal.id}
                          className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/50"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">
                              {deal.title}
                            </div>
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

                {/* Overdue Deals */}
                <div className="rounded-lg border border-red-200 bg-red-50/50 p-3 md:p-4 dark:border-red-800 dark:bg-red-950/20">
                  <h3 className="mb-2 md:mb-3 flex items-center gap-2 font-semibold text-sm md:text-base text-red-600 dark:text-red-400">
                    <AlertTriangle className="h-4 w-4" />
                    Deals Atrasados
                  </h3>
                  {overdueDeals.length === 0 ? (
                    <p className="py-4 text-center text-sm text-zinc-400">
                      Nenhum deal atrasado
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {overdueDeals.map((deal) => (
                        <div
                          key={deal.id}
                          className="flex items-center justify-between rounded-lg bg-white px-3 py-2 dark:bg-zinc-800/50"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">
                              {deal.title}
                            </div>
                            <div className="text-xs text-red-500">
                              Venceu em {deal.expected_close_date && formatDate(deal.expected_close_date)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold">
                              {formatCurrency(deal.value)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
