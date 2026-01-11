"use client"

import { useEffect, useState } from "react"
import { apiFetch } from "@/lib/api"
import { useWorkspace } from "@/contexts/workspace-context"
import {
  ShoppingBag,
  MessageSquare,
  TrendingUp,
  Calendar,
  ExternalLink
} from "lucide-react"

interface ContactHistory {
  contact: {
    id: string
    display_name: string
    lead_stage: string
  }
  purchases: Array<{
    id: string
    product_name: string
    amount: number
    currency: string
    status: string
    purchased_at: string
    source: string
  }>
  deals: Array<{
    id: string
    title: string
    value: number
    status: string
    stages?: { name: string }
    created_at: string
    won_at?: string
    lost_at?: string
  }>
  conversations: Array<{
    id: string
    channel: string
    status: string
    last_message_at: string
    contact_identities?: { type: string; value: string }
  }>
  stats: {
    total_purchases: number
    total_purchases_value: number
    total_deals: number
    total_deals_won_value: number
    total_conversations: number
  }
}

interface ContactHistoryPanelProps {
  contactId: string
  onSelectConversation?: (conversationId: string) => void
}

export function ContactHistoryPanel({
  contactId,
  onSelectConversation
}: ContactHistoryPanelProps) {
  const { currentWorkspace } = useWorkspace()
  const [history, setHistory] = useState<ContactHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"purchases" | "deals" | "conversations">("purchases")

  useEffect(() => {
    if (!contactId || !currentWorkspace?.id) return

    const loadHistory = async () => {
      setLoading(true)
      try {
        const response = await apiFetch(
          `/contacts/${contactId}/history?workspace_id=${currentWorkspace.id}`
        )
        if (response.ok) {
          const data = await response.json()
          setHistory(data)
        }
      } catch (err) {
        console.error("Failed to load contact history:", err)
      } finally {
        setLoading(false)
      }
    }

    loadHistory()
  }, [contactId, currentWorkspace?.id])

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  if (!history) {
    return (
      <div className="p-4 text-center text-sm text-gray-500">
        Historico nao disponivel
      </div>
    )
  }

  const formatCurrency = (value: number, currency: string = "BRL") => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency
    }).format(value)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    })
  }

  const channelIcons: Record<string, string> = {
    telegram: "T",
    email: "@",
    sms: "#"
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-green-50 p-3 text-center dark:bg-green-900/20">
          <div className="text-lg font-bold text-green-700 dark:text-green-400">
            {formatCurrency(history.stats.total_purchases_value)}
          </div>
          <div className="text-xs text-green-600 dark:text-green-500">
            {history.stats.total_purchases} compras
          </div>
        </div>
        <div className="rounded-lg bg-blue-50 p-3 text-center dark:bg-blue-900/20">
          <div className="text-lg font-bold text-blue-700 dark:text-blue-400">
            {formatCurrency(history.stats.total_deals_won_value)}
          </div>
          <div className="text-xs text-blue-600 dark:text-blue-500">
            {history.stats.total_deals} deals
          </div>
        </div>
        <div className="rounded-lg bg-purple-50 p-3 text-center dark:bg-purple-900/20">
          <div className="text-lg font-bold text-purple-700 dark:text-purple-400">
            {history.stats.total_conversations}
          </div>
          <div className="text-xs text-purple-600 dark:text-purple-500">conversas</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b dark:border-gray-700">
        <button
          onClick={() => setActiveTab("purchases")}
          className={`flex-1 border-b-2 px-3 py-2 text-sm font-medium ${
            activeTab === "purchases"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
          }`}
        >
          <ShoppingBag className="mr-1 inline h-4 w-4" />
          Compras
        </button>
        <button
          onClick={() => setActiveTab("deals")}
          className={`flex-1 border-b-2 px-3 py-2 text-sm font-medium ${
            activeTab === "deals"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
          }`}
        >
          <TrendingUp className="mr-1 inline h-4 w-4" />
          Deals
        </button>
        <button
          onClick={() => setActiveTab("conversations")}
          className={`flex-1 border-b-2 px-3 py-2 text-sm font-medium ${
            activeTab === "conversations"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
          }`}
        >
          <MessageSquare className="mr-1 inline h-4 w-4" />
          Conversas
        </button>
      </div>

      {/* Tab Content */}
      <div className="max-h-64 overflow-y-auto">
        {activeTab === "purchases" && (
          <div className="space-y-2">
            {history.purchases.length === 0 ? (
              <div className="py-4 text-center text-sm text-gray-500">
                Nenhuma compra registrada
              </div>
            ) : (
              history.purchases.map((purchase) => (
                <div
                  key={purchase.id}
                  className="flex items-center justify-between rounded-lg border p-3 dark:border-gray-700"
                >
                  <div>
                    <div className="font-medium dark:text-white">{purchase.product_name}</div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Calendar className="h-3 w-3" />
                      {formatDate(purchase.purchased_at)}
                      <span className="rounded bg-gray-100 px-1 dark:bg-gray-800">
                        {purchase.source}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-green-600">
                      {formatCurrency(purchase.amount, purchase.currency)}
                    </div>
                    <div className="text-xs text-gray-500">{purchase.status}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "deals" && (
          <div className="space-y-2">
            {history.deals.length === 0 ? (
              <div className="py-4 text-center text-sm text-gray-500">
                Nenhum deal vinculado
              </div>
            ) : (
              history.deals.map((deal) => (
                <div
                  key={deal.id}
                  className="flex items-center justify-between rounded-lg border p-3 dark:border-gray-700"
                >
                  <div>
                    <div className="font-medium dark:text-white">{deal.title}</div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span
                        className={`rounded px-1 ${
                          deal.status === "won"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : deal.status === "lost"
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        }`}
                      >
                        {deal.stages?.name || deal.status}
                      </span>
                      <Calendar className="h-3 w-3" />
                      {formatDate(deal.created_at)}
                    </div>
                  </div>
                  <div className="text-right font-bold dark:text-white">
                    {formatCurrency(deal.value)}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "conversations" && (
          <div className="space-y-2">
            {history.conversations.length === 0 ? (
              <div className="py-4 text-center text-sm text-gray-500">
                Nenhuma conversa encontrada
              </div>
            ) : (
              history.conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => onSelectConversation?.(conv.id)}
                  className="flex w-full items-center justify-between rounded-lg border p-3 text-left hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-sm font-bold dark:bg-gray-800">
                      {channelIcons[conv.channel] || "?"}
                    </span>
                    <div>
                      <div className="font-medium capitalize dark:text-white">{conv.channel}</div>
                      <div className="text-xs text-gray-500">
                        {conv.contact_identities?.value || ""}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500">
                      {formatDate(conv.last_message_at)}
                    </div>
                    <ExternalLink className="h-4 w-4 text-gray-400" />
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
