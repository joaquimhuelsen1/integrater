"use client"

import { MessageSquare, Mail, Phone, Users } from "lucide-react"

const CHANNELS = [
  { id: null, label: "Contatos", icon: Users },
  { id: "telegram", label: "Telegram", icon: MessageSquare },
  { id: "email", label: "Email", icon: Mail },
  { id: "openphone_sms", label: "SMS", icon: Phone },
] as const

export type ChannelId = "telegram" | "email" | "openphone_sms" | null

interface ChannelTabsProps {
  selected: ChannelId
  onSelect: (channel: ChannelId) => void
  counts: Record<string, number>
}

export function ChannelTabs({ selected, onSelect }: Omit<ChannelTabsProps, "counts">) {
  return (
    <div className="flex border-b border-zinc-200 dark:border-zinc-800">
      {CHANNELS.map((ch) => {
        const Icon = ch.icon
        const isSelected = selected === ch.id

        return (
          <button
            key={ch.id ?? "geral"}
            onClick={() => onSelect(ch.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors ${
              isSelected
                ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{ch.label}</span>
          </button>
        )
      })}
    </div>
  )
}
