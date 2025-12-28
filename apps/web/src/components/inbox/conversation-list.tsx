"use client"

import { ConversationItem } from "./conversation-item"

export interface Tag {
  id: string
  name: string
  color: string
}

export interface Conversation {
  id: string
  last_channel: "telegram" | "email" | "openphone_sms" | null
  status: "open" | "pending" | "resolved"
  contact_id: string | null
  primary_identity_id: string | null
  last_message_at: string | null
  last_message_preview?: string | null
  unread_count?: number
  is_pinned?: boolean
  archived_at?: string | null
  contact?: { display_name: string | null } | null
  primary_identity?: {
    type: string
    value: string
    metadata: {
      display_name?: string
      first_name?: string
      last_name?: string
      username?: string
      title?: string
      avatar_url?: string
    } | null
  } | null
  conversation_tags?: { tag: Tag }[]
}

interface ConversationListProps {
  conversations: Conversation[]
  selectedId: string | null
  onSelect: (id: string) => void
  onPin?: (id: string) => void
  onUnpin?: (id: string) => void
  onMarkRead?: (id: string) => void
  onMarkUnread?: (id: string) => void
  onArchive?: (id: string) => void
  onDelete?: (id: string) => void
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onPin,
  onUnpin,
  onMarkRead,
  onMarkUnread,
  onArchive,
  onDelete,
}: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-zinc-500">
        Nenhuma conversa
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {conversations.map((conv) => (
        <ConversationItem
          key={conv.id}
          conversation={conv}
          isSelected={conv.id === selectedId}
          isPinned={conv.is_pinned || false}
          onClick={() => onSelect(conv.id)}
          onPin={onPin}
          onUnpin={onUnpin}
          onMarkRead={onMarkRead}
          onMarkUnread={onMarkUnread}
          onArchive={onArchive}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
