"use client"

const CHANNELS = [
  { id: null, label: "Todos" },
  { id: "telegram", label: "Telegram" },
  { id: "email", label: "Email" },
  { id: "openphone_sms", label: "SMS" },
  { id: "archived", label: "Arquivadas" },
] as const

export type ChannelId = "telegram" | "email" | "openphone_sms" | "archived" | null

interface ChannelTabsProps {
  selected: ChannelId
  onSelect: (channel: ChannelId) => void
  counts?: Record<string, number>
}

export function ChannelTabs({ selected, onSelect }: ChannelTabsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-hide">
      {CHANNELS.map((ch) => {
        const isSelected = selected === ch.id

        return (
          <button
            key={ch.id ?? "all"}
            onClick={() => onSelect(ch.id)}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              isSelected
                ? "bg-emerald-600 text-white dark:bg-emerald-500"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            }`}
          >
            {ch.label}
          </button>
        )
      })}
    </div>
  )
}
