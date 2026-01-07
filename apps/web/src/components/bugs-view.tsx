"use client"

import { useState, useEffect, useCallback } from "react"
import { Bug, Clock, ExternalLink, ImagePlus, X, Check, Filter, Search, ArrowLeft } from "lucide-react"
import { createClient } from "@/lib/supabase"
import Link from "next/link"

interface BugReportImage {
  id: string
  storage_path: string
  file_name: string
}

interface BugReport {
  id: string
  title: string
  description: string | null
  url: string | null
  status: "open" | "resolved"
  created_at: string
  resolved_at: string | null
  bug_report_images?: BugReportImage[]
}

type FilterStatus = "all" | "open" | "resolved"

export function BugsView() {
  const [bugs, setBugs] = useState<BugReport[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedImage, setExpandedImage] = useState<string | null>(null)
  const [expandedBugId, setExpandedBugId] = useState<string | null>(null)

  const supabase = createClient()

  const loadBugs = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from("bug_reports")
        .select("*, bug_report_images(*)")
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
    loadBugs()
  }, [loadBugs])

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
    if (!confirm("Deletar este bug permanentemente?")) return
    try {
      const bug = bugs.find(b => b.id === bugId)
      if (bug?.bug_report_images) {
        for (const img of bug.bug_report_images) {
          await supabase.storage.from("bug-reports").remove([img.storage_path])
        }
      }

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

  const getImageUrl = async (storagePath: string): Promise<string | null> => {
    const { data } = await supabase.storage
      .from("bug-reports")
      .createSignedUrl(storagePath, 3600)
    return data?.signedUrl || null
  }

  const handleImageClick = async (storagePath: string) => {
    const url = await getImageUrl(storagePath)
    if (url) setExpandedImage(url)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  const formatRelativeDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return "hoje"
    if (diffDays === 1) return "ontem"
    if (diffDays < 7) return `${diffDays} dias atrás`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} semanas atrás`
    return `${Math.floor(diffDays / 30)} meses atrás`
  }

  // Filtra bugs
  const filteredBugs = bugs.filter(bug => {
    // Filtro por status
    if (filterStatus !== "all" && bug.status !== filterStatus) return false
    
    // Filtro por busca
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matchTitle = bug.title.toLowerCase().includes(query)
      const matchDesc = bug.description?.toLowerCase().includes(query)
      const matchUrl = bug.url?.toLowerCase().includes(query)
      if (!matchTitle && !matchDesc && !matchUrl) return false
    }
    
    return true
  })

  const openCount = bugs.filter(b => b.status === "open").length
  const resolvedCount = bugs.filter(b => b.status === "resolved").length

  return (
    <>
      {/* Modal de imagem expandida */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90"
          onClick={() => setExpandedImage(null)}
        >
          <button
            onClick={() => setExpandedImage(null)}
            className="absolute right-4 top-4 rounded-full bg-white/20 p-2 text-white hover:bg-white/30"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={expandedImage}
            alt="Screenshot"
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <div className="flex h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
        {/* Header */}
        <header className="flex flex-shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-2">
              <Bug className="h-6 w-6 text-red-500" />
              <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                Bug Reports
              </h1>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                {openCount} abertos
              </span>
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                {resolvedCount} resolvidos
              </span>
            </div>
          </div>
        </header>

        {/* Filters */}
        <div className="flex flex-shrink-0 items-center gap-4 border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar bugs..."
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-10 pr-4 text-sm outline-none transition-colors focus:border-red-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-red-500"
            />
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1 rounded-lg border border-zinc-200 p-1 dark:border-zinc-700">
            <button
              onClick={() => setFilterStatus("all")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                filterStatus === "all"
                  ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilterStatus("open")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                filterStatus === "open"
                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              Abertos
            </button>
            <button
              onClick={() => setFilterStatus("resolved")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                filterStatus === "resolved"
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              Resolvidos
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center text-zinc-500">
              Carregando...
            </div>
          ) : filteredBugs.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-zinc-500">
              <Bug className="h-12 w-12 text-zinc-300 dark:text-zinc-700" />
              <p>Nenhum bug encontrado</p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-sm text-red-500 hover:underline"
                >
                  Limpar busca
                </button>
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-4">
              {filteredBugs.map((bug) => (
                <div
                  key={bug.id}
                  className={`rounded-xl border bg-white p-5 shadow-sm transition-all dark:bg-zinc-900 ${
                    bug.status === "resolved"
                      ? "border-zinc-200 dark:border-zinc-800"
                      : "border-red-200 dark:border-red-900/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      {/* Header do bug */}
                      <div className="flex items-center gap-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                            bug.status === "resolved"
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          }`}
                        >
                          {bug.status === "resolved" ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Bug className="h-3 w-3" />
                          )}
                          {bug.status === "resolved" ? "Resolvido" : "Aberto"}
                        </span>
                        <span className="text-xs text-zinc-400">
                          {formatRelativeDate(bug.created_at)}
                        </span>
                      </div>

                      {/* Título */}
                      <h3
                        className={`mt-2 text-lg font-semibold ${
                          bug.status === "resolved"
                            ? "text-zinc-500 line-through dark:text-zinc-400"
                            : "text-zinc-900 dark:text-zinc-100"
                        }`}
                      >
                        {bug.title}
                      </h3>

                      {/* Descrição */}
                      {bug.description && (
                        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                          {expandedBugId === bug.id
                            ? bug.description
                            : bug.description.length > 200
                              ? `${bug.description.slice(0, 200)}...`
                              : bug.description}
                          {bug.description.length > 200 && (
                            <button
                              onClick={() => setExpandedBugId(expandedBugId === bug.id ? null : bug.id)}
                              className="ml-1 text-red-500 hover:underline"
                            >
                              {expandedBugId === bug.id ? "ver menos" : "ver mais"}
                            </button>
                          )}
                        </p>
                      )}

                      {/* Screenshots */}
                      {bug.bug_report_images && bug.bug_report_images.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {bug.bug_report_images.map((img) => (
                            <ImageThumbnail
                              key={img.id}
                              storagePath={img.storage_path}
                              onClick={() => handleImageClick(img.storage_path)}
                              size="lg"
                            />
                          ))}
                        </div>
                      )}

                      {/* Meta info */}
                      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-zinc-400">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDate(bug.created_at)}
                        </span>
                        {bug.url && (
                          <a
                            href={bug.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-blue-500 hover:underline"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            {bug.url.replace(/^https?:\/\/[^/]+/, "").slice(0, 40)}
                            {bug.url.length > 50 && "..."}
                          </a>
                        )}
                        {bug.bug_report_images && bug.bug_report_images.length > 0 && (
                          <span className="flex items-center gap-1">
                            <ImagePlus className="h-3.5 w-3.5" />
                            {bug.bug_report_images.length} screenshot{bug.bug_report_images.length > 1 ? "s" : ""}
                          </span>
                        )}
                        {bug.resolved_at && (
                          <span className="text-green-500">
                            Resolvido em {formatDate(bug.resolved_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-shrink-0 flex-col gap-2">
                      <button
                        onClick={() => toggleStatus(bug)}
                        className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                          bug.status === "resolved"
                            ? "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                            : "bg-green-500 text-white hover:bg-green-600"
                        }`}
                      >
                        {bug.status === "resolved" ? "Reabrir" : "Resolver"}
                      </button>
                      <button
                        onClick={() => deleteBug(bug.id)}
                        className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-500 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-zinc-700 dark:hover:border-red-800 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                      >
                        Deletar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// Componente para thumbnail com URL assinada
function ImageThumbnail({ 
  storagePath, 
  onClick,
  size = "md"
}: { 
  storagePath: string
  onClick: () => void
  size?: "md" | "lg"
}) {
  const [url, setUrl] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const loadUrl = async () => {
      const { data } = await supabase.storage
        .from("bug-reports")
        .createSignedUrl(storagePath, 3600)
      if (data?.signedUrl) setUrl(data.signedUrl)
    }
    loadUrl()
  }, [storagePath, supabase])

  const sizeClasses = size === "lg" ? "h-20 w-20" : "h-12 w-12"

  if (!url) {
    return (
      <div className={`${sizeClasses} animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-700`} />
    )
  }

  return (
    <button
      onClick={onClick}
      className={`${sizeClasses} overflow-hidden rounded-lg border border-zinc-200 transition-transform hover:scale-105 dark:border-zinc-700`}
    >
      <img src={url} alt="Screenshot" className="h-full w-full object-cover" />
    </button>
  )
}
