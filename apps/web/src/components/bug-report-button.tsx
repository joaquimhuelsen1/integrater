"use client"

import { useState, useEffect } from "react"
import { Bug } from "lucide-react"
import { BugReportModal } from "./bug-report-modal"
import { useWorkspace } from "@/contexts/workspace-context"
import { createClient } from "@/lib/supabase"

export function BugReportButton() {
  const [isOpen, setIsOpen] = useState(false)
  const [currentUrl, setCurrentUrl] = useState("")
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const { currentWorkspace } = useWorkspace()

  const supabase = createClient()

  // Verifica autenticacao
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setIsAuthenticated(!!session)
    }
    checkAuth()

    // Escuta mudancas de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsAuthenticated(!!session)
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  // Captura URL atual quando abre o modal
  useEffect(() => {
    if (isOpen && typeof window !== "undefined") {
      setCurrentUrl(window.location.href)
    }
  }, [isOpen])

  // So mostra se estiver logado
  if (!isAuthenticated) return null

  return (
    <>
      {/* Botao flutuante - posição mais alta no mobile para não conflitar com composer */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 md:bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition-all hover:bg-red-600 hover:scale-105 active:scale-95"
        title="Reportar Bug"
      >
        <Bug className="h-5 w-5" />
      </button>

      {/* Modal */}
      <BugReportModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        currentUrl={currentUrl}
        workspaceId={currentWorkspace?.id}
      />
    </>
  )
}
