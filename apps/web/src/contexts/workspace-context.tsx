"use client"

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react"

export interface Workspace {
  id: string
  name: string
  color: string
  icon: string
  is_default: boolean
  created_at: string
  updated_at: string
}

interface CreateWorkspaceData {
  name: string
  color?: string
  icon?: string
}

interface UpdateWorkspaceData {
  name?: string
  color?: string
  icon?: string
}

interface WorkspaceContextType {
  workspaces: Workspace[]
  currentWorkspace: Workspace | null
  setCurrentWorkspace: (workspace: Workspace) => void
  isLoading: boolean
  error: string | null
  createWorkspace: (data: CreateWorkspaceData) => Promise<Workspace>
  updateWorkspace: (id: string, data: UpdateWorkspaceData) => Promise<Workspace>
  deleteWorkspace: (id: string) => Promise<void>
  setDefaultWorkspace: (id: string) => Promise<void>
  refresh: () => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined)

const STORAGE_KEY = "selectedWorkspaceId"

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [currentWorkspace, setCurrentWorkspaceState] = useState<Workspace | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  const loadWorkspaces = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const res = await fetch(`${API_URL}/workspaces`)
      if (!res.ok) {
        throw new Error("Falha ao carregar workspaces")
      }

      const data: Workspace[] = await res.json()
      setWorkspaces(data)

      // Tenta restaurar workspace salvo
      const savedId = localStorage.getItem(STORAGE_KEY)
      const savedWorkspace = data.find((ws) => ws.id === savedId)

      if (savedWorkspace) {
        setCurrentWorkspaceState(savedWorkspace)
      } else if (data.length > 0) {
        // Usa o default ou o primeiro
        const defaultWs = data.find((ws) => ws.is_default) || data[0]
        setCurrentWorkspaceState(defaultWs)
        localStorage.setItem(STORAGE_KEY, defaultWs.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido")
      console.error("Erro ao carregar workspaces:", err)
    } finally {
      setIsLoading(false)
    }
  }, [API_URL])

  useEffect(() => {
    loadWorkspaces()
  }, [loadWorkspaces])

  const setCurrentWorkspace = useCallback((workspace: Workspace) => {
    setCurrentWorkspaceState(workspace)
    localStorage.setItem(STORAGE_KEY, workspace.id)
  }, [])

  const createWorkspace = useCallback(
    async (data: CreateWorkspaceData): Promise<Workspace> => {
      const res = await fetch(`${API_URL}/workspaces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        throw new Error("Falha ao criar workspace")
      }

      const newWorkspace: Workspace = await res.json()
      setWorkspaces((prev) => [...prev, newWorkspace])
      return newWorkspace
    },
    [API_URL]
  )

  const updateWorkspace = useCallback(
    async (id: string, data: UpdateWorkspaceData): Promise<Workspace> => {
      const res = await fetch(`${API_URL}/workspaces/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        throw new Error("Falha ao atualizar workspace")
      }

      const updated: Workspace = await res.json()
      setWorkspaces((prev) => prev.map((ws) => (ws.id === id ? updated : ws)))

      if (currentWorkspace?.id === id) {
        setCurrentWorkspaceState(updated)
      }

      return updated
    },
    [API_URL, currentWorkspace]
  )

  const deleteWorkspace = useCallback(
    async (id: string): Promise<void> => {
      const res = await fetch(`${API_URL}/workspaces/${id}`, {
        method: "DELETE",
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.detail || "Falha ao deletar workspace")
      }

      setWorkspaces((prev) => prev.filter((ws) => ws.id !== id))

      // Se deletou o atual, muda para o default
      if (currentWorkspace?.id === id) {
        const remaining = workspaces.filter((ws) => ws.id !== id)
        const defaultWs = remaining.find((ws) => ws.is_default) || remaining[0]
        if (defaultWs) {
          setCurrentWorkspace(defaultWs)
        }
      }
    },
    [API_URL, currentWorkspace, workspaces, setCurrentWorkspace]
  )

  const setDefaultWorkspace = useCallback(
    async (id: string): Promise<void> => {
      const res = await fetch(`${API_URL}/workspaces/${id}/set-default`, {
        method: "POST",
      })

      if (!res.ok) {
        throw new Error("Falha ao definir workspace padrão")
      }

      // Atualiza lista local
      setWorkspaces((prev) =>
        prev.map((ws) => ({
          ...ws,
          is_default: ws.id === id,
        }))
      )
    },
    [API_URL]
  )

  const refresh = useCallback(async () => {
    await loadWorkspaces()
  }, [loadWorkspaces])

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        currentWorkspace,
        setCurrentWorkspace,
        isLoading,
        error,
        createWorkspace,
        updateWorkspace,
        deleteWorkspace,
        setDefaultWorkspace,
        refresh,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (context === undefined) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider")
  }
  return context
}
