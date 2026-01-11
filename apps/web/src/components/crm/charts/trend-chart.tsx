"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { RefreshCw } from "lucide-react"

export interface TrendData {
  date: string
  created: number
  won: number
  lost: number
  won_value: number
}

interface TrendChartProps {
  data: TrendData[]
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

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  })
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    name: string
    value: number
    color: string
    dataKey: string
    payload: TrendData
  }>
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !payload.length || !payload[0]) return null

  const data = payload[0].payload

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
      <p className="mb-2 font-medium text-zinc-900 dark:text-zinc-100">
        {label ? formatDate(label) : ""}
      </p>
      <div className="space-y-1 text-sm">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-blue-500" />
          <span className="text-zinc-600 dark:text-zinc-400">Criados:</span>
          <span className="font-medium">{data?.created ?? 0}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-zinc-600 dark:text-zinc-400">Ganhos:</span>
          <span className="font-medium">{data?.won ?? 0}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-red-500" />
          <span className="text-zinc-600 dark:text-zinc-400">Perdidos:</span>
          <span className="font-medium">{data?.lost ?? 0}</span>
        </div>
        {data?.won_value !== undefined && data.won_value > 0 && (
          <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
            <span className="text-zinc-600 dark:text-zinc-400">Valor ganho: </span>
            <span className="font-medium text-green-600 dark:text-green-400">
              {formatCurrency(data.won_value)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export function TrendChart({ data, isLoading }: TrendChartProps) {
  if (isLoading) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center text-zinc-400">
        Sem dados para o periodo selecionado
      </div>
    )
  }

  return (
    <div className="h-full min-h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 20, right: 20, left: 0, bottom: 5 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            className="text-zinc-200 dark:text-zinc-700"
          />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 12 }}
            stroke="currentColor"
            className="text-zinc-500"
          />
          <YAxis
            tick={{ fontSize: 12 }}
            stroke="currentColor"
            className="text-zinc-500"
            allowDecimals={false}
            domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.1) || 5]}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: "12px" }}
            formatter={(value) => {
              const labels: Record<string, string> = {
                created: "Criados",
                won: "Ganhos",
                lost: "Perdidos",
              }
              return labels[value] || value
            }}
          />
          <Bar
            dataKey="created"
            fill="#3b82f6"
            name="created"
            label={{ position: 'top', fill: '#3b82f6', fontSize: 11 }}
          />
          <Bar
            dataKey="won"
            fill="#22c55e"
            name="won"
            label={{ position: 'top', fill: '#22c55e', fontSize: 11 }}
          />
          <Bar
            dataKey="lost"
            fill="#ef4444"
            name="lost"
            label={{ position: 'top', fill: '#ef4444', fontSize: 11 }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
