"use client"

import { useState } from "react"
import { X, Plus, Trash2, GripVertical, Check, Trophy, XCircle } from "lucide-react"
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { apiFetch } from "@/lib/api"

interface Pipeline {
  id: string
  name: string
  description: string | null
  color: string
}

interface Stage {
  id: string
  name: string
  color: string
  position: number
  is_win: boolean
  is_loss: boolean
}

interface PipelineSettingsProps {
  pipelines: Pipeline[]
  selectedPipelineId: string | null
  workspaceId: string
  onClose: () => void
  onPipelineCreated: () => void
  onPipelineUpdated: () => void
  onStagesUpdated: () => void
}

// Componente de Stage arrastável
interface SortableStageItemProps {
  stage: Stage
  stageColors: string[]
  onUpdateStage: (stageId: string, updates: Partial<Stage>) => void
  onDeleteStage: (stageId: string) => void
  onNameChange: (stageId: string, name: string) => void
}

function SortableStageItem({
  stage,
  stageColors,
  onUpdateStage,
  onDeleteStage,
  onNameChange,
}: SortableStageItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-zinc-400 hover:text-zinc-600 active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Color Picker */}
      <div className="flex gap-1">
        {stageColors.map((color) => (
          <button
            key={color}
            onClick={() => onUpdateStage(stage.id, { color })}
            className={`h-5 w-5 rounded-full border-2 ${
              stage.color === color
                ? "border-zinc-900 dark:border-white"
                : "border-transparent"
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>

      {/* Name */}
      <input
        type="text"
        value={stage.name}
        onChange={(e) => onNameChange(stage.id, e.target.value)}
        onBlur={(e) => onUpdateStage(stage.id, { name: e.target.value })}
        className="flex-1 bg-transparent text-sm font-medium outline-none"
      />

      {/* Win/Loss toggles */}
      <button
        onClick={() =>
          onUpdateStage(stage.id, { is_win: !stage.is_win, is_loss: false })
        }
        className={`rounded p-1 ${
          stage.is_win
            ? "bg-green-100 text-green-600 dark:bg-green-900/50"
            : "text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        }`}
        title="Etapa de ganho"
      >
        <Trophy className="h-4 w-4" />
      </button>
      <button
        onClick={() =>
          onUpdateStage(stage.id, { is_loss: !stage.is_loss, is_win: false })
        }
        className={`rounded p-1 ${
          stage.is_loss
            ? "bg-red-100 text-red-600 dark:bg-red-900/50"
            : "text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        }`}
        title="Etapa de perda"
      >
        <XCircle className="h-4 w-4" />
      </button>

      <button
        onClick={() => onDeleteStage(stage.id)}
        className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-500 dark:hover:bg-zinc-800"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

export function PipelineSettings({
  pipelines,
  selectedPipelineId,
  workspaceId,
  onClose,
  onPipelineCreated,
  onPipelineUpdated,
  onStagesUpdated,
}: PipelineSettingsProps) {
  const [activeTab, setActiveTab] = useState<"pipelines" | "stages">("pipelines")
  const [newPipelineName, setNewPipelineName] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  const [stages, setStages] = useState<Stage[]>([])
  const [isLoadingStages, setIsLoadingStages] = useState(false)
  const [newStageName, setNewStageName] = useState("")

  // Drag & drop sensors
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

  const loadStages = async (pipelineId: string) => {
    setIsLoadingStages(true)
    try {
      const res = await apiFetch(`/pipelines/${pipelineId}/stages`)
      if (res.ok) {
        const data = await res.json()
        setStages(data)
      }
    } catch (error) {
      console.error("Erro ao carregar stages:", error)
    } finally {
      setIsLoadingStages(false)
    }
  }

  const handleCreatePipeline = async () => {
    if (!newPipelineName.trim() || !workspaceId) return

    setIsCreating(true)
    try {
      const res = await apiFetch(`/pipelines?workspace_id=${workspaceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newPipelineName.trim() }),
      })

      if (res.ok) {
        setNewPipelineName("")
        onPipelineCreated()
      }
    } catch (error) {
      console.error("Erro ao criar pipeline:", error)
    } finally {
      setIsCreating(false)
    }
  }

  const handleDeletePipeline = async (pipelineId: string) => {
    if (!confirm("Tem certeza que deseja arquivar este pipeline?")) return

    try {
      const res = await apiFetch(`/pipelines/${pipelineId}`, {
        method: "DELETE",
      })

      if (res.ok) {
        onPipelineUpdated()
      }
    } catch (error) {
      console.error("Erro ao arquivar pipeline:", error)
    }
  }

  const handleCreateStage = async () => {
    if (!newStageName.trim() || !selectedPipelineId) return

    try {
      const res = await apiFetch(`/pipelines/${selectedPipelineId}/stages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newStageName.trim() }),
      })

      if (res.ok) {
        setNewStageName("")
        loadStages(selectedPipelineId)
        onStagesUpdated()
      }
    } catch (error) {
      console.error("Erro ao criar stage:", error)
    }
  }

  const handleUpdateStage = async (stageId: string, updates: Partial<Stage>) => {
    if (!selectedPipelineId) return

    try {
      const res = await apiFetch(`/pipelines/${selectedPipelineId}/stages/${stageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })

      if (res.ok) {
        loadStages(selectedPipelineId)
        onStagesUpdated()
      }
    } catch (error) {
      console.error("Erro ao atualizar stage:", error)
    }
  }

  const handleDeleteStage = async (stageId: string) => {
    if (!selectedPipelineId) return
    if (!confirm("Tem certeza que deseja remover esta etapa?")) return

    try {
      const res = await apiFetch(`/pipelines/${selectedPipelineId}/stages/${stageId}`, {
        method: "DELETE",
      })

      if (res.ok) {
        loadStages(selectedPipelineId)
        onStagesUpdated()
      } else {
        const error = await res.json()
        alert(error.detail || "Erro ao remover etapa")
      }
    } catch (error) {
      console.error("Erro ao remover stage:", error)
    }
  }

  // Handler para mudança de nome local (antes de blur)
  const handleNameChange = (stageId: string, name: string) => {
    setStages((prev) =>
      prev.map((s) =>
        s.id === stageId ? { ...s, name } : s
      )
    )
  }

  // Handler para drag & drop reordering
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id || !selectedPipelineId) return

    const oldIndex = stages.findIndex((s) => s.id === active.id)
    const newIndex = stages.findIndex((s) => s.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    // Update local state first (optimistic)
    const newStages = arrayMove(stages, oldIndex, newIndex)
    setStages(newStages)

    // Send to API
    try {
      const orderedIds = newStages.map((s) => s.id)
      const res = await apiFetch(`/pipelines/${selectedPipelineId}/stages/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage_ids: orderedIds }),
      })

      if (res.ok) {
        onStagesUpdated()
      } else {
        // Revert on error
        loadStages(selectedPipelineId)
      }
    } catch (error) {
      console.error("Erro ao reordenar stages:", error)
      loadStages(selectedPipelineId)
    }
  }

  // Load stages when switching to stages tab
  const handleTabChange = (tab: "pipelines" | "stages") => {
    setActiveTab(tab)
    if (tab === "stages" && selectedPipelineId) {
      loadStages(selectedPipelineId)
    }
  }

  const STAGE_COLORS = [
    "#6b7280", // gray
    "#3b82f6", // blue
    "#8b5cf6", // violet
    "#ec4899", // pink
    "#f59e0b", // amber
    "#22c55e", // green
    "#ef4444", // red
    "#06b6d4", // cyan
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-xl rounded-lg bg-white shadow-xl dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-lg font-semibold">Configurações</h2>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => handleTabChange("pipelines")}
            className={`flex-1 px-4 py-2 text-sm font-medium ${
              activeTab === "pipelines"
                ? "border-b-2 border-blue-500 text-blue-500"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Pipelines
          </button>
          <button
            onClick={() => handleTabChange("stages")}
            disabled={!selectedPipelineId}
            className={`flex-1 px-4 py-2 text-sm font-medium ${
              activeTab === "stages"
                ? "border-b-2 border-blue-500 text-blue-500"
                : "text-zinc-500 hover:text-zinc-700"
            } disabled:opacity-50`}
          >
            Etapas
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {activeTab === "pipelines" ? (
            <div className="space-y-4">
              {/* Create Pipeline */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newPipelineName}
                  onChange={(e) => setNewPipelineName(e.target.value)}
                  placeholder="Nome do novo pipeline..."
                  className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  onKeyDown={(e) => e.key === "Enter" && handleCreatePipeline()}
                />
                <button
                  onClick={handleCreatePipeline}
                  disabled={isCreating || !newPipelineName.trim()}
                  className="flex items-center gap-1 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  Criar
                </button>
              </div>

              {/* Pipeline List */}
              <div className="space-y-2">
                {pipelines.map((pipeline) => (
                  <div
                    key={pipeline.id}
                    className={`flex items-center justify-between rounded-lg border p-3 ${
                      pipeline.id === selectedPipelineId
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                        : "border-zinc-200 dark:border-zinc-800"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-4 w-4 rounded-full"
                        style={{ backgroundColor: pipeline.color }}
                      />
                      <span className="font-medium">{pipeline.name}</span>
                    </div>
                    <button
                      onClick={() => handleDeletePipeline(pipeline.id)}
                      className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-500 dark:hover:bg-zinc-800"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}

                {pipelines.length === 0 && (
                  <div className="py-8 text-center text-sm text-zinc-500">
                    Nenhum pipeline criado
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Create Stage */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  placeholder="Nome da nova etapa..."
                  className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  onKeyDown={(e) => e.key === "Enter" && handleCreateStage()}
                />
                <button
                  onClick={handleCreateStage}
                  disabled={!newStageName.trim()}
                  className="flex items-center gap-1 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  Criar
                </button>
              </div>

              {/* Stage List */}
              {isLoadingStages ? (
                <div className="py-8 text-center text-sm text-zinc-500">
                  Carregando...
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={stages.map((s) => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {stages.map((stage) => (
                        <SortableStageItem
                          key={stage.id}
                          stage={stage}
                          stageColors={STAGE_COLORS}
                          onUpdateStage={handleUpdateStage}
                          onDeleteStage={handleDeleteStage}
                          onNameChange={handleNameChange}
                        />
                      ))}

                      {stages.length === 0 && (
                        <div className="py-8 text-center text-sm text-zinc-500">
                          Nenhuma etapa criada
                        </div>
                      )}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <button
            onClick={onClose}
            className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
