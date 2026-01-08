"use client"

import { useState, useEffect, useRef } from "react"
import { Check, CheckCheck, Download, FileText, Image as ImageIcon, X, ZoomIn, ZoomOut, Mic, Play, Pause, FileAudio, Loader2, MessageSquare, Mail, Phone, Reply, Pin, Pencil, Trash2, AlertCircle, Copy } from "lucide-react"
import { createClient } from "@/lib/supabase"
import type { Message, Translation } from "./chat-view"

const channelIcons = {
  telegram: MessageSquare,
  email: Mail,
  openphone_sms: Phone,
}

const channelLabels = {
  telegram: "Telegram",
  email: "Email",
  openphone_sms: "SMS",
}

// Tipos para reações
export interface MessageReaction {
  emoji: string
  count: number
  userReacted: boolean // se o usuário atual reagiu com esse emoji
}

interface MessageItemProps {
  message: Message
  onDownload?: (attachmentId: string, filename: string) => void
  translation?: Translation
  apiUrl?: string
  onTranscriptionComplete?: (messageId: string, transcription: string) => void
  showChannelIndicator?: boolean
  onReply?: (message: Message) => void
  onPin?: (messageId: string) => void
  onUnpin?: (messageId: string) => void
  isPinned?: boolean
  replyToMessage?: Message | null
  isRead?: boolean  // Se a mensagem foi lida pelo destinatário
  onEdit?: (message: Message) => void
  onDelete?: (messageId: string) => void
  // Reações
  reactions?: MessageReaction[]
  onReact?: (messageId: string, emoji: string) => void
  onRemoveReaction?: (messageId: string, emoji: string) => void
}

// Emojis disponíveis para reações
const REACTION_EMOJIS = ["👍", "❤️", "🔥", "😂", "😮", "😢", "👎"]

export function MessageItem({
  message,
  onDownload,
  translation,
  apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  onTranscriptionComplete,
  showChannelIndicator = false,
  onReply,
  onPin,
  onUnpin,
  isPinned = false,
  replyToMessage,
  isRead = false,
  onEdit,
  onDelete,
  reactions = [],
  onReact,
  onRemoveReaction,
}: MessageItemProps) {
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({})
  const [playingAudio, setPlayingAudio] = useState<string | null>(null)
  const [audioProgress, setAudioProgress] = useState<Record<string, number>>({})
  const [expandedImage, setExpandedImage] = useState<string | null>(null)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [transcriptions, setTranscriptions] = useState<Record<string, string>>({})
  const [translatedTranscriptions, setTranslatedTranscriptions] = useState<Record<string, string>>({})
  const [transcribing, setTranscribing] = useState<Record<string, boolean>>({})
  const [audioDurations, setAudioDurations] = useState<Record<string, number>>({})
  const [audioCurrentTime, setAudioCurrentTime] = useState<Record<string, number>>({})
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 })
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const reactionPickerRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  // Reply só disponível para Telegram
  const canReply = message.channel === "telegram"

  const isOutbound = message.direction === "outbound"
  const time = new Date(message.sent_at).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })

  const isImage = (mimeType: string) => mimeType?.startsWith("image/") || false
  const isAudio = (mimeType: string) => mimeType?.startsWith("audio/") || mimeType === "application/ogg" || false

  // Carrega URLs das imagens e áudios
  useEffect(() => {
    if (!message.attachments) return

    const loadMediaUrls = async () => {
      const imgUrls: Record<string, string> = {}
      const audUrls: Record<string, string> = {}

      for (const att of message.attachments || []) {
        if (att.storage_path) {
          const { data } = await supabase.storage
            .from(att.storage_bucket || "attachments")
            .createSignedUrl(att.storage_path, 3600) // 1h

          if (data?.signedUrl) {
            if (isImage(att.mime_type)) {
              imgUrls[att.id] = data.signedUrl
            } else if (isAudio(att.mime_type)) {
              audUrls[att.id] = data.signedUrl
            }
          }
        }
      }
      setImageUrls(imgUrls)
      setAudioUrls(audUrls)
    }

    loadMediaUrls()
  }, [message.attachments, supabase])

  // Fecha modal com ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setExpandedImage(null)
        setZoomLevel(1)
        setShowContextMenu(false)
        setShowReactionPicker(false)
      }
    }
    window.addEventListener("keydown", handleEsc)
    return () => window.removeEventListener("keydown", handleEsc)
  }, [])

  // Fecha menu ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowContextMenu(false)
      }
      if (reactionPickerRef.current && !reactionPickerRef.current.contains(e.target as Node)) {
        setShowReactionPicker(false)
      }
    }
    if (showContextMenu || showReactionPicker) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [showContextMenu, showReactionPicker])

  // Handler do menu de contexto (right-click)
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMenuPosition({ x: e.clientX, y: e.clientY })
    setShowContextMenu(true)
  }

  const openImage = (url: string) => {
    setExpandedImage(url)
    setZoomLevel(1)
  }

  const closeImage = () => {
    setExpandedImage(null)
    setZoomLevel(1)
  }

  const zoomIn = () => setZoomLevel(prev => Math.min(prev + 0.5, 4))
  const zoomOut = () => setZoomLevel(prev => Math.max(prev - 0.5, 0.5))

  // Audio player functions
  const toggleAudio = (attId: string) => {
    const audioEl = document.getElementById(`audio-${attId}`) as HTMLAudioElement
    if (!audioEl) return

    if (playingAudio === attId) {
      audioEl.pause()
      setPlayingAudio(null)
    } else {
      // Pause any other playing audio
      if (playingAudio) {
        const prevAudio = document.getElementById(`audio-${playingAudio}`) as HTMLAudioElement
        prevAudio?.pause()
      }
      audioEl.play()
      setPlayingAudio(attId)
    }
  }

  const handleAudioTimeUpdate = (attId: string, e: React.SyntheticEvent<HTMLAudioElement>) => {
    const audio = e.currentTarget
    const progress = (audio.currentTime / audio.duration) * 100
    setAudioProgress(prev => ({ ...prev, [attId]: progress }))
    setAudioCurrentTime(prev => ({ ...prev, [attId]: audio.currentTime }))
  }

  const handleAudioLoadedMetadata = (attId: string, e: React.SyntheticEvent<HTMLAudioElement>) => {
    const audio = e.currentTarget
    setAudioDurations(prev => ({ ...prev, [attId]: audio.duration }))
  }

  const handleAudioEnded = (attId: string) => {
    setPlayingAudio(null)
    setAudioProgress(prev => ({ ...prev, [attId]: 0 }))
    setAudioCurrentTime(prev => ({ ...prev, [attId]: 0 }))
  }

  const formatDuration = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0:00"
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  // Carrega transcrições em cache
  useEffect(() => {
    if (!message.attachments) return

    const loadCachedTranscriptions = async () => {
      for (const att of message.attachments || []) {
        if (isAudio(att.mime_type)) {
          try {
            const resp = await fetch(`${apiUrl}/transcribe/attachment/${att.id}`)
            if (resp.ok) {
              const data = await resp.json()
              if (data?.transcription) {
                setTranscriptions(prev => ({ ...prev, [att.id]: data.transcription }))
              }
              if (data?.translated_transcription) {
                setTranslatedTranscriptions(prev => ({ ...prev, [att.id]: data.translated_transcription }))
              }
            }
          } catch {
            // Ignora
          }
        }
      }
    }

    loadCachedTranscriptions()
  }, [message.attachments, apiUrl])

  // Transcreve áudio
  const transcribeAudio = async (attachmentId: string) => {
    if (transcribing[attachmentId]) return

    setTranscribing(prev => ({ ...prev, [attachmentId]: true }))
    try {
      const resp = await fetch(`${apiUrl}/transcribe/attachment/${attachmentId}`, {
        method: "POST",
      })
      if (resp.ok) {
        const data = await resp.json()
        setTranscriptions(prev => ({ ...prev, [attachmentId]: data.transcription }))
        if (data.translated_transcription) {
          setTranslatedTranscriptions(prev => ({ ...prev, [attachmentId]: data.translated_transcription }))
        }
        onTranscriptionComplete?.(message.id, data.transcription)
      }
    } catch (err) {
      console.error("Erro ao transcrever:", err)
    } finally {
      setTranscribing(prev => ({ ...prev, [attachmentId]: false }))
    }
  }

  // Usa tradução se disponível, senão texto original
  const displayText = translation?.translated_text || message.text

  // Regex para detectar URLs
  const urlRegex = /(https?:\/\/[^\s<]+[^\s<.,;:!?\])}"'])/gi

  // Renderiza texto com links clicáveis
  const renderTextWithLinks = (text: string) => {
    const parts = text.split(urlRegex)
    return parts.map((part, index) => {
      if (urlRegex.test(part)) {
        // Reset regex lastIndex (stateful regex)
        urlRegex.lastIndex = 0
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`underline hover:opacity-80 ${
              isOutbound ? "text-purple-100" : "text-blue-600 dark:text-blue-400"
            }`}
          >
            {part}
          </a>
        )
      }
      return part
    })
  }

  return (
    <>
      {/* Modal de imagem expandida */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={closeImage}
        >
          <div className="absolute right-4 top-4 flex gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); zoomOut() }}
              className="rounded-full bg-white/20 p-2 text-white hover:bg-white/30"
              title="Diminuir zoom"
            >
              <ZoomOut className="h-5 w-5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); zoomIn() }}
              className="rounded-full bg-white/20 p-2 text-white hover:bg-white/30"
              title="Aumentar zoom"
            >
              <ZoomIn className="h-5 w-5" />
            </button>
            <button
              onClick={closeImage}
              className="rounded-full bg-white/20 p-2 text-white hover:bg-white/30"
              title="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-white/70">
            {Math.round(zoomLevel * 100)}% • Clique fora para fechar • ESC
          </div>
          <img
            src={expandedImage}
            alt="Imagem expandida"
            className="max-h-[90vh] max-w-[90vw] cursor-zoom-in object-contain transition-transform duration-200"
            style={{ transform: `scale(${zoomLevel})` }}
            onClick={(e) => { e.stopPropagation(); zoomIn() }}
          />
        </div>
      )}

      <div
        className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
      >
        <div
          className="relative max-w-[70%] cursor-pointer"
          onContextMenu={handleContextMenu}
        >
          {/* Indicador de mensagem fixada */}
          {isPinned && (
            <div className="absolute -top-5 left-0 flex items-center gap-1 text-xs text-violet-500">
              <Pin className="h-3 w-3" />
              <span>Fixada</span>
            </div>
          )}

          {/* Preview da mensagem sendo respondida */}
          {replyToMessage && (
            <div
              className={`mb-1 rounded-lg border-l-2 px-2 py-1 text-xs ${
                isOutbound
                  ? "border-purple-300 bg-purple-700/50 text-purple-200"
                  : "border-zinc-400 bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400"
              }`}
            >
              <div className="font-medium">
                {replyToMessage.direction === "outbound" ? "Você" : "Contato"}
              </div>
              <div className="truncate">{replyToMessage.text?.slice(0, 50) || "Anexo"}</div>
            </div>
          )}

          <div
            className={`rounded-2xl px-4 py-2 shadow-sm ${
              isOutbound
                ? "bg-purple-600 text-white dark:bg-purple-700"
                : "bg-white text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
            }`}
          >
          {/* Imagens primeiro */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="space-y-2">
              {message.attachments.filter(att => isImage(att.mime_type)).map((att) => (
                <div key={att.id} className="group relative overflow-hidden rounded">
                  {imageUrls[att.id] ? (
                    <>
                      <img
                        src={imageUrls[att.id]}
                        alt={att.file_name || "Imagem"}
                        className="max-h-64 w-auto cursor-pointer rounded object-contain"
                        onClick={() => { const url = imageUrls[att.id]; if (url) openImage(url); }}
                      />
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
                        <ZoomIn className="h-8 w-8 text-white" />
                      </div>
                    </>
                  ) : (
                    <div className="flex h-32 w-full items-center justify-center bg-zinc-200 dark:bg-zinc-700">
                      <ImageIcon className="h-8 w-8 text-zinc-400" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Áudios - Estilo Telegram */}
          {message.attachments && message.attachments.filter(att => isAudio(att.mime_type)).length > 0 && (
            <div className="space-y-2">
              {message.attachments.filter(att => isAudio(att.mime_type)).map((att) => (
                <div key={att.id} className="min-w-[280px] space-y-1">
                  <div className="flex items-center gap-3">
                    {/* Botão Play circular estilo Telegram */}
                    <button
                      onClick={() => audioUrls[att.id] && toggleAudio(att.id)}
                      className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
                        isOutbound
                          ? "bg-white/20 hover:bg-white/30"
                          : "bg-purple-500 hover:bg-purple-600 text-white"
                      }`}
                    >
                      {playingAudio === att.id ? (
                        <Pause className="h-6 w-6" />
                      ) : (
                        <Play className="ml-1 h-6 w-6" />
                      )}
                    </button>

                    {/* Waveform / Progress */}
                    <div className="flex min-w-[140px] flex-1 flex-col gap-1">
                      {/* Barra de progresso estilo waveform */}
                      <div className="flex h-6 items-end gap-[2px]">
                        {Array.from({ length: 30 }).map((_, i) => {
                          const heights = [10, 14, 18, 12, 22, 16, 11, 20, 13, 17, 15, 24, 12, 16, 18, 14, 22, 11, 17, 20, 13, 15, 24, 16, 12, 18, 14, 22, 17, 20]
                          const progress = audioProgress[att.id] || 0
                          const isActive = (i / 30) * 100 <= progress
                          return (
                            <div
                              key={i}
                              className={`w-[3px] rounded-full transition-colors ${
                                isActive
                                  ? isOutbound ? "bg-white" : "bg-purple-500"
                                  : isOutbound ? "bg-white/30" : "bg-zinc-300 dark:bg-zinc-600"
                              }`}
                              style={{ height: `${heights[i % heights.length]}px` }}
                            />
                          )
                        })}
                      </div>

                      {/* Duração */}
                      <span className={`text-xs ${isOutbound ? "text-white/70" : "text-zinc-500 dark:text-zinc-400"}`}>
                        {playingAudio === att.id
                          ? formatDuration(audioCurrentTime[att.id] || 0)
                          : formatDuration(audioDurations[att.id] || 0)}
                      </span>
                    </div>

                    {/* Botão Transcrever */}
                    {!transcriptions[att.id] && (
                      <button
                        onClick={() => transcribeAudio(att.id)}
                        disabled={transcribing[att.id]}
                        className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs transition-colors ${
                          isOutbound
                            ? "bg-white/20 hover:bg-white/30 disabled:opacity-50"
                            : "bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 disabled:opacity-50"
                        }`}
                        title="Transcrever áudio"
                      >
                        {transcribing[att.id] ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <FileAudio className="h-3 w-3" />
                        )}
                      </button>
                    )}

                    {audioUrls[att.id] && (
                      <audio
                        id={`audio-${att.id}`}
                        src={audioUrls[att.id]}
                        onTimeUpdate={(e) => handleAudioTimeUpdate(att.id, e)}
                        onLoadedMetadata={(e) => handleAudioLoadedMetadata(att.id, e)}
                        onEnded={() => handleAudioEnded(att.id)}
                        preload="metadata"
                      />
                    )}
                  </div>

                  {/* Transcrição (traduzida se inbound e disponível) */}
                  {transcriptions[att.id] && (
                    <div
                      className={`mt-1 rounded-lg px-3 py-2 text-xs ${
                        isOutbound
                          ? "bg-purple-700/50 text-purple-100"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      <span className="font-medium">Transcrição:</span>{" "}
                      {!isOutbound && translatedTranscriptions[att.id]
                        ? translatedTranscriptions[att.id]
                        : transcriptions[att.id]}
                      {!isOutbound && translatedTranscriptions[att.id] && (
                        <span className="ml-1 opacity-60">(traduzido)</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

        {/* Subject do email */}
        {message.channel === "email" && message.subject && (
          <div className={`${displayText ? "mb-1" : ""} ${
            message.attachments?.some(a => isImage(a.mime_type)) ? "mt-2" : ""
          }`}>
            <div className={`flex items-center gap-1 text-xs ${
              isOutbound ? "text-purple-200" : "text-zinc-500 dark:text-zinc-400"
            }`}>
              <Mail className="h-3 w-3" />
              <span>Assunto:</span>
            </div>
            <div className={`text-sm font-medium ${
              isOutbound ? "text-white" : "text-zinc-800 dark:text-zinc-200"
            }`}>
              {message.subject}
            </div>
          </div>
        )}

        {displayText && (
          <p className={`whitespace-pre-wrap break-words text-sm ${
            message.channel === "email" && message.subject ? "mt-2 border-t border-dashed pt-2 " + (isOutbound ? "border-purple-400/30" : "border-zinc-300 dark:border-zinc-600") :
            message.attachments?.some(a => isImage(a.mime_type)) ? "mt-2" : ""
          }`}>
            {renderTextWithLinks(displayText)}
          </p>
        )}
        {translation && (
          <span className="mt-1 block text-xs opacity-60">
            Traduzido de {translation.source_lang || "?"}
          </span>
        )}

        {/* Outros arquivos (não-imagens e não-áudios) */}
        {message.attachments && message.attachments.filter(att => !isImage(att.mime_type) && !isAudio(att.mime_type)).length > 0 && (
          <div className="mt-2 space-y-2">
            {message.attachments.filter(att => !isImage(att.mime_type) && !isAudio(att.mime_type)).map((att) => (
              <button
                key={att.id}
                onClick={() => onDownload?.(att.id, att.file_name || "arquivo")}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
                  isOutbound
                    ? "bg-purple-700 hover:bg-purple-800"
                    : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-700 dark:hover:bg-zinc-600"
                }`}
              >
                <FileText className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1 truncate">{att.file_name || "Anexo"}</span>
                <Download className="h-3 w-3 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}

        <div
          className={`mt-1 flex items-center justify-end gap-1 text-xs ${
            isOutbound ? "text-purple-200" : "text-zinc-500 dark:text-zinc-400"
          }`}
        >
          {showChannelIndicator && message.channel && (
            <>
              {(() => {
                const ChannelIcon = channelIcons[message.channel as keyof typeof channelIcons]
                const label = channelLabels[message.channel as keyof typeof channelLabels]
                return ChannelIcon ? (
                  <span className="flex items-center gap-0.5" title={label}>
                    <ChannelIcon className="h-3 w-3" />
                  </span>
                ) : null
              })()}
              <span className="mx-0.5">•</span>
            </>
          )}
          <span>{time}</span>
          {isOutbound && (
            // Status da mensagem: sending (spinner) → sent (✓) → read (✓✓) | failed (X vermelho)
            message.sending_status === "sending" ? (
              <Loader2 className="h-5 w-5 animate-spin text-white/70" />
            ) : message.sending_status === "failed" ? (
              <AlertCircle className="h-5 w-5 text-red-400" />
            ) : isRead ? (
              <CheckCheck className="h-5 w-5 text-white/70" />
            ) : (
              <Check className="h-5 w-5 text-white/70" />
            )
          )}
        </div>

        {/* Reações */}
        {(reactions.length > 0 || onReact) && (
          <div className="relative mt-1.5 flex flex-wrap items-center gap-1">
            {/* Reações existentes */}
            {reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => {
                  if (r.userReacted) {
                    onRemoveReaction?.(message.id, r.emoji)
                  } else {
                    onReact?.(message.id, r.emoji)
                  }
                }}
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors ${
                  r.userReacted
                    ? isOutbound
                      ? "bg-white/30 text-white"
                      : "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300"
                    : isOutbound
                      ? "bg-white/10 text-white/80 hover:bg-white/20"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                }`}
                title={r.userReacted ? "Clique para remover" : "Clique para reagir"}
              >
                <span>{r.emoji}</span>
                {r.count > 1 && <span>{r.count}</span>}
              </button>
            ))}

            {/* Botão para adicionar reação */}
            {onReact && (
              <div className="relative">
                <button
                  onClick={() => setShowReactionPicker(!showReactionPicker)}
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-sm transition-colors ${
                    isOutbound
                      ? "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
                      : "bg-zinc-100 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:bg-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-600 dark:hover:text-zinc-300"
                  }`}
                  title="Adicionar reação"
                >
                  +
                </button>

                {/* Picker de reações */}
                {showReactionPicker && (
                  <div
                    ref={reactionPickerRef}
                    className={`absolute z-50 flex gap-1 rounded-full border bg-white px-2 py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 ${
                      isOutbound ? "right-0" : "left-0"
                    } bottom-full mb-1`}
                  >
                    {REACTION_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => {
                          onReact(message.id, emoji)
                          setShowReactionPicker(false)
                        }}
                        className="rounded-full p-1 text-lg transition-transform hover:scale-125 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
          </div>
        </div>

      </div>

      {/* Menu de contexto (right-click) */}
      {showContextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-44 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
          style={{ left: menuPosition.x, top: menuPosition.y }}
        >
          {/* Copiar texto */}
          {message.text && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(message.text || "")
                setShowContextMenu(false)
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700"
            >
              <Copy className="h-4 w-4 text-zinc-500" />
              <span>Copiar texto</span>
            </button>
          )}

          {/* Responder (só Telegram) */}
          {canReply && onReply && (
            <button
              onClick={() => { onReply(message); setShowContextMenu(false) }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700"
            >
              <Reply className="h-4 w-4 text-zinc-500" />
              <span>Responder</span>
            </button>
          )}

          {/* Fixar/Desafixar (todos os canais) */}
          {isPinned ? (
            <button
              onClick={() => { onUnpin?.(message.id); setShowContextMenu(false) }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700"
            >
              <Pin className="h-4 w-4 text-violet-500" />
              <span>Desafixar</span>
            </button>
          ) : (
            <button
              onClick={() => { onPin?.(message.id); setShowContextMenu(false) }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700"
            >
              <Pin className="h-4 w-4 text-zinc-500" />
              <span>Fixar</span>
            </button>
          )}

          {/* Editar (só mensagens outbound com texto) */}
          {isOutbound && message.text && onEdit && (
            <button
              onClick={() => { onEdit(message); setShowContextMenu(false) }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700"
            >
              <Pencil className="h-4 w-4 text-zinc-500" />
              <span>Editar</span>
            </button>
          )}

          {/* Deletar (só mensagens outbound) */}
          {isOutbound && onDelete && (
            <button
              onClick={() => { onDelete(message.id); setShowContextMenu(false) }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              <Trash2 className="h-4 w-4" />
              <span>Deletar</span>
            </button>
          )}
        </div>
      )}
    </>
  )
}
