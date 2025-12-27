"use client"

import { useState, useEffect, useCallback } from "react"
import {
  ArrowLeft,
  TrendingUp,
  MessageSquare,
  DollarSign,
  Users,
  Trophy,
  RefreshCw,
} from "lucide-react"
import Link from "next/link"
import { useWorkspace } from "@/contexts/workspace-context"

interface WorkspaceSummary {
  id: string
  name: string
  color: string
  deals_count: number
  deals_value: number
  conversations_count: number
  unread_count: number
}

interface AnalyticsSummary {
  workspaces: WorkspaceSummary[]
  totals: {
    deals_count: number
    deals_value: number
    deals_won_count: number
    deals_won_value: number
    conversations_count: number
    unread_count: number
  }
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<string[]>([])
  const { workspaces } = useWorkspace()

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  const loadSummary = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = selectedWorkspaceIds.length > 0
        ? `?workspace_ids=${selectedWorkspaceIds.join(",")}`
        : ""
      const res = await fetch(`${API_URL}/analytics/summary${params}`)
      if (res.ok) {
        const data = await res.json()
        setSummary(data)
      }
    } catch (error) {
      console.error("Erro ao carregar analytics:", error)
    } finally {
      setIsLoading(false)
    }
  }, [API_URL, selectedWorkspaceIds])

  useEffect(() => {
    loadSummary()
  }, [loadSummary])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value)
  }

  const toggleWorkspace = (id: string) => {
    setSelectedWorkspaceIds((prev) =>
      prev.includes(id) ? prev.filter((wId) => wId !== id) : [...prev, id]
    )
  }

  const maxValue = summary?.workspaces.reduce(
    (max, ws) => Math.max(max, ws.deals_value),
    0
  ) || 1

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-xl font-semibold">Dashboard Global</h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadSummary}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Filtro de Workspaces */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-sm text-zinc-500">Filtrar por:</span>
          <button
            onClick={() => setSelectedWorkspaceIds([])}
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              selectedWorkspaceIds.length === 0
                ? "bg-blue-500 text-white"
                : "bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600"
            }`}
          >
            Todos
          </button>
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => toggleWorkspace(ws.id)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors ${
                selectedWorkspaceIds.includes(ws.id)
                  ? "text-white"
                  : "bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600"
              }`}
              style={{
                backgroundColor: selectedWorkspaceIds.includes(ws.id)
                  ? ws.color
                  : undefined,
              }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: ws.color }}
              />
              {ws.name}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex h-64 items-center justify-center text-zinc-500">
            Carregando analytics...
          </div>
        ) : summary ? (
          <>
            {/* Cards de Totais */}
            <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-zinc-500">Total Deals</p>
                    <p className="mt-1 text-2xl font-semibold">
                      {summary.totals.deals_count}
                    </p>
                  </div>
                  <div className="rounded-lg bg-blue-100 p-3 dark:bg-blue-900/30">
                    <TrendingUp className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-zinc-500">Valor Total</p>
                    <p className="mt-1 text-2xl font-semibold">
                      {formatCurrency(summary.totals.deals_value)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-green-100 p-3 dark:bg-green-900/30">
                    <DollarSign className="h-5 w-5 text-green-600" />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-zinc-500">Conversas</p>
                    <p className="mt-1 text-2xl font-semibold">
                      {summary.totals.conversations_count}
                    </p>
                    {summary.totals.unread_count > 0 && (
                      <p className="text-xs text-orange-500">
                        {summary.totals.unread_count} não lidas
                      </p>
                    )}
                  </div>
                  <div className="rounded-lg bg-purple-100 p-3 dark:bg-purple-900/30">
                    <MessageSquare className="h-5 w-5 text-purple-600" />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-zinc-500">Deals Ganhos</p>
                    <p className="mt-1 text-2xl font-semibold">
                      {summary.totals.deals_won_count}
                    </p>
                    <p className="text-xs text-green-500">
                      {formatCurrency(summary.totals.deals_won_value)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-yellow-100 p-3 dark:bg-yellow-900/30">
                    <Trophy className="h-5 w-5 text-yellow-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* Por Workspace */}
            <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-4 text-lg font-semibold">Por Workspace</h2>

              <div className="space-y-4">
                {summary.workspaces.map((ws) => {
                  const percentage = (ws.deals_value / maxValue) * 100
                  return (
                    <div key={ws.id} className="flex items-center gap-4">
                      <div className="flex w-32 items-center gap-2">
                        <span
                          className="h-3 w-3 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: ws.color }}
                        />
                        <span className="truncate text-sm font-medium">
                          {ws.name}
                        </span>
                      </div>

                      <div className="flex-1">
                        <div className="h-6 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${percentage}%`,
                              backgroundColor: ws.color,
                            }}
                          />
                        </div>
                      </div>

                      <div className="w-40 text-right text-sm">
                        <span className="font-medium">
                          {formatCurrency(ws.deals_value)}
                        </span>
                        <span className="ml-2 text-zinc-500">
                          ({ws.deals_count} deals)
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {summary.workspaces.length === 0 && (
                <p className="text-center text-zinc-500">
                  Nenhum workspace encontrado
                </p>
              )}
            </div>

            {/* Detalhes por Workspace */}
            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {summary.workspaces.map((ws) => (
                <div
                  key={ws.id}
                  className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="mb-4 flex items-center gap-2">
                    <span
                      className="h-4 w-4 rounded-full"
                      style={{ backgroundColor: ws.color }}
                    />
                    <h3 className="font-semibold">{ws.name}</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-zinc-500">Deals</p>
                      <p className="text-lg font-medium">{ws.deals_count}</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Valor</p>
                      <p className="text-lg font-medium">
                        {formatCurrency(ws.deals_value)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Conversas</p>
                      <p className="text-lg font-medium">
                        {ws.conversations_count}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Não Lidas</p>
                      <p
                        className={`text-lg font-medium ${
                          ws.unread_count > 0 ? "text-orange-500" : ""
                        }`}
                      >
                        {ws.unread_count}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex h-64 items-center justify-center text-zinc-500">
            Erro ao carregar dados
          </div>
        )}
      </div>
    </div>
  )
}
