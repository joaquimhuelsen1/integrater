"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts"
import { RefreshCw } from "lucide-react"

export interface StageWinRateData {
  stage_name: string
  stage_color: string
  deals_entered: number
  deals_to_won: number
  deals_to_lost: number
  win_rate: number
}

interface StageWinRateChartProps {
  data: StageWinRateData[]
  isLoading?: boolean
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    payload: StageWinRateData
  }>
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || !payload.length || !payload[0]) return null

  const data = payload[0].payload

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
      <p className="mb-2 font-medium text-zinc-900 dark:text-zinc-100">
        {data.stage_name}
      </p>
      <div className="space-y-1 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="text-zinc-600 dark:text-zinc-400">Taxa de conversao:</span>
          <span
            className={`font-bold ${
              data.win_rate >= 50
                ? "text-green-600 dark:text-green-400"
                : data.win_rate >= 25
                ? "text-yellow-600 dark:text-yellow-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {data.win_rate.toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-zinc-600 dark:text-zinc-400">Entraram:</span>
          <span className="font-medium">{data.deals_entered} deals</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-zinc-600 dark:text-zinc-400">Ganharam:</span>
          <span className="font-medium text-green-600 dark:text-green-400">
            {data.deals_to_won}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-zinc-600 dark:text-zinc-400">Perderam:</span>
          <span className="font-medium text-red-600 dark:text-red-400">
            {data.deals_to_lost}
          </span>
        </div>
      </div>
    </div>
  )
}

// Determinar cor baseado no win rate
function getWinRateColor(winRate: number, stageColor: string): string {
  if (winRate < 25) return "#ef4444" // red-500 - baixo
  if (winRate < 50) return "#f59e0b" // amber-500 - medio
  return stageColor || "#22c55e" // usar cor do stage ou verde
}

export function StageWinRateChart({ data, isLoading }: StageWinRateChartProps) {
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-zinc-400">
        Nenhum dado de stage disponivel
      </div>
    )
  }

  // Calcular media de win rate
  const avgWinRate =
    data.reduce((sum, item) => sum + item.win_rate, 0) / data.length

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            className="text-zinc-200 dark:text-zinc-700"
            horizontal={true}
            vertical={false}
          />
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fontSize: 12 }}
            stroke="currentColor"
            className="text-zinc-500"
            tickFormatter={(value: number) => `${value}%`}
          />
          <YAxis
            type="category"
            dataKey="stage_name"
            tick={{ fontSize: 11 }}
            stroke="currentColor"
            className="text-zinc-500"
            width={100}
            tickFormatter={(value: string) =>
              value.length > 15 ? `${value.substring(0, 15)}...` : value
            }
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.05)" }} />
          <ReferenceLine
            x={avgWinRate}
            stroke="#6b7280"
            strokeDasharray="3 3"
            label={{
              value: `Media: ${avgWinRate.toFixed(0)}%`,
              position: "top",
              fontSize: 10,
              fill: "#6b7280",
            }}
          />
          <Bar dataKey="win_rate" radius={[0, 4, 4, 0]} maxBarSize={30}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={getWinRateColor(entry.win_rate, entry.stage_color)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Legenda de cores */}
      <div className="mt-2 flex justify-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-red-500" />
          <span className="text-zinc-600 dark:text-zinc-400">&lt; 25%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-amber-500" />
          <span className="text-zinc-600 dark:text-zinc-400">25-50%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-zinc-600 dark:text-zinc-400">&gt; 50%</span>
        </div>
      </div>
    </div>
  )
}
