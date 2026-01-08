"use client"

import { useState, useRef, useEffect } from "react"
import { MessageSquare, Mail, Phone, Pin, Eye, EyeOff, Archive, ArchiveRestore, Trash2, Check, CheckCheck } from "lucide-react"
import Image from "next/image"
import type { Conversation, Tag } from "./conversation-list"

interface ConversationItemProps {
  conversation: Conversation
  isSelected: boolean
  isPinned?: boolean
  onClick: () => void
  onPin?: (id: string) => void
  onUnpin?: (id: string) => void
  onMarkRead?: (id: string) => void
  onMarkUnread?: (id: string) => void
  onArchive?: (id: string) => void
  onUnarchive?: (id: string) => void
  onDelete?: (id: string) => void
  // Read status da última mensagem outbound
  isLastOutboundRead?: boolean
  lastMessageDirection?: "inbound" | "outbound"
  // Presence status - contato está online
  isOnline?: boolean
  // Typing status - contato está digitando
  isTyping?: boolean
}

const channelIcons = {
  telegram: MessageSquare,
  email: Mail,
  openphone_sms: Phone,
}

const channelColors = {
  telegram: "text-blue-500",
  email: "text-orange-500",
  openphone_sms: "text-purple-500",
}

const statusColors = {
  open: "bg-green-500",
  pending: "bg-yellow-500",
  resolved: "bg-zinc-400",
}

// Cores exatas do Telegram Android (7 cores oficiais)
// Fonte: https://gist.github.com/AYMENJD/f15dcaa96ccd0e3ebbd7cb22ed164150
// Algoritmo: user_id % 7
const telegramAvatarColors = [
  "bg-[#FF845E]", // Red
  "bg-[#FEBB5B]", // Orange
  "bg-[#B694F9]", // Violet
  "bg-[#9AD164]", // Green
  "bg-[#5BCBE3]", // Cyan
  "bg-[#5CAFFA]", // Blue
  "bg-[#FF8AAC]", // Pink
]

// Fallback para outros canais
const defaultAvatarColors = [
  "bg-blue-500",
  "bg-green-500",
  "bg-purple-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-rose-500",
]

/**
 * Calcula a cor do avatar baseado no telegram_user_id
 * Usa o mesmo algoritmo do Telegram: user_id % 7
 */
function getTelegramAvatarColor(telegramUserId: string | number | undefined): string {
  const defaultColor = defaultAvatarColors[0] ?? "bg-blue-500"
  
  if (!telegramUserId) return defaultColor
  
  const userId = typeof telegramUserId === "string" 
    ? parseInt(telegramUserId, 10) 
    : telegramUserId
  
  if (isNaN(userId)) return defaultColor
  
  const colorIndex = Math.abs(userId) % 7
  return telegramAvatarColors[colorIndex] ?? defaultColor
}

export function ConversationItem({
  conversation,
  isSelected,
  isPinned = false,
  onClick,
  onPin,
  onUnpin,
  onMarkRead,
  onMarkUnread,
  onArchive,
  onUnarchive,
  onDelete,
  isLastOutboundRead = false,
  lastMessageDirection,
  isOnline = false,
  isTyping = false,
}: ConversationItemProps) {
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 })
  const menuRef = useRef<HTMLDivElement>(null)

  const channel = conversation.last_channel || "telegram"
  const Icon = channelIcons[channel]
  const iconColor = channelColors[channel] || "text-zinc-600"
  const timeAgo = conversation.last_message_at
    ? formatTimeAgo(new Date(conversation.last_message_at))
    : ""

  // Fechar menu ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowContextMenu(false)
      }
    }
    if (showContextMenu) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [showContextMenu])

  // Handler do menu de contexto (right-click)
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMenuPosition({ x: e.clientX, y: e.clientY })
    setShowContextMenu(true)
  }

  // Nome: contato > identity metadata > desconhecido
  const getDisplayName = () => {
    if (conversation.contact?.display_name) {
      return conversation.contact.display_name
    }
    const meta = conversation.primary_identity?.metadata
    // Email: display_name
    if (meta?.display_name) {
      return meta.display_name
    }
    // Telegram: first_name + last_name
    if (meta?.first_name) {
      return meta.last_name
        ? `${meta.first_name} ${meta.last_name}`
        : meta.first_name
    }
    if (meta?.title) {
      return meta.title
    }
    if (meta?.username) {
      return `@${meta.username}`
    }
    // Email fallback: mostrar o email como nome
    if (conversation.primary_identity?.value && conversation.last_channel === "email") {
      return conversation.primary_identity.value
    }
    return "Desconhecido"
  }
  const displayName = getDisplayName()
  const isUnlinked = !conversation.contact_id
  const tags = conversation.conversation_tags?.map(ct => ct.tag) || []
  const unreadCount = conversation.unread_count || 0
  const hasUnread = unreadCount > 0

  // Avatar
  const avatarUrl = conversation.primary_identity?.metadata?.avatar_url
  const getInitials = () => {
    if (displayName === "Desconhecido") return "?"
    return displayName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }
  const getAvatarColor = () => {
    // Para Telegram, usa cores oficiais baseadas no user_id
    if (channel === "telegram" && conversation.primary_identity?.metadata?.telegram_user_id) {
      return getTelegramAvatarColor(conversation.primary_identity.metadata.telegram_user_id)
    }
    // Fallback para outros canais
    const index = conversation.id.charCodeAt(0) % defaultAvatarColors.length
    return defaultAvatarColors[index] ?? "bg-blue-500"
  }

  return (
    <>
    <button
      onClick={onClick}
      onContextMenu={handleContextMenu}
      className={`flex w-full cursor-pointer items-center gap-3 md:gap-4 px-3 md:px-4 py-3 md:py-4 text-left transition-colors 
        hover:bg-zinc-50 dark:hover:bg-zinc-800/50 
        active:bg-zinc-100 dark:active:bg-zinc-800
        ${isSelected ? "bg-blue-500/10 dark:bg-blue-500/10" : ""} 
        ${hasUnread ? "bg-zinc-50/50 dark:bg-zinc-800/30" : ""}`}
    >
      <div className="relative flex-shrink-0">
        {avatarUrl ? (
          <div className="relative h-12 w-12 md:h-14 md:w-14 overflow-hidden rounded-full">
            <Image
              src={avatarUrl}
              alt={displayName}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 48px, 56px"
            />
          </div>
        ) : (
          <div className={`flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-full text-base md:text-lg font-medium text-white ${getAvatarColor()}`}>
            {getInitials()}
          </div>
        )}
        {/* Channel icon badge */}
        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 md:h-5 md:w-5 items-center justify-center rounded-full border-2 border-white bg-zinc-100 dark:border-zinc-900 dark:bg-zinc-700">
          <Icon className={`h-2.5 w-2.5 md:h-3 md:w-3 ${iconColor}`} />
        </span>
        {/* Online indicator */}
        {isOnline && (
          <span 
            className="absolute -top-0.5 -right-0.5 h-3 w-3 md:h-3.5 md:w-3.5 rounded-full border-2 border-white bg-green-500 dark:border-zinc-900" 
            title="Online"
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
            {isPinned && (
              <Pin className="h-3.5 w-3.5 md:h-4 md:w-4 flex-shrink-0 text-blue-500" />
            )}
            <span className="truncate text-sm md:text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
              {displayName}
            </span>
            {isUnlinked && (
              <span className="flex-shrink-0 rounded bg-amber-100 px-1 md:px-1.5 py-0.5 text-[10px] md:text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                Novo
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[11px] md:text-xs text-zinc-500">{timeAgo}</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5 md:mt-1">
          {isTyping ? (
            <span className="text-[13px] md:text-sm text-purple-500 dark:text-purple-400 leading-relaxed italic">
              digitando...
            </span>
          ) : (
            <span className="truncate text-[13px] md:text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed flex items-center gap-1">
              {/* Checkmarks para mensagens outbound */}
              {lastMessageDirection === "outbound" && (
                isLastOutboundRead
                  ? <CheckCheck className="h-3.5 w-3.5 md:h-4 md:w-4 text-blue-400 flex-shrink-0" />
                  : <Check className="h-3.5 w-3.5 md:h-4 md:w-4 text-zinc-400 flex-shrink-0" />
              )}
              <span className="truncate">{conversation.last_message_preview || ""}</span>
            </span>
          )}
          {hasUnread && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-green-500 px-1.5 text-[11px] md:text-xs font-medium text-white flex-shrink-0">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 md:mt-1.5">
            {tags.slice(0, 2).map(tag => (
              <span
                key={tag.id}
                className="rounded px-1 md:px-1.5 py-0.5 text-[10px] md:text-xs font-medium"
                style={{ backgroundColor: tag.color + "20", color: tag.color }}
              >
                {tag.name}
              </span>
            ))}
            {tags.length > 2 && (
              <span className="text-[10px] md:text-xs text-zinc-400">+{tags.length - 2}</span>
            )}
          </div>
        )}
      </div>
    </button>

    {/* Menu de contexto (right-click) */}
    {showContextMenu && (
      <div
        ref={menuRef}
        className="fixed z-50 min-w-48 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
        style={{ left: menuPosition.x, top: menuPosition.y }}
      >
        {/* Pin/Unpin */}
        {isPinned ? (
          <button
            onClick={() => { onUnpin?.(conversation.id); setShowContextMenu(false) }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700"
          >
            <Pin className="h-4 w-4 text-zinc-500" />
            <span>Desafixar</span>
          </button>
        ) : (
          <button
            onClick={() => { onPin?.(conversation.id); setShowContextMenu(false) }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700"
          >
            <Pin className="h-4 w-4 text-zinc-500" />
            <span>Fixar</span>
          </button>
        )}

        {/* Marcar como lida/não lida */}
        {hasUnread ? (
          <button
            onClick={() => { onMarkRead?.(conversation.id); setShowContextMenu(false) }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700"
          >
            <Eye className="h-4 w-4 text-zinc-500" />
            <span>Marcar como lida</span>
          </button>
        ) : (
          <button
            onClick={() => { onMarkUnread?.(conversation.id); setShowContextMenu(false) }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700"
          >
            <EyeOff className="h-4 w-4 text-zinc-500" />
            <span>Marcar como não lida</span>
          </button>
        )}

        {/* Separador */}
        <div className="my-1 h-px bg-zinc-200 dark:bg-zinc-700" />

        {/* Arquivar/Desarquivar */}
        {conversation.archived_at ? (
          <button
            onClick={() => { onUnarchive?.(conversation.id); setShowContextMenu(false) }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700"
          >
            <ArchiveRestore className="h-4 w-4 text-zinc-500" />
            <span>Desarquivar</span>
          </button>
        ) : (
          <button
            onClick={() => { onArchive?.(conversation.id); setShowContextMenu(false) }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700"
          >
            <Archive className="h-4 w-4 text-zinc-500" />
            <span>Arquivar</span>
          </button>
        )}

        {/* Excluir */}
        <button
          onClick={() => { onDelete?.(conversation.id); setShowContextMenu(false) }}
          className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          <Trash2 className="h-4 w-4" />
          <span>Excluir</span>
        </button>
      </div>
    )}
    </>
  )
}

function formatTimeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "agora"
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}
