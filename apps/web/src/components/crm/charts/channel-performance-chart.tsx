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
import { RefreshCw, MessageCircle, Mail, Phone } from "lucide-react"

export interface ChannelData {
  channel: string
  messages_count: number
  deals_touched: number
  won_value: number
}

interface ChannelPerformanceChartProps {
  data: ChannelData[]
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

// Cores por canal
const CHANNEL_COLORS: Record<string, string> = {
  telegram: "#0088cc",
  email: "#ea4335",
  sms: "#34a853",
  openphone: "#6366f1",
}

// Labels em portugues
const CHANNEL_LABELS: Record<string, string> = {
  telegram: "Telegram",
  email: "Email",
  sms: "SMS",
  openphone: "OpenPhone",
}

// Icones por canal
const ChannelIcon = ({ channel }: { channel: string }) => {
  switch (channel.toLowerCase()) {
    case "telegram":
      return <MessageCircle className="h-4 w-4" style={{ color: CHANNEL_COLORS.telegram }} />
    case "email":
      return <Mail className="h-4 w-4" style={{ color: CHANNEL_COLORS.email }} />
    case "sms":
    case "openphone":
      return <Phone className="h-4 w-4" style={{ color: CHANNEL_COLORS.sms }} />
    default:
      return <MessageCircle className="h-4 w-4 text-zinc-400" />
  }
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    payload: ChannelData
    dataKey: string
    value: number
    color: string
  }>
  label?: string
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || !payload.length || !payload[0]) return null

  const data = payload[0].payload

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
      <div className="mb-2 flex items-center gap-2">
        <ChannelIcon channel={data.channel} />
        <span className="font-medium text-zinc-900 dark:text-zinc-100">
          {CHANNEL_LABELS[data.channel] || data.channel}
        </span>
      </div>
      <div className="space-y-1 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="text-zinc-600 dark:text-zinc-400">Mensagens:</span>
          <span className="font-medium">{data.messages_count.toLocaleString("pt-BR")}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-zinc-600 dark:text-zinc-400">Deals tocados:</span>
          <span className="font-medium">{data.deals_touched}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-zinc-600 dark:text-zinc-400">Valor ganho:</span>
          <span className="font-medium text-green-600 dark:text-green-400">
            {formatCurrency(data.won_value)}
          </span>
        </div>
      </div>
    </div>
  )
}

export function ChannelPerformanceChart({ data, isLoading }: ChannelPerformanceChartProps) {
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
        Nenhum dado de canal disponivel
      </div>
    )
  }

  // Preparar dados com labels traduzidos
  const chartData = data.map((item) => ({
    ...item,
    name: CHANNEL_LABELS[item.channel] || item.channel,
    fill: CHANNEL_COLORS[item.channel] || "#6b7280",
  }))

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            className="text-zinc-200 dark:text-zinc-700"
            vertical={false}
          />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12 }}
            stroke="currentColor"
            className="text-zinc-500"
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 12 }}
            stroke="currentColor"
            className="text-zinc-500"
            allowDecimals={false}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 12 }}
            stroke="currentColor"
            className="text-zinc-500"
            tickFormatter={(value: number) => {
              if (value >= 1000000) return `${(value / 1000000).toFixed(0)}M`
              if (value >= 1000) return `${(value / 1000).toFixed(0)}K`
              return value.toString()
            }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.05)" }} />
          <Legend
            wrapperStyle={{ fontSize: "12px" }}
            formatter={(value) => {
              const labels: Record<string, string> = {
                messages_count: "Mensagens",
                won_value: "Valor Ganho (R$)",
              }
              return labels[value] || value
            }}
          />
          <Bar
            yAxisId="left"
            dataKey="messages_count"
            fill="#3b82f6"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
            name="messages_count"
          />
          <Bar
            yAxisId="right"
            dataKey="won_value"
            fill="#22c55e"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
            name="won_value"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
