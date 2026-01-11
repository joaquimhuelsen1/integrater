"use client"

import { RefreshCw, ArrowDown } from "lucide-react"

export interface StageConversionData {
  stage_id: string
  stage_name: string
  stage_position: number
  stage_color: string
  deals_entered: number
  deals_progressed: number
  conversion_rate: number
}

interface StageConversionChartProps {
  data: StageConversionData[]
  isLoading?: boolean
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    payload: StageConversionData
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
          <span className="text-zinc-600 dark:text-zinc-400">Entraram:</span>
          <span className="font-medium">{data.deals_entered} deals</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-zinc-600 dark:text-zinc-400">Avancaram:</span>
          <span className="font-medium text-green-600 dark:text-green-400">
            {data.deals_progressed} deals
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-zinc-600 dark:text-zinc-400">Conversao:</span>
          <span
            className={`font-bold ${
              data.conversion_rate >= 70
                ? "text-green-600 dark:text-green-400"
                : data.conversion_rate >= 40
                ? "text-yellow-600 dark:text-yellow-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {data.conversion_rate.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  )
}

export function StageConversionChart({ data, isLoading }: StageConversionChartProps) {
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
        Nenhum dado de conversao disponivel
      </div>
    )
  }

  // Ordenar por posicao
  const sortedData = [...data].sort((a, b) => a.stage_position - b.stage_position)
  const firstStageDeals = sortedData[0]?.deals_entered ?? 1

  return (
    <div className="space-y-1">
      {sortedData.map((stage, index) => {
        const isLast = index === sortedData.length - 1
        const nextStage = !isLast ? sortedData[index + 1] : null

        return (
          <div key={stage.stage_id}>
            {/* Barra do Stage */}
            <div className="flex items-center gap-3">
              {/* Nome do Stage */}
              <div
                className="w-24 md:w-32 flex-shrink-0 truncate text-xs md:text-sm font-medium"
                style={{ color: stage.stage_color }}
                title={stage.stage_name}
              >
                {stage.stage_name}
              </div>

              {/* Barra horizontal */}
              <div className="flex-1 min-w-0">
                <div className="h-6 md:h-7 overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-md flex items-center justify-end pr-2 transition-all"
                    style={{
                      width: `${Math.max((stage.deals_entered / firstStageDeals) * 100, 8)}%`,
                      backgroundColor: stage.stage_color,
                    }}
                  >
                    <span className="text-xs font-medium text-white drop-shadow-sm">
                      {stage.deals_entered}
                    </span>
                  </div>
                </div>
              </div>

              {/* Porcentagem */}
              <div className="w-14 md:w-16 text-right text-xs md:text-sm font-medium text-zinc-600 dark:text-zinc-400">
                {index === 0 ? "100%" : `${((stage.deals_entered / firstStageDeals) * 100).toFixed(0)}%`}
              </div>
            </div>

            {/* Seta de conversao entre stages */}
            {!isLast && nextStage && (
              <div className="flex items-center gap-3 py-0.5">
                <div className="w-24 md:w-32 flex-shrink-0" />
                <div className="flex items-center gap-1 text-xs text-zinc-500">
                  <ArrowDown className="h-3 w-3" />
                  <span
                    className={`font-medium ${
                      stage.conversion_rate >= 70
                        ? "text-green-600 dark:text-green-400"
                        : stage.conversion_rate >= 40
                        ? "text-yellow-600 dark:text-yellow-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {stage.conversion_rate.toFixed(0)}%
                  </span>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Legenda */}
      <div className="mt-3 pt-2 border-t border-zinc-200 dark:border-zinc-700">
        <div className="flex justify-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-red-500" />
            <span className="text-zinc-600 dark:text-zinc-400">&lt; 40%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-yellow-500" />
            <span className="text-zinc-600 dark:text-zinc-400">40-70%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-zinc-600 dark:text-zinc-400">&gt; 70%</span>
          </div>
        </div>
      </div>
    </div>
  )
}
