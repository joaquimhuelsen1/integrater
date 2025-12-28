"use client"

import { useState, useEffect, useCallback } from "react"
import { ArrowLeft, Search, Filter, Download, AlertCircle, AlertTriangle, Info, RefreshCw, FileJson, FileSpreadsheet } from "lucide-react"
import Link from "next/link"
import { ThemeToggle } from "./theme-toggle"

interface LogEntry {
  id: string
  timestamp: string
  level: "info" | "warning" | "error"
  source: string
  message: string
  details?: Record<string, unknown>
}

interface LogStats {
  errors: number
  workers_online: number
  messages_24h: number
  sync_pending: number
}

export function LogsView() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [stats, setStats] = useState<LogStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [total, setTotal] = useState(0)

  // Filtros
  const [levelFilter, setLevelFilter] = useState<string>("")
  const [sourceFilter, setSourceFilter] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [showFilters, setShowFilters] = useState(false)

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  const loadLogs = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (levelFilter) params.set("level", levelFilter)
      if (sourceFilter) params.set("source", sourceFilter)
      if (searchQuery) params.set("search", searchQuery)

      const res = await fetch(`${API_URL}/logs?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs)
        setTotal(data.total)
      }
    } catch {
      console.error("Erro ao carregar logs")
    } finally {
      setIsLoading(false)
    }
  }, [API_URL, levelFilter, sourceFilter, searchQuery])

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/logs/stats`)
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch {
      console.error("Erro ao carregar stats")
    }
  }, [API_URL])

  useEffect(() => {
    loadLogs()
    loadStats()
  }, [loadLogs, loadStats])

  const exportData = (format: "json" | "csv") => {
    const url = `${API_URL}/export/messages/${format}`
    window.open(url, "_blank")
  }

  const getLevelIcon = (level: string) => {
    switch (level) {
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      default:
        return <Info className="h-4 w-4 text-blue-500" />
    }
  }

  const getLevelBadge = (level: string) => {
    switch (level) {
      case "error":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
      case "warning":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
      default:
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
    }
  }

  const getSourceBadge = (source: string) => {
    switch (source) {
      case "telegram":
        return "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
      case "email":
        return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
      case "sms":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
      default:
        return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
    }
  }

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-xl font-semibold">Logs do Sistema</h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => { loadLogs(); loadStats() }}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <button
              onClick={() => exportData("json")}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <FileJson className="h-4 w-4" />
              JSON
            </button>
            <button
              onClick={() => exportData("csv")}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <FileSpreadsheet className="h-4 w-4" />
              CSV
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Stats */}
        {stats && (
          <div className="mb-6 grid grid-cols-4 gap-4">
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-sm text-zinc-500">Erros Ativos</p>
              <p className={`text-2xl font-bold ${stats.errors > 0 ? "text-red-500" : "text-zinc-900 dark:text-white"}`}>
                {stats.errors}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-sm text-zinc-500">Workers Online</p>
              <p className="text-2xl font-bold text-green-500">{stats.workers_online}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-sm text-zinc-500">Mensagens (24h)</p>
              <p className="text-2xl font-bold text-zinc-900 dark:text-white">{stats.messages_24h}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-sm text-zinc-500">Sync Pendentes</p>
              <p className={`text-2xl font-bold ${stats.sync_pending > 0 ? "text-yellow-500" : "text-zinc-900 dark:text-white"}`}>
                {stats.sync_pending}
              </p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Buscar nos logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-10 pr-4 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>

          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">Todos os níveis</option>
            <option value="error">Erros</option>
            <option value="warning">Avisos</option>
            <option value="info">Info</option>
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">Todas as fontes</option>
            <option value="telegram">Telegram</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="system">Sistema</option>
          </select>

          <button
            onClick={loadLogs}
            className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            Filtrar
          </button>
        </div>

        {/* Logs Table */}
        <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <p className="text-sm text-zinc-500">{total} logs encontrados</p>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-zinc-500">Carregando logs...</div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-zinc-500">Nenhum log encontrado</div>
          ) : (
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-4 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <div className="mt-0.5">{getLevelIcon(log.level)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${getLevelBadge(log.level)}`}>
                        {log.level.toUpperCase()}
                      </span>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${getSourceBadge(log.source)}`}>
                        {log.source}
                      </span>
                      <span className="text-xs text-zinc-400">{formatDate(log.timestamp)}</span>
                    </div>
                    <p className="text-sm text-zinc-900 dark:text-zinc-100">{log.message}</p>
                    {log.details && (
                      <details className="mt-2">
                        <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300">
                          Ver detalhes
                        </summary>
                        <pre className="mt-1 text-xs bg-zinc-100 dark:bg-zinc-800 p-2 rounded overflow-x-auto">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Export Section */}
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="font-medium mb-3">Exportar Dados</h3>
          <div className="flex flex-wrap gap-3">
            <a
              href={`${API_URL}/export/conversations/json`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              <FileJson className="h-4 w-4" />
              Conversas JSON
            </a>
            <a
              href={`${API_URL}/export/conversations/csv`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Conversas CSV
            </a>
            <a
              href={`${API_URL}/export/messages/json`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              <FileJson className="h-4 w-4" />
              Mensagens JSON
            </a>
            <a
              href={`${API_URL}/export/messages/csv`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Mensagens CSV
            </a>
            <a
              href={`${API_URL}/export/contacts/csv`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Contatos CSV
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
