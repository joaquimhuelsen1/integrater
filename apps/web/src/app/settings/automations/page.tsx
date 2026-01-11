"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useWorkspace } from "@/contexts/workspace-context"
import { Loader2 } from "lucide-react"

// Esta pagina redireciona para a nova rota em /[workspaceId]/crm/automations
export default function AutomationsSettingsPage() {
  const router = useRouter()
  const { currentWorkspace, isLoading } = useWorkspace()

  useEffect(() => {
    if (!isLoading && currentWorkspace) {
      router.replace(`/${currentWorkspace.id}/crm/automations`)
    }
  }, [currentWorkspace, isLoading, router])

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        <p className="text-sm text-zinc-500">Redirecionando...</p>
      </div>
    </div>
  )
}
