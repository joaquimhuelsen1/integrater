"use client"

import { useDroppable } from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { Plus } from "lucide-react"
import { DealCard } from "./deal-card"

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

interface Stage {
  id: string
  name: string
  color: string
  position: number
  is_win: boolean
  is_loss: boolean
  deals: Deal[]
}

interface StageColumnProps {
  stage: Stage
  onDealClick: (dealId: string) => void
  onCreateDeal: (stageId: string) => void
  onArchiveDeal?: (dealId: string) => void
  onDeleteDeal?: (dealId: string) => void
}

export function StageColumn({ stage, onDealClick, onCreateDeal, onArchiveDeal, onDeleteDeal }: StageColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
  })

  const totalValue = stage.deals.reduce((sum, d) => sum + d.value, 0)

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 flex-shrink-0 flex-col rounded-lg ${
        isOver
          ? "bg-blue-50 dark:bg-blue-950/20"
          : "bg-zinc-100/50 dark:bg-zinc-900/50"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">
            {stage.name}
          </span>
          <span className="text-xs text-zinc-400">
            {stage.deals.length}
          </span>
        </div>
        <button
          onClick={() => onCreateDeal(stage.id)}
          className="rounded p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Total */}
      <div className="px-3 pb-2 text-xs text-zinc-400">
        {formatCurrency(totalValue)}
      </div>

      {/* Deals */}
      <div className="flex-1 min-h-[200px] overflow-y-auto p-2">
        <SortableContext
          items={stage.deals.map((d) => d.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-2 min-h-full">
            {stage.deals.map((deal) => (
              <DealCard
                key={deal.id}
                deal={deal}
                onClick={() => onDealClick(deal.id)}
                onArchive={onArchiveDeal}
                onDelete={onDeleteDeal}
              />
            ))}
            {stage.deals.length === 0 && (
              <div className="flex h-full min-h-[150px] items-center justify-center text-xs text-zinc-400">
                Arraste deals aqui
              </div>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  )
}
