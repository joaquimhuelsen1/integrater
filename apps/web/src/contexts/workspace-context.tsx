"use client"

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react"
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api"

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

  const loadWorkspaces = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const data = await apiGet<Workspace[]>("/workspaces")
      setWorkspaces(data)

      // Tenta restaurar workspace salvo
      const savedId = localStorage.getItem(STORAGE_KEY)
      const savedWorkspace = data.find((ws) => ws.id === savedId)

      if (savedWorkspace) {
        setCurrentWorkspaceState(savedWorkspace)
      } else if (data.length > 0) {
        // Usa o default ou o primeiro
        const defaultWs = data.find((ws) => ws.is_default) ?? data[0]
        if (defaultWs) {
          setCurrentWorkspaceState(defaultWs)
          localStorage.setItem(STORAGE_KEY, defaultWs.id)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido")
      console.error("Erro ao carregar workspaces:", err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadWorkspaces()
  }, [loadWorkspaces])

  const setCurrentWorkspace = useCallback((workspace: Workspace) => {
    setCurrentWorkspaceState(workspace)
    localStorage.setItem(STORAGE_KEY, workspace.id)
  }, [])

  const createWorkspace = useCallback(
    async (data: CreateWorkspaceData): Promise<Workspace> => {
      const newWorkspace = await apiPost<Workspace>("/workspaces", data)
      setWorkspaces((prev) => [...prev, newWorkspace])
      return newWorkspace
    },
    []
  )

  const updateWorkspace = useCallback(
    async (id: string, data: UpdateWorkspaceData): Promise<Workspace> => {
      const updated = await apiPatch<Workspace>(`/workspaces/${id}`, data)
      setWorkspaces((prev) => prev.map((ws) => (ws.id === id ? updated : ws)))

      if (currentWorkspace?.id === id) {
        setCurrentWorkspaceState(updated)
      }

      return updated
    },
    [currentWorkspace]
  )

  const deleteWorkspace = useCallback(
    async (id: string): Promise<void> => {
      await apiDelete(`/workspaces/${id}`)

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
    [currentWorkspace, workspaces, setCurrentWorkspace]
  )

  const setDefaultWorkspace = useCallback(
    async (id: string): Promise<void> => {
      await apiPost(`/workspaces/${id}/set-default`)

      // Atualiza lista local
      setWorkspaces((prev) =>
        prev.map((ws) => ({
          ...ws,
          is_default: ws.id === id,
        }))
      )
    },
    []
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
