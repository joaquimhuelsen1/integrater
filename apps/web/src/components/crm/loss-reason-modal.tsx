"use client"

import { useState, useEffect, useCallback } from "react"
import { X, Plus, AlertTriangle } from "lucide-react"
import { apiFetch } from "@/lib/api"

interface LossReason {
  id: string
  name: string
  description: string | null
  color: string
}

interface LossReasonModalProps {
  dealId: string
  dealTitle: string
  pipelineId: string
  stageId: string
  onClose: () => void
  onConfirm: (reasonId: string | null, description: string) => Promise<void>
}

export function LossReasonModal({
  dealId,
  dealTitle,
  pipelineId,
  stageId,
  onClose,
  onConfirm,
}: LossReasonModalProps) {
  const [reasons, setReasons] = useState<LossReason[]>([])
  const [selectedReasonId, setSelectedReasonId] = useState<string | null>(null)
  const [description, setDescription] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [showNewReason, setShowNewReason] = useState(false)
  const [newReasonName, setNewReasonName] = useState("")

  const loadReasons = useCallback(async () => {
    try {
      const res = await apiFetch(`/loss-reasons?pipeline_id=${pipelineId}`)
      if (res.ok) {
        const data = await res.json()
        setReasons(data)
      }
    } catch (error) {
      console.error("Erro ao carregar motivos:", error)
    } finally {
      setIsLoading(false)
    }
  }, [pipelineId])

  useEffect(() => {
    loadReasons()
  }, [loadReasons])

  const handleCreateReason = async () => {
    if (!newReasonName.trim()) return

    try {
      const res = await apiFetch(`/loss-reasons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newReasonName.trim(),
          pipeline_id: pipelineId,
        }),
      })

      if (res.ok) {
        const newReason = await res.json()
        setReasons([...reasons, newReason])
        setSelectedReasonId(newReason.id)
        setNewReasonName("")
        setShowNewReason(false)
      }
    } catch (error) {
      console.error("Erro ao criar motivo:", error)
    }
  }

  const handleConfirm = async () => {
    setIsSaving(true)
    try {
      await onConfirm(selectedReasonId, description)
    } finally {
      setIsSaving(false)
    }
  }

  // Motivos predefinidos caso não existam cadastrados
  const defaultReasons = [
    { id: "no_budget", name: "Falta de dinheiro", color: "#ef4444" },
    { id: "competitor", name: "Optou por concorrente", color: "#f97316" },
    { id: "timing", name: "Timing ruim", color: "#eab308" },
    { id: "no_need", name: "Não precisa mais", color: "#8b5cf6" },
    { id: "no_response", name: "Sem resposta", color: "#6b7280" },
    { id: "other", name: "Outro", color: "#3b82f6" },
  ]

  const displayReasons = reasons.length > 0 ? reasons : defaultReasons

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <h2 className="text-lg font-semibold">Marcar como Perdido</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <p className="text-sm text-zinc-500">
            Deal: <span className="font-medium text-zinc-900 dark:text-white">{dealTitle}</span>
          </p>

          {/* Reason Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Motivo da perda
            </label>
            {isLoading ? (
              <div className="text-sm text-zinc-500">Carregando...</div>
            ) : (
              <div className="space-y-2">
                {displayReasons.map((reason) => (
                  <button
                    key={reason.id}
                    onClick={() => setSelectedReasonId(reason.id)}
                    className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition ${
                      selectedReasonId === reason.id
                        ? "border-red-500 bg-red-50 dark:bg-red-900/20"
                        : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700"
                    }`}
                  >
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: reason.color }}
                    />
                    <span className="text-sm font-medium">{reason.name}</span>
                  </button>
                ))}

                {/* Add new reason */}
                {showNewReason ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newReasonName}
                      onChange={(e) => setNewReasonName(e.target.value)}
                      placeholder="Nome do motivo..."
                      className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                      onKeyDown={(e) => e.key === "Enter" && handleCreateReason()}
                      autoFocus
                    />
                    <button
                      onClick={handleCreateReason}
                      disabled={!newReasonName.trim()}
                      className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800"
                    >
                      Adicionar
                    </button>
                    <button
                      onClick={() => {
                        setShowNewReason(false)
                        setNewReasonName("")
                      }}
                      className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:text-zinc-700"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowNewReason(true)}
                    className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700"
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar motivo
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Descrição (opcional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: O cliente mencionou que está sem orçamento devido às festas de fim de ano..."
              rows={3}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <button
            onClick={onClose}
            className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSaving}
            className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
          >
            {isSaving ? "Salvando..." : "Confirmar Perda"}
          </button>
        </div>
      </div>
    </div>
  )
}
