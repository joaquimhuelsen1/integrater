"use client"

import { useState, useEffect, useCallback } from "react"
import { ArrowLeft, Search, ShoppingCart, DollarSign, TrendingUp, Calendar, ExternalLink, User } from "lucide-react"
import Link from "next/link"
import { ThemeToggle } from "./theme-toggle"
import { useWorkspace } from "@/contexts/workspace-context"
import { apiFetch } from "@/lib/api"

interface Purchase {
  id: string
  email: string
  product_name: string
  product_id: string
  amount: number
  currency: string
  source: string
  status: string
  purchased_at: string
  contact_id: string | null
  source_data: Record<string, unknown> | null
}

interface PurchaseStats {
  total_purchases: number
  total_amount: number
  by_source: Array<{ source: string; count: number; total_amount: number }>
}

interface PurchasesResponse {
  items: Purchase[]
  next_cursor: string | null
  total: number
}

const sourceColors: Record<string, { bg: string; text: string }> = {
  digistore24: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-300" },
  stripe: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300" },
  hotmart: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-300" },
  kiwify: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300" },
  manual: { bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-700 dark:text-zinc-300" },
}

const statusColors: Record<string, { bg: string; text: string }> = {
  completed: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300" },
  pending: { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-300" },
  refunded: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300" },
  cancelled: { bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-700 dark:text-zinc-300" },
}

export function BuyersView() {
  const { currentWorkspace } = useWorkspace()
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [stats, setStats] = useState<PurchaseStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [sourceFilter, setSourceFilter] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [total, setTotal] = useState(0)

  const loadStats = useCallback(async () => {
    if (!currentWorkspace) return

    try {
      const params = new URLSearchParams()
      params.set("workspace_id", currentWorkspace.id)

      const res = await apiFetch(`/purchases/stats?${params.toString()}`)
      if (res.ok) {
        const data: PurchaseStats = await res.json()
        setStats(data)
      }
    } catch {
      console.error("Erro ao carregar estatisticas")
    }
  }, [currentWorkspace])

  const loadPurchases = useCallback(async (cursor?: string) => {
    if (!currentWorkspace) return

    if (cursor) {
      setIsLoadingMore(true)
    } else {
      setIsLoading(true)
    }

    try {
      const params = new URLSearchParams()
      params.set("workspace_id", currentWorkspace.id)
      params.set("limit", "50")
      if (searchQuery) params.set("search", searchQuery)
      if (sourceFilter) params.set("source", sourceFilter)
      if (dateFrom) params.set("date_from", dateFrom)
      if (dateTo) params.set("date_to", dateTo)
      if (cursor) params.set("cursor", cursor)

      const res = await apiFetch(`/purchases?${params.toString()}`)
      if (res.ok) {
        const data: PurchasesResponse = await res.json()
        if (cursor) {
          setPurchases(prev => [...prev, ...data.items])
        } else {
          setPurchases(data.items)
        }
        setNextCursor(data.next_cursor)
        setTotal(data.total)
      }
    } catch {
      console.error("Erro ao carregar compras")
    } finally {
      setIsLoading(false)
      setIsLoadingMore(false)
    }
  }, [currentWorkspace, searchQuery, sourceFilter, dateFrom, dateTo])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  useEffect(() => {
    const debounce = setTimeout(() => {
      loadPurchases()
    }, 300)
    return () => clearTimeout(debounce)
  }, [loadPurchases])

  const formatCurrency = (amount: number, currency: string = "BRL") => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency,
    }).format(amount)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getSourceStyle = (source: string): { bg: string; text: string } => {
    const style = sourceColors[source.toLowerCase()]
    return style ?? { bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-700 dark:text-zinc-300" }
  }

  const getStatusStyle = (status: string): { bg: string; text: string } => {
    const style = statusColors[status.toLowerCase()]
    return style ?? { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-300" }
  }

  const loadMore = () => {
    if (nextCursor && !isLoadingMore) {
      loadPurchases(nextCursor)
    }
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
            <h1 className="text-xl font-semibold">Compradores</h1>
          </div>
          <ThemeToggle />
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Stats Cards */}
        {stats && (
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <ShoppingCart className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Total Compras</p>
                  <p className="text-2xl font-semibold">{stats.total_purchases}</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
                  <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Receita Total</p>
                  <p className="text-2xl font-semibold">{formatCurrency(stats.total_amount)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                  <TrendingUp className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Por Source</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {stats.by_source.map((item) => {
                      const style = getSourceStyle(item.source)
                      return (
                        <span
                          key={item.source}
                          className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}
                        >
                          {item.source}: {item.count}
                        </span>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col gap-4">
            {/* Row 1: Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Buscar por email ou produto..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>

            {/* Row 2: Source + Dates */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* Source Filter */}
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="">Todas as sources</option>
                <option value="digistore24">Digistore24</option>
                <option value="stripe">Stripe</option>
                <option value="hotmart">Hotmart</option>
                <option value="kiwify">Kiwify</option>
                <option value="manual">Manual</option>
              </select>

              {/* Date From */}
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
                  title="Data inicial"
                />
              </div>

              {/* Date To */}
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
                  title="Data final"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Purchases List */}
        <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <p className="text-sm text-zinc-500">
              {total} compras {searchQuery || sourceFilter || dateFrom || dateTo ? "(filtrado)" : ""}
            </p>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-zinc-500">Carregando...</div>
          ) : purchases.length === 0 ? (
            <div className="py-12 text-center text-zinc-500">
              <ShoppingCart className="mx-auto mb-3 h-12 w-12 text-zinc-300" />
              <p>Nenhuma compra encontrada</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {purchases.map((purchase) => {
                  const sourceStyle = getSourceStyle(purchase.source)
                  const statusStyle = getStatusStyle(purchase.status)
                  const orderUrl = purchase.source_data?.order_url as string | undefined

                  return (
                    <div
                      key={purchase.id}
                      className="flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                          <DollarSign className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{purchase.email}</p>
                            {purchase.contact_id && (
                              <Link
                                href={`/${currentWorkspace?.id}/contacts`}
                                className="flex items-center gap-1 text-xs text-blue-500 hover:underline"
                              >
                                <User className="h-3 w-3" />
                                Ver contato
                              </Link>
                            )}
                          </div>
                          <p className="text-sm text-zinc-600 dark:text-zinc-400 truncate">
                            {purchase.product_name}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {formatDate(purchase.purchased_at)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        {/* Amount */}
                        <div className="text-right">
                          <p className="font-semibold text-green-600 dark:text-green-400">
                            {formatCurrency(purchase.amount, purchase.currency)}
                          </p>
                        </div>

                        {/* Source Badge */}
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${sourceStyle.bg} ${sourceStyle.text}`}
                        >
                          {purchase.source}
                        </span>

                        {/* Status Badge */}
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}
                        >
                          {purchase.status}
                        </span>

                        {/* External Link */}
                        {orderUrl && (
                          <a
                            href={orderUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                            title="Ver pedido"
                          >
                            <ExternalLink className="h-4 w-4 text-zinc-500" />
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Load More */}
              {nextCursor && (
                <div className="border-t border-zinc-200 p-4 text-center dark:border-zinc-800">
                  <button
                    onClick={loadMore}
                    disabled={isLoadingMore}
                    className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                  >
                    {isLoadingMore ? "Carregando..." : "Carregar mais"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
