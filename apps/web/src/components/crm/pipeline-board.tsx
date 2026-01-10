"use client"

import { useState } from "react"
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
} from "@dnd-kit/core"
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { StageColumn } from "./stage-column"
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

interface PipelineBoardProps {
  stages: Stage[]
  onDealMove: (dealId: string, newStageId: string) => void
  onDealClick: (dealId: string) => void
  onCreateDeal: (stageId: string) => void
  onArchiveDeal?: (dealId: string) => void
  onDeleteDeal?: (dealId: string) => void
  onSendMessage?: (dealId: string) => void
}

export function PipelineBoard({
  stages,
  onDealMove,
  onDealClick,
  onCreateDeal,
  onArchiveDeal,
  onDeleteDeal,
  onSendMessage,
}: PipelineBoardProps) {
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null)

  // IDs das stages para priorizar na detecção de colisão
  const stageIds = new Set(stages.map(s => s.id))

  // Collision detection customizada que prioriza stages sobre deals
  const collisionDetection: CollisionDetection = (args) => {
    // Primeiro tenta pointerWithin
    const pointerCollisions = pointerWithin(args)

    // Se encontrou colisões, prioriza stages
    if (pointerCollisions.length > 0) {
      const stageCollision = pointerCollisions.find(c => stageIds.has(c.id as string))
      if (stageCollision) {
        return [stageCollision]
      }
      return pointerCollisions
    }

    // Fallback para rectIntersection
    const rectCollisions = rectIntersection(args)
    if (rectCollisions.length > 0) {
      const stageCollision = rectCollisions.find(c => stageIds.has(c.id as string))
      if (stageCollision) {
        return [stageCollision]
      }
    }

    return rectCollisions
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const dealId = active.id as string

    // Encontra o deal
    for (const stage of stages) {
      const deal = stage.deals.find((d) => d.id === dealId)
      if (deal) {
        setActiveDeal(deal)
        break
      }
    }
  }

  const handleDragOver = (event: DragOverEvent) => {
    // Implementação futura para preview durante drag
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    setActiveDeal(null)

    if (!over) return

    const dealId = active.id as string
    const overId = over.id as string

    // Encontra stage atual do deal
    let currentStageId: string | null = null
    for (const stage of stages) {
      if (stage.deals.find((d) => d.id === dealId)) {
        currentStageId = stage.id
        break
      }
    }

    // Verifica se foi dropado em uma stage
    const targetStage = stages.find(
      (s) => s.id === overId || s.deals.some((d) => d.id === overId)
    )

    if (targetStage && currentStageId !== targetStage.id) {
      onDealMove(dealId, targetStage.id)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full gap-4 overflow-x-auto p-4">
        {stages.map((stage) => (
          <StageColumn
            key={stage.id}
            stage={stage}
            onDealClick={onDealClick}
            onCreateDeal={onCreateDeal}
            onArchiveDeal={onArchiveDeal}
            onDeleteDeal={onDeleteDeal}
            onSendMessage={onSendMessage}
          />
        ))}
      </div>

      <DragOverlay>
        {activeDeal ? (
          <DealCard deal={activeDeal} isDragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
