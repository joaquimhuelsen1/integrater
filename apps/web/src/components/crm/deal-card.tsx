"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Trophy, XCircle, MoreVertical, Trash2, Archive, MessageSquare, Mail, Phone } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface DealTag {
  id: string
  name: string
  color: string
}

interface CustomFields {
  email_compra?: string
  telefone_contato?: string
  nome_completo?: string
  [key: string]: string | undefined
}

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
  tags?: DealTag[]
  custom_fields?: CustomFields | null
  won_at: string | null
  lost_at: string | null
  created_at: string
  updated_at: string
}

interface DealCardProps {
  deal: Deal
  onClick?: () => void
  isDragging?: boolean
  onArchive?: (dealId: string) => void
  onDelete?: (dealId: string) => void
  onSendMessage?: (dealId: string) => void
}

export function DealCard({ deal, onClick, isDragging, onArchive, onDelete, onSendMessage }: DealCardProps) {
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

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).replace(".", "").replace(" de ", " de ")
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

  const handleArchive = (e: React.MouseEvent) => {
    e.stopPropagation()
    onArchive?.(deal.id)
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm("Tem certeza que deseja excluir este deal permanentemente?")) {
      onDelete?.(deal.id)
    }
  }

  const handleSendMessage = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSendMessage?.(deal.id)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`group relative cursor-pointer rounded-lg border bg-white p-3 md:p-3 shadow-sm transition-all hover:shadow-md active:bg-zinc-50 dark:bg-zinc-800 dark:active:bg-zinc-700/50 ${
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
      {/* Menu de 3 pontinhos */}
      <div className="absolute top-2 right-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="rounded p-1.5 md:p-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-zinc-200 active:bg-zinc-300 dark:hover:bg-zinc-700 dark:active:bg-zinc-600 transition-opacity"
            >
              <MoreVertical className="h-5 w-5 md:h-4 md:w-4 text-zinc-500" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={handleSendMessage}>
              <MessageSquare className="h-4 w-4 mr-2" />
              Enviar mensagem
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleArchive}>
              <Archive className="h-4 w-4 mr-2" />
              Arquivar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDelete} className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400">
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Header: Status badge */}
      {isClosed && (
        <div className="mb-2">
          {isWon ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/50 dark:text-green-400">
              <Trophy className="h-3 w-3" />
              Ganho
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/50 dark:text-red-400">
              <XCircle className="h-3 w-3" />
              Perdido
            </span>
          )}
        </div>
      )}

      {/* Title */}
      <h4 className="mb-2 font-medium text-sm md:text-sm text-zinc-900 dark:text-white line-clamp-2 leading-tight pr-8 md:pr-6">
        {deal.title}
      </h4>

      {/* Tags */}
      {deal.tags && deal.tags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {deal.tags.slice(0, 3).map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: tag.color }}
            >
              {tag.name}
            </span>
          ))}
          {deal.tags.length > 3 && (
            <span className="inline-flex items-center rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400">
              +{deal.tags.length - 3}
            </span>
          )}
        </div>
      )}

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

      {/* Custom Fields - Contact Info */}
      {deal.custom_fields && (deal.custom_fields.email_compra || deal.custom_fields.telefone_contato) && (
        <div className="mb-2 space-y-1">
          {deal.custom_fields.email_compra && (
            <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              <Mail className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{deal.custom_fields.email_compra}</span>
            </div>
          )}
          {deal.custom_fields.telefone_contato && deal.custom_fields.telefone_contato !== deal.custom_fields.email_compra && (
            <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              <Phone className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{deal.custom_fields.telefone_contato}</span>
            </div>
          )}
        </div>
      )}

      {/* Value */}
      <div className="mb-2 md:mb-3 text-base font-semibold text-zinc-900 dark:text-white">
        {formatCurrency(deal.value)}
      </div>

      {/* Footer: Created date */}
      <div className="text-xs text-zinc-500 dark:text-zinc-400">
        {formatDateTime(deal.created_at)}
      </div>
    </div>
  )
}
