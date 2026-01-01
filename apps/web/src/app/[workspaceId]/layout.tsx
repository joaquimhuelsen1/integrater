"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useWorkspace } from "@/contexts/workspace-context"

/**
 * Layout do Workspace
 *
 * Valida se o workspaceId da URL existe e atualiza o contexto.
 * Se workspace inválido, redireciona para o default.
 */
export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const params = useParams()
  const router = useRouter()
  const workspaceId = params.workspaceId as string

  const {
    workspaces,
    currentWorkspace,
    setCurrentWorkspace,
    isLoading,
  } = useWorkspace()

  const [isValidating, setIsValidating] = useState(true)

  useEffect(() => {
    if (isLoading) return

    // Busca workspace pelo ID da URL
    const workspace = workspaces.find((ws) => ws.id === workspaceId)

    if (workspace) {
      // Workspace válido - atualiza contexto se diferente
      if (currentWorkspace?.id !== workspace.id) {
        setCurrentWorkspace(workspace)
      }
      setIsValidating(false)
    } else if (workspaces.length > 0) {
      // Workspace inválido - redireciona para o default/primeiro
      const defaultWs = workspaces.find((ws) => ws.is_default) ?? workspaces[0]
      if (defaultWs) {
        router.replace(`/${defaultWs.id}`)
      }
    }
  }, [workspaceId, workspaces, currentWorkspace, setCurrentWorkspace, isLoading, router])

  // Loading state
  if (isLoading || isValidating) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">
          Carregando...
        </div>
      </div>
    )
  }

  return <>{children}</>
}
