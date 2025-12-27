"use client"

import { useState } from "react"
import { ArrowLeft, Pencil, Trash2, Check, X, Star } from "lucide-react"
import Link from "next/link"
import { useWorkspace } from "@/contexts/workspace-context"

const COLORS = [
  "#3b82f6", "#22c55e", "#a855f7", "#f97316",
  "#ef4444", "#06b6d4", "#ec4899", "#eab308",
]

export default function WorkspacesSettingsPage() {
  const { workspaces, updateWorkspace, deleteWorkspace, setDefaultWorkspace, isLoading } = useWorkspace()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editColor, setEditColor] = useState("")
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const startEdit = (ws: { id: string; name: string; color: string }) => {
    setEditingId(ws.id)
    setEditName(ws.name)
    setEditColor(ws.color)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName("")
    setEditColor("")
  }

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return
    await updateWorkspace(editingId, { name: editName.trim(), color: editColor })
    cancelEdit()
  }

  const handleDelete = async (id: string) => {
    await deleteWorkspace(id)
    setDeleteConfirm(null)
  }

  const handleSetDefault = async (id: string) => {
    await setDefaultWorkspace(id)
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-zinc-500">Carregando...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-4">
          <Link
            href="/settings"
            className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-semibold">Gerenciar Workspaces</h1>
        </div>
      </div>

      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {workspaces.map((ws) => (
              <div key={ws.id} className="p-4">
                {editingId === ws.id ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                      placeholder="Nome do workspace"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      {COLORS.map((color) => (
                        <button
                          key={color}
                          onClick={() => setEditColor(color)}
                          className={`h-6 w-6 rounded-full transition-transform ${
                            editColor === color ? "scale-125 ring-2 ring-offset-2 ring-zinc-400" : ""
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={cancelEdit}
                        className="rounded-lg px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <button
                        onClick={saveEdit}
                        disabled={!editName.trim()}
                        className="rounded-lg bg-blue-500 px-3 py-1.5 text-sm text-white hover:bg-blue-600 disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : deleteConfirm === ws.id ? (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-red-500">
                      Excluir "{ws.name}"? Esta ação não pode ser desfeita.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="rounded-lg px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => handleDelete(ws.id)}
                        className="rounded-lg bg-red-500 px-3 py-1.5 text-sm text-white hover:bg-red-600"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-4 w-4 rounded-full"
                        style={{ backgroundColor: ws.color }}
                      />
                      <span className="font-medium">{ws.name}</span>
                      {ws.is_default && (
                        <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                          default
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {!ws.is_default && (
                        <button
                          onClick={() => handleSetDefault(ws.id)}
                          className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-yellow-500 dark:hover:bg-zinc-800"
                          title="Definir como padrão"
                        >
                          <Star className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => startEdit(ws)}
                        className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-blue-500 dark:hover:bg-zinc-800"
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {!ws.is_default && (
                        <button
                          onClick={() => setDeleteConfirm(ws.id)}
                          className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-red-500 dark:hover:bg-zinc-800"
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {workspaces.length === 0 && (
            <div className="p-8 text-center text-zinc-500">
              Nenhum workspace encontrado
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-sm text-zinc-500">
          O workspace padrão não pode ser excluído.
        </p>
      </div>
    </div>
  )
}
