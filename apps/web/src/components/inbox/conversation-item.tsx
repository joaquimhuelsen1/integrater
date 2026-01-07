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

const avatarColors = [
  "bg-blue-500",
  "bg-green-500",
  "bg-purple-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-rose-500",
]

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
    const index = conversation.id.charCodeAt(0) % avatarColors.length
    return avatarColors[index]
  }

  return (
    <>
    <button
      onClick={onClick}
      onContextMenu={handleContextMenu}
      className={`flex w-full cursor-pointer items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
        isSelected ? "bg-blue-500/10 dark:bg-blue-500/10" : ""
      } ${hasUnread ? "bg-zinc-50/50 dark:bg-zinc-800/30" : ""}`}
    >
      <div className="relative flex-shrink-0">
        {avatarUrl ? (
          <div className="relative h-14 w-14 overflow-hidden rounded-full">
            <Image
              src={avatarUrl}
              alt={displayName}
              fill
              className="object-cover"
              sizes="56px"
            />
          </div>
        ) : (
          <div className={`flex h-14 w-14 items-center justify-center rounded-full text-lg font-medium text-white ${getAvatarColor()}`}>
            {getInitials()}
          </div>
        )}
        {/* Channel icon badge */}
        <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-zinc-100 dark:border-zinc-900 dark:bg-zinc-700">
          <Icon className={`h-3 w-3 ${iconColor}`} />
        </span>
        {/* Online indicator */}
        {isOnline && (
          <span 
            className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-green-500 dark:border-zinc-900" 
            title="Online"
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {isPinned && (
              <Pin className="h-4 w-4 flex-shrink-0 text-blue-500" />
            )}
            <span className="truncate text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
              {displayName}
            </span>
            {isUnlinked && (
              <span className="flex-shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                Novo
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-zinc-500">{timeAgo}</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 mt-1">
          <span className="truncate text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed flex items-center gap-1">
            {/* Checkmarks para mensagens outbound */}
            {lastMessageDirection === "outbound" && (
              isLastOutboundRead
                ? <CheckCheck className="h-6 w-6 text-blue-400 flex-shrink-0" />
                : <Check className="h-6 w-6 text-zinc-400 flex-shrink-0" />
            )}
            <span className="truncate">{conversation.last_message_preview || ""}</span>
          </span>
          {hasUnread && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs font-medium text-white flex-shrink-0">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
        {tags.length > 0 && (
          <div className="flex gap-1 mt-1.5">
            {tags.slice(0, 3).map(tag => (
              <span
                key={tag.id}
                className="rounded px-1.5 py-0.5 text-xs font-medium"
                style={{ backgroundColor: tag.color + "20", color: tag.color }}
              >
                {tag.name}
              </span>
            ))}
            {tags.length > 3 && (
              <span className="text-xs text-zinc-400">+{tags.length - 3}</span>
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
