"use client"

import { MessageSquare, Mail, Phone } from "lucide-react"

export interface ContactWithConversations {
  id: string
  display_name: string
  metadata?: Record<string, unknown>
  channels: string[]
  last_activity: string | null
  last_message_preview: string | null
  total_unread: number
}

interface ContactItemProps {
  contact: ContactWithConversations
  isSelected: boolean
  onClick: () => void
}

const channelIcons = {
  telegram_user: MessageSquare,
  telegram: MessageSquare,
  email: Mail,
  phone: Phone,
  openphone_sms: Phone,
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

export function ContactItem({
  contact,
  isSelected,
  onClick,
}: ContactItemProps) {
  const timeAgo = contact.last_activity
    ? formatTimeAgo(new Date(contact.last_activity))
    : ""

  const hasUnread = contact.total_unread > 0

  // Avatar
  const getInitials = () => {
    if (!contact.display_name) return "?"
    return contact.display_name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }
  const getAvatarColor = () => {
    const index = contact.id.charCodeAt(0) % avatarColors.length
    return avatarColors[index]
  }

  // Canais únicos (remove duplicatas)
  const uniqueChannels = [...new Set(contact.channels)]

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-4 border-b border-zinc-100 p-4 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50 ${
        isSelected ? "bg-zinc-100 dark:bg-zinc-800" : ""
      } ${hasUnread ? "bg-blue-50/50 dark:bg-blue-900/10" : ""}`}
    >
      <div className="relative flex-shrink-0">
        <div className={`flex h-12 w-12 items-center justify-center rounded-full text-base font-medium text-white ${getAvatarColor()}`}>
          {getInitials()}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate text-base font-medium text-zinc-900 dark:text-zinc-100">
              {contact.display_name}
            </span>
            {/* Ícones dos canais disponíveis */}
            <div className="flex items-center gap-1">
              {uniqueChannels.map((ch) => {
                const Icon = channelIcons[ch as keyof typeof channelIcons]
                if (!Icon) return null
                return (
                  <span
                    key={ch}
                    className="flex h-5 w-5 items-center justify-center rounded bg-zinc-100 dark:bg-zinc-700"
                    title={ch}
                  >
                    <Icon className="h-3 w-3 text-zinc-500 dark:text-zinc-400" />
                  </span>
                )
              })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasUnread && (
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-blue-500 px-2 text-sm font-medium text-white">
                {contact.total_unread > 99 ? "99+" : contact.total_unread}
              </span>
            )}
            <span className="flex-shrink-0 text-sm text-zinc-500">{timeAgo}</span>
          </div>
        </div>
        {contact.last_message_preview && (
          <div className="flex items-center gap-2 mt-1">
            <span className="truncate text-sm text-zinc-500 dark:text-zinc-400">
              {contact.last_message_preview}
            </span>
          </div>
        )}
      </div>
    </button>
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
