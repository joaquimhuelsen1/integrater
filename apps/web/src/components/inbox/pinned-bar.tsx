"use client"

import { Pin, ChevronUp, ChevronDown, X } from "lucide-react"
import { useState, useCallback, useMemo } from "react"

interface PinnedMessage {
  id: string
  text: string | null
  direction: "inbound" | "outbound"
  sent_at: string
  attachments?: { mime_type: string }[]
}

interface PinnedBarProps {
  pinnedMessages: PinnedMessage[]
  onNavigate: (messageId: string) => void
  onUnpin?: (messageId: string) => void
  contactName?: string
}

export function PinnedBar({ pinnedMessages, onNavigate, onUnpin, contactName }: PinnedBarProps) {
  const [currentIndex, setCurrentIndex] = useState(0)

  // Ordena por data (mais antiga primeiro para navegação lógica)
  const sortedPinned = useMemo(() =>
    [...pinnedMessages].sort((a, b) =>
      new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
    ),
    [pinnedMessages]
  )

  const currentMessage = sortedPinned[currentIndex]
  const hasMultiple = sortedPinned.length > 1

  const handlePrev = useCallback(() => {
    const newIndex = currentIndex === 0 ? sortedPinned.length - 1 : currentIndex - 1
    setCurrentIndex(newIndex)
  }, [currentIndex, sortedPinned.length])

  const handleNext = useCallback(() => {
    const newIndex = currentIndex === sortedPinned.length - 1 ? 0 : currentIndex + 1
    setCurrentIndex(newIndex)
  }, [currentIndex, sortedPinned.length])

  if (!currentMessage) return null

  // Detecta tipo de anexo
  const hasPhoto = currentMessage.attachments?.some(a => a.mime_type?.startsWith("image/"))
  const hasVideo = currentMessage.attachments?.some(a => a.mime_type?.startsWith("video/"))
  const hasAudio = currentMessage.attachments?.some(a => a.mime_type?.startsWith("audio/"))
  const hasFile = currentMessage.attachments?.some(a => !a.mime_type?.startsWith("image/") && !a.mime_type?.startsWith("video/") && !a.mime_type?.startsWith("audio/"))

  // Texto preview
  let preview = currentMessage.text?.slice(0, 100) || ""
  if (hasPhoto) preview = "📷 Foto" + (preview ? ` - ${preview}` : "")
  else if (hasVideo) preview = "🎬 Vídeo" + (preview ? ` - ${preview}` : "")
  else if (hasAudio) preview = "🎤 Áudio"
  else if (hasFile) preview = "📎 Arquivo" + (preview ? ` - ${preview}` : "")
  else if (!preview) preview = "Mensagem"

  // Quem enviou
  const senderName = currentMessage.direction === "outbound" ? "Você" : (contactName || "Contato")

  return (
    <div className="flex items-center gap-2 border-b border-zinc-200 bg-white/95 px-4 py-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
      {/* Ícone pin */}
      <Pin className="h-4 w-4 flex-shrink-0 rotate-45 text-primary" />

      {/* Navegação (se múltiplas) */}
      {hasMultiple && (
        <div className="flex flex-shrink-0 flex-col">
          <button
            onClick={handlePrev}
            className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            onClick={handleNext}
            className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Conteúdo clicável */}
      <button
        onClick={() => onNavigate(currentMessage.id)}
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-primary">{senderName}</span>
          {hasMultiple && (
            <span className="text-xs text-zinc-400">
              {currentIndex + 1}/{sortedPinned.length}
            </span>
          )}
        </div>
        <div className="truncate text-sm text-zinc-500 dark:text-zinc-400">
          {preview}
        </div>
      </button>

      {/* Botão desafixar */}
      {onUnpin && (
        <button
          onClick={() => onUnpin(currentMessage.id)}
          className="flex-shrink-0 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          title="Desafixar mensagem"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
