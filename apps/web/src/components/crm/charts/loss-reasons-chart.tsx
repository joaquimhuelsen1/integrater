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
} from "recharts"
import { RefreshCw } from "lucide-react"

export interface LossReasonData {
  reason_name: string
  count: number
  percentage: number
  total_value: number
}

interface LossReasonsChartProps {
  data: LossReasonData[]
  isLoading?: boolean
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: value >= 1000000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1000000 ? 1 : 0,
  }).format(value)
}

// Cores em tons de vermelho/laranja para motivos de perda
const LOSS_COLORS = [
  "#ef4444", // red-500
  "#f97316", // orange-500
  "#fb923c", // orange-400
  "#fdba74", // orange-300
  "#fcd34d", // amber-300
]

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    payload: LossReasonData
  }>
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || !payload.length || !payload[0]) return null

  const data = payload[0].payload

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
      <p className="mb-2 font-medium text-zinc-900 dark:text-zinc-100">
        {data.reason_name}
      </p>
      <div className="space-y-1 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="text-zinc-600 dark:text-zinc-400">Quantidade:</span>
          <span className="font-medium">{data.count} deals</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-zinc-600 dark:text-zinc-400">Percentual:</span>
          <span className="font-medium">{data.percentage.toFixed(1)}%</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-zinc-600 dark:text-zinc-400">Valor perdido:</span>
          <span className="font-medium text-red-600 dark:text-red-400">
            {formatCurrency(data.total_value)}
          </span>
        </div>
      </div>
    </div>
  )
}

export function LossReasonsChart({ data, isLoading }: LossReasonsChartProps) {
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
        Nenhum motivo de perda registrado
      </div>
    )
  }

  // Pegar top 5 motivos
  const chartData = data.slice(0, 5)

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
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
            tick={{ fontSize: 12 }}
            stroke="currentColor"
            className="text-zinc-500"
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="reason_name"
            tick={{ fontSize: 11 }}
            stroke="currentColor"
            className="text-zinc-500"
            width={100}
            tickFormatter={(value: string) =>
              value.length > 15 ? `${value.substring(0, 15)}...` : value
            }
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.05)" }} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={30}>
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={LOSS_COLORS[index % LOSS_COLORS.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Legenda com percentuais */}
      <div className="mt-2 flex flex-wrap gap-2 px-2">
        {chartData.map((item, index) => (
          <div
            key={item.reason_name}
            className="flex items-center gap-1.5 text-xs"
          >
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: LOSS_COLORS[index % LOSS_COLORS.length] }}
            />
            <span className="text-zinc-600 dark:text-zinc-400">
              {item.percentage.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
