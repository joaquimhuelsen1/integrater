"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Calendar, User, Trophy, XCircle, MessageSquare, Clock } from "lucide-react"

interface Deal {
  id: string
  title: string
  value: number
  probability: number
  expected_close_date: string | null
  stage_id: string
  contact_id: string | null
  conversation_id?: string | null
  contact?: { id: string; display_name: string | null } | null
  won_at: string | null
  lost_at: string | null
  created_at: string
  updated_at: string
}

interface DealCardProps {
  deal: Deal
  onClick?: () => void
  isDragging?: boolean
}

export function DealCard({ deal, onClick, isDragging }: DealCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: deal.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    })
  }

  // Calcula dias até o vencimento
  const getDaysUntilClose = (dateStr: string) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const closeDate = new Date(dateStr)
    closeDate.setHours(0, 0, 0, 0)
    const diffTime = closeDate.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  const getDateStatus = (dateStr: string) => {
    const days = getDaysUntilClose(dateStr)
    if (days < 0) {
      return { text: `${Math.abs(days)}d atrás`, color: "text-red-500" }
    } else if (days === 0) {
      return { text: "Hoje", color: "text-orange-500" }
    } else if (days === 1) {
      return { text: "Amanhã", color: "text-orange-500" }
    } else if (days <= 7) {
      return { text: `${days}d`, color: "text-yellow-600" }
    } else {
      return { text: formatDate(dateStr), color: "text-zinc-500" }
    }
  }

  // Avatar com iniciais
  const getInitials = (name: string | null) => {
    if (!name) return "?"
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  const getAvatarColor = (id: string) => {
    const colors = [
      "bg-blue-500",
      "bg-green-500",
      "bg-purple-500",
      "bg-orange-500",
      "bg-pink-500",
      "bg-teal-500",
      "bg-indigo-500",
      "bg-rose-500",
    ]
    const index = id.charCodeAt(0) % colors.length
    return colors[index]
  }

  const isWon = !!deal.won_at
  const isLost = !!deal.lost_at
  const isClosed = isWon || isLost
  const hasConversation = !!deal.conversation_id

  const dateStatus = deal.expected_close_date
    ? getDateStatus(deal.expected_close_date)
    : null

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`cursor-pointer rounded-lg border bg-white p-3 shadow-sm transition-all hover:shadow-md dark:bg-zinc-800 ${
        isDragging || isSortableDragging
          ? "opacity-50 shadow-lg ring-2 ring-blue-500"
          : ""
      } ${
        isWon
          ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
          : isLost
          ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
          : "border-zinc-200 dark:border-zinc-700"
      }`}
    >
      {/* Header: Status + Conversation indicator */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          {isClosed ? (
            isWon ? (
              <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/50 dark:text-green-400">
                <Trophy className="h-3 w-3" />
                Ganho
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/50 dark:text-red-400">
                <XCircle className="h-3 w-3" />
                Perdido
              </span>
            )
          ) : dateStatus && dateStatus.color === "text-red-500" ? (
            <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600 dark:bg-red-900/50">
              <Clock className="h-3 w-3" />
              Atrasado
            </span>
          ) : null}
        </div>

        {hasConversation && (
          <div className="flex items-center" title="Tem conversa vinculada">
            <MessageSquare className="h-3.5 w-3.5 text-blue-500" />
          </div>
        )}
      </div>

      {/* Title */}
      <h4 className="mb-2 font-medium text-sm text-zinc-900 dark:text-white line-clamp-2 leading-tight">
        {deal.title}
      </h4>

      {/* Contact with Avatar */}
      {deal.contact?.display_name && (
        <div className="mb-2 flex items-center gap-2">
          <div
            className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white ${getAvatarColor(
              deal.contact.id
            )}`}
          >
            {getInitials(deal.contact.display_name)}
          </div>
          <span className="truncate text-xs text-zinc-600 dark:text-zinc-400">
            {deal.contact.display_name}
          </span>
        </div>
      )}

      {/* Value */}
      <div className="mb-3 text-base font-semibold text-zinc-900 dark:text-white">
        {formatCurrency(deal.value)}
      </div>

      {/* Footer: Date + Probability */}
      <div className="flex items-center justify-between border-t border-zinc-100 pt-2 dark:border-zinc-700/50">
        {/* Date */}
        <div className="flex items-center gap-1 text-xs">
          {dateStatus ? (
            <>
              <Calendar className={`h-3 w-3 ${dateStatus.color}`} />
              <span className={dateStatus.color}>{dateStatus.text}</span>
            </>
          ) : (
            <span className="text-zinc-400">Sem data</span>
          )}
        </div>

        {/* Probability bar */}
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-10 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            <div
              className={`h-full rounded-full transition-all ${
                deal.probability >= 70
                  ? "bg-green-500"
                  : deal.probability >= 40
                  ? "bg-yellow-500"
                  : "bg-red-500"
              }`}
              style={{ width: `${deal.probability}%` }}
            />
          </div>
          <span className="text-xs text-zinc-500 tabular-nums">
            {deal.probability}%
          </span>
        </div>
      </div>
    </div>
  )
}
