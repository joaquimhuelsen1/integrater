"use client"

interface DateDividerProps {
  date: Date
}

export function DateDivider({ date }: DateDividerProps) {
  const label = formatDateLabel(date)

  return (
    <div className="flex items-center gap-3 py-4">
      <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
      <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        {label}
      </span>
      <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
    </div>
  )
}

function formatDateLabel(date: Date): string {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (targetDate.getTime() === today.getTime()) {
    return "Hoje"
  }

  if (targetDate.getTime() === yesterday.getTime()) {
    return "Ontem"
  }

  // Data completa para outros dias
  return date.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}
