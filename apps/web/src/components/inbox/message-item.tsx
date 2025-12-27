"use client"

import { useState, useEffect } from "react"
import { Check, Download, FileText, Image as ImageIcon, X, ZoomIn, ZoomOut, Mic, Play, Pause, FileAudio, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase"
import type { Message, Translation } from "./chat-view"

interface MessageItemProps {
  message: Message
  onDownload?: (attachmentId: string, filename: string) => void
  translation?: Translation
  apiUrl?: string
  onTranscriptionComplete?: (messageId: string, transcription: string) => void
}

export function MessageItem({
  message,
  onDownload,
  translation,
  apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  onTranscriptionComplete,
}: MessageItemProps) {
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({})
  const [playingAudio, setPlayingAudio] = useState<string | null>(null)
  const [audioProgress, setAudioProgress] = useState<Record<string, number>>({})
  const [expandedImage, setExpandedImage] = useState<string | null>(null)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [transcriptions, setTranscriptions] = useState<Record<string, string>>({})
  const [transcribing, setTranscribing] = useState<Record<string, boolean>>({})
  const supabase = createClient()

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
      }
    }
    window.addEventListener("keydown", handleEsc)
    return () => window.removeEventListener("keydown", handleEsc)
  }, [])

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
  const toggleAudio = (attId: string, url: string) => {
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
  }

  const handleAudioEnded = (attId: string) => {
    setPlayingAudio(null)
    setAudioProgress(prev => ({ ...prev, [attId]: 0 }))
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
          className={`max-w-[70%] rounded-lg px-4 py-2 ${
            isOutbound
              ? "bg-blue-500 text-white"
              : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
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

          {/* Áudios */}
          {message.attachments && message.attachments.filter(att => isAudio(att.mime_type)).length > 0 && (
            <div className="space-y-2">
              {message.attachments.filter(att => isAudio(att.mime_type)).map((att) => (
                <div key={att.id} className="space-y-1">
                  <div
                    className={`flex items-center gap-3 rounded-lg p-2 ${
                      isOutbound
                        ? "bg-blue-600"
                        : "bg-zinc-200 dark:bg-zinc-700"
                    }`}
                  >
                    <button
                      onClick={() => { const url = audioUrls[att.id]; if (url) toggleAudio(att.id, url); }}
                      className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${
                        isOutbound
                          ? "bg-white/20 hover:bg-white/30"
                          : "bg-zinc-300 hover:bg-zinc-400 dark:bg-zinc-600 dark:hover:bg-zinc-500"
                      }`}
                    >
                      {playingAudio === att.id ? (
                        <Pause className="h-5 w-5" />
                      ) : (
                        <Play className="ml-0.5 h-5 w-5" />
                      )}
                    </button>
                    <div className="flex-1">
                      <div className="relative h-1 w-full overflow-hidden rounded-full bg-black/20">
                        <div
                          className={`absolute left-0 top-0 h-full rounded-full transition-all ${
                            isOutbound ? "bg-white" : "bg-blue-500"
                          }`}
                          style={{ width: `${audioProgress[att.id] || 0}%` }}
                        />
                      </div>
                      <div className="mt-1 flex items-center gap-1">
                        <Mic className="h-3 w-3 opacity-60" />
                        <span className="text-xs opacity-60">Áudio</span>
                      </div>
                    </div>
                    {/* Botão Transcrever */}
                    {!transcriptions[att.id] && (
                      <button
                        onClick={() => transcribeAudio(att.id)}
                        disabled={transcribing[att.id]}
                        className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
                          isOutbound
                            ? "bg-white/20 hover:bg-white/30 disabled:opacity-50"
                            : "bg-zinc-300 hover:bg-zinc-400 dark:bg-zinc-600 dark:hover:bg-zinc-500 disabled:opacity-50"
                        }`}
                        title="Transcrever áudio"
                      >
                        {transcribing[att.id] ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <FileAudio className="h-3 w-3" />
                        )}
                        <span>{transcribing[att.id] ? "..." : "Transcrever"}</span>
                      </button>
                    )}
                    {audioUrls[att.id] && (
                      <audio
                        id={`audio-${att.id}`}
                        src={audioUrls[att.id]}
                        onTimeUpdate={(e) => handleAudioTimeUpdate(att.id, e)}
                        onEnded={() => handleAudioEnded(att.id)}
                        preload="metadata"
                      />
                    )}
                  </div>
                  {/* Transcrição */}
                  {transcriptions[att.id] && (
                    <div
                      className={`rounded px-2 py-1 text-xs italic ${
                        isOutbound
                          ? "bg-blue-600/50 text-blue-100"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      <span className="font-medium">Transcrição:</span> {transcriptions[att.id]}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

        {displayText && (
          <p className={`whitespace-pre-wrap break-words text-sm ${message.attachments?.some(a => isImage(a.mime_type)) ? "mt-2" : ""}`}>
            {displayText}
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
                    ? "bg-blue-600 hover:bg-blue-700"
                    : "bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600"
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
            isOutbound ? "text-blue-100" : "text-zinc-500"
          }`}
        >
          <span>{time}</span>
          {isOutbound && (
            <Check className="h-3 w-3" />
          )}
        </div>
      </div>
    </div>
    </>
  )
}
