"use client"

import { useState, useRef, useEffect } from "react"
import { ChevronDown, Plus, Settings, BarChart3, Check, Briefcase } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useWorkspace, Workspace } from "@/contexts/workspace-context"

interface WorkspaceSelectorProps {
  compact?: boolean
}

export function WorkspaceSelector({ compact = false }: WorkspaceSelectorProps) {
  const {
    workspaces,
    currentWorkspace,
    setCurrentWorkspace,
    isLoading,
    createWorkspace,
  } = useWorkspace()

  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newName, setNewName] = useState("")
  const [newColor, setNewColor] = useState("#3b82f6")
  const [isCreating, setIsCreating] = useState(false)

  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return

    setIsCreating(true)
    try {
      const created = await createWorkspace({
        name: newName.trim(),
        color: newColor,
      })
      setCurrentWorkspace(created)
      setShowCreateModal(false)
      setNewName("")
      setNewColor("#3b82f6")
      setIsOpen(false)
      // Navega para o novo workspace
      router.push(`/${created.id}`)
    } catch (error) {
      console.error("Erro ao criar workspace:", error)
    } finally {
      setIsCreating(false)
    }
  }

  const colors = [
    "#3b82f6", // blue
    "#22c55e", // green
    "#8b5cf6", // purple
    "#f59e0b", // amber
    "#ef4444", // red
    "#06b6d4", // cyan
    "#ec4899", // pink
    "#6b7280", // gray
  ]

  if (isLoading) {
    return (
      <div className="flex h-9 w-32 animate-pulse items-center gap-2 rounded-lg bg-zinc-200 px-3 dark:bg-zinc-800" />
    )
  }

  if (!currentWorkspace) {
    return null
  }

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
      >
        <span
          className="h-3 w-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: currentWorkspace.color }}
        />
        <span className="max-w-[140px] truncate">{currentWorkspace.name}</span>
        <ChevronDown className="h-4 w-4 text-zinc-500 flex-shrink-0" />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
          {/* Lista de Workspaces */}
          <div className="max-h-64 overflow-y-auto p-1">
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => {
                  setCurrentWorkspace(ws)
                  setIsOpen(false)
                  // Navega para a URL do workspace (sem reload!)
                  router.push(`/${ws.id}`)
                }}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700 ${
                  ws.id === currentWorkspace.id ? "bg-zinc-100 dark:bg-zinc-700" : ""
                }`}
              >
                <span
                  className="h-3 w-3 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: ws.color }}
                />
                <span className="flex-1 truncate text-left">{ws.name}</span>
                {ws.id === currentWorkspace.id && (
                  <Check className="h-4 w-4 text-blue-500" />
                )}
                {ws.is_default && (
                  <span className="text-xs text-zinc-400">default</span>
                )}
              </button>
            ))}
          </div>

          {/* Separador */}
          <div className="border-t border-zinc-200 dark:border-zinc-700" />

          {/* Dashboard link */}
          <div className="p-1">
            <Link
              href="/dashboard"
              onClick={() => setIsOpen(false)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
            >
              <BarChart3 className="h-4 w-4" />
              Dashboard Global
            </Link>
          </div>

          {/* Separador */}
          <div className="border-t border-zinc-200 dark:border-zinc-700" />

          {/* Ações */}
          <div className="p-1">
            <button
              onClick={() => {
                setShowCreateModal(true)
                setIsOpen(false)
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
            >
              <Plus className="h-4 w-4" />
              Novo Workspace
            </button>

            <Link
              href={`/${currentWorkspace?.id}/settings`}
              onClick={() => setIsOpen(false)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
            >
              <Settings className="h-4 w-4" />
              Gerenciar Workspaces
            </Link>
          </div>
        </div>
      )}

      {/* Modal Criar Workspace */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
            <div className="mb-4 flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              <h2 className="text-lg font-semibold">Novo Workspace</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Nome</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex: Empresa X, Projeto Y..."
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Cor</label>
                <div className="flex gap-2">
                  {colors.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewColor(color)}
                      className={`h-8 w-8 rounded-full transition-transform ${
                        newColor === color ? "scale-110 ring-2 ring-offset-2" : ""
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setNewName("")
                }}
                className="rounded-lg px-4 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || isCreating}
                className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
              >
                {isCreating ? "Criando..." : "Criar Workspace"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
