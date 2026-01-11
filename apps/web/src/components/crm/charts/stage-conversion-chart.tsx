"use client"

import { useMemo } from "react"
import { RefreshCw } from "lucide-react"

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

export function StageConversionChart({ data, isLoading }: StageConversionChartProps) {
  // Ordenar por position
  const sortedData = useMemo(() =>
    [...data].sort((a, b) => a.stage_position - b.stage_position),
    [data]
  )

  // Calcular porcentagem relativa ao primeiro stage (100%)
  const firstStageDeals = sortedData[0]?.deals_entered || 1

  const stagesWithPercent = useMemo(() =>
    sortedData.map(stage => ({
      ...stage,
      percent: Math.round((stage.deals_entered / firstStageDeals) * 100)
    })),
    [sortedData, firstStageDeals]
  )

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        Nenhum dado de conversao disponivel
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Funil Horizontal */}
      <div className="flex-1 flex items-center">
        <div className="w-full relative">
          {/* Container do Funil */}
          <div className="flex items-center">
            {stagesWithPercent.map((stage, index) => {
              const isLast = index === stagesWithPercent.length - 1
              const heightPercent = Math.min(Math.max(stage.percent, 5), 100) // minimo 5% para visibilidade, maximo 100%
              const nextPercent = isLast
                ? heightPercent
                : Math.min(Math.max(stagesWithPercent[index + 1]?.percent || heightPercent, 5), 100)

              return (
                <div
                  key={stage.stage_id}
                  className="flex-1 flex flex-col items-center"
                >
                  {/* Nome da etapa */}
                  <div className="text-xs text-zinc-400 mb-2 truncate max-w-full px-1 text-center">
                    {stage.stage_name}
                  </div>

                  {/* Barra do funil com SVG */}
                  <div className="relative w-full h-24 flex items-center justify-center">
                    <svg
                      viewBox="0 0 100 100"
                      className="w-full h-full"
                      preserveAspectRatio="none"
                    >
                      {/* Gradiente */}
                      <defs>
                        <linearGradient id={`gradient-${stage.stage_id}`} x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor={stage.stage_color || "#6366f1"} stopOpacity="0.9" />
                          <stop offset="100%" stopColor={stage.stage_color || "#6366f1"} stopOpacity="0.6" />
                        </linearGradient>
                      </defs>

                      {/* Forma do funil */}
                      <path
                        d={`
                          M 0 ${50 - heightPercent/2}
                          L 100 ${50 - nextPercent/2}
                          L 100 ${50 + nextPercent/2}
                          L 0 ${50 + heightPercent/2}
                          Z
                        `}
                        fill={`url(#gradient-${stage.stage_id})`}
                      />
                    </svg>

                    {/* Porcentagem no centro */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-white font-bold text-sm drop-shadow-lg">
                        {stage.percent}%
                      </span>
                    </div>
                  </div>

                  {/* Numero absoluto */}
                  <div className="text-sm font-medium text-zinc-300 mt-2">
                    {stage.deals_entered.toLocaleString()}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
