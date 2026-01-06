"use client"

import { useState, useEffect, useCallback } from "react"
import { X, Bug, Check, Clock, ExternalLink } from "lucide-react"
import { createClient } from "@/lib/supabase"

interface BugReport {
  id: string
  title: string
  description: string | null
  url: string | null
  status: "open" | "resolved"
  created_at: string
  resolved_at: string | null
}

interface BugReportModalProps {
  isOpen: boolean
  onClose: () => void
  currentUrl: string
  workspaceId?: string | null
}

type TabType = "report" | "list"

export function BugReportModal({ isOpen, onClose, currentUrl, workspaceId }: BugReportModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("report")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [bugs, setBugs] = useState<BugReport[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const supabase = createClient()

  // Carrega bugs ao abrir modal ou mudar para aba lista
  const loadBugs = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from("bug_reports")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) throw error
      setBugs(data || [])
    } catch (err) {
      console.error("Erro ao carregar bugs:", err)
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    if (isOpen && activeTab === "list") {
      loadBugs()
    }
  }, [isOpen, activeTab, loadBugs])

  // Reset form ao fechar
  useEffect(() => {
    if (!isOpen) {
      setTitle("")
      setDescription("")
      setActiveTab("report")
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    setIsSubmitting(true)
    try {
      const { error } = await supabase.from("bug_reports").insert({
        title: title.trim(),
        description: description.trim() || null,
        url: currentUrl,
        workspace_id: workspaceId || null,
        status: "open",
      })

      if (error) throw error

      // Limpa form e vai pra lista
      setTitle("")
      setDescription("")
      setActiveTab("list")
      loadBugs()
    } catch (err) {
      console.error("Erro ao salvar bug:", err)
      alert("Erro ao salvar bug. Tente novamente.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleStatus = async (bug: BugReport) => {
    const newStatus = bug.status === "open" ? "resolved" : "open"
    try {
      const { error } = await supabase
        .from("bug_reports")
        .update({ status: newStatus })
        .eq("id", bug.id)

      if (error) throw error
      loadBugs()
    } catch (err) {
      console.error("Erro ao atualizar status:", err)
    }
  }

  const deleteBug = async (bugId: string) => {
    if (!confirm("Deletar este bug?")) return
    try {
      const { error } = await supabase
        .from("bug_reports")
        .delete()
        .eq("id", bugId)

      if (error) throw error
      loadBugs()
    } catch (err) {
      console.error("Erro ao deletar bug:", err)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return "hoje"
    if (diffDays === 1) return "ontem"
    if (diffDays < 7) return `${diffDays} dias atrás`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} sem atrás`
    return date.toLocaleDateString("pt-BR")
  }

  const openBugsCount = bugs.filter(b => b.status === "open").length

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <div className="flex items-center gap-2">
            <Bug className="h-5 w-5 text-red-500" />
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">Reportar Bug</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5 text-zinc-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-700">
          <button
            onClick={() => setActiveTab("report")}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "report"
                ? "border-b-2 border-red-500 text-red-600 dark:text-red-400"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            Reportar
          </button>
          <button
            onClick={() => setActiveTab("list")}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "list"
                ? "border-b-2 border-red-500 text-red-600 dark:text-red-400"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            Meus Bugs {openBugsCount > 0 && `(${openBugsCount})`}
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {activeTab === "report" ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Titulo */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Título *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Botão de enviar não funciona"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-red-500 focus:ring-1 focus:ring-red-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                  required
                  autoFocus
                />
              </div>

              {/* Descricao */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Descrição
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva o problema em detalhes..."
                  rows={4}
                  className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-red-500 focus:ring-1 focus:ring-red-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              {/* URL (automatico) */}
              <div className="flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                <ExternalLink className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{currentUrl}</span>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting || !title.trim()}
                className="w-full rounded-lg bg-red-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "Enviando..." : "Enviar Bug"}
              </button>
            </form>
          ) : (
            <div className="space-y-2">
              {isLoading ? (
                <div className="py-8 text-center text-sm text-zinc-500">Carregando...</div>
              ) : bugs.length === 0 ? (
                <div className="py-8 text-center text-sm text-zinc-500">
                  Nenhum bug reportado ainda
                </div>
              ) : (
                <div className="max-h-80 space-y-2 overflow-y-auto">
                  {bugs.map((bug) => (
                    <div
                      key={bug.id}
                      className={`rounded-lg border p-3 transition-colors ${
                        bug.status === "resolved"
                          ? "border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50"
                          : "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p
                            className={`font-medium ${
                              bug.status === "resolved"
                                ? "text-zinc-500 line-through dark:text-zinc-400"
                                : "text-zinc-900 dark:text-zinc-100"
                            }`}
                          >
                            {bug.title}
                          </p>
                          {bug.description && (
                            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2">
                              {bug.description}
                            </p>
                          )}
                          <div className="mt-2 flex items-center gap-3 text-xs text-zinc-400">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDate(bug.created_at)}
                            </span>
                            {bug.url && (
                              <span className="truncate max-w-32">
                                {bug.url.replace(/^https?:\/\/[^/]+/, "")}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => toggleStatus(bug)}
                            className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                              bug.status === "resolved"
                                ? "bg-zinc-200 text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300"
                                : "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400"
                            }`}
                          >
                            {bug.status === "resolved" ? "Reabrir" : "Resolver"}
                          </button>
                          <button
                            onClick={() => deleteBug(bug.id)}
                            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-200 hover:text-red-500 dark:hover:bg-zinc-700"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
