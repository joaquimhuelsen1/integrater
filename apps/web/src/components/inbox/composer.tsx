"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Send, Paperclip, X, FileText, Mic, Square, Play, Pause, Image as ImageIcon, FileAudio, File as FileIcon, Smile, Reply } from "lucide-react"

interface AttachmentPreview {
  file: File
  preview?: string
}

interface Template {
  id: string
  title: string
  body: string
  shortcut: string | null
}

// Canal disponível para envio
interface AvailableChannel {
  type: string
  label: string
}

// Mensagem para reply
interface ReplyToMessage {
  id: string
  direction: "inbound" | "outbound"
  text: string | null
  senderName?: string
  attachments?: { id: string; file_name: string; mime_type: string; storage_path: string; storage_bucket?: string }[]
}

interface ComposerProps {
  onSend: (text: string, attachments?: File[]) => void
  disabled?: boolean
  templates?: Template[]
  initialText?: string
  onTextChange?: (text: string) => void
  externalFiles?: File[]
  onExternalFilesProcessed?: () => void
  apiUrl?: string
  // Props para seletor de canal
  availableChannels?: AvailableChannel[]
  selectedChannel?: string | null
  onChannelChange?: (channel: string) => void
  // Props para reply
  replyTo?: ReplyToMessage | null
  onCancelReply?: () => void
}

// Detecta tipo de arquivo pela extensão quando file.type está vazio
function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true
  const ext = file.name.split(".").pop()?.toLowerCase()
  return ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp", "svg"].includes(ext || "")
}

function isAudioFile(file: File): boolean {
  if (file.type.startsWith("audio/")) return true
  const ext = file.name.split(".").pop()?.toLowerCase()
  return ["mp3", "wav", "ogg", "opus", "m4a", "aac", "webm", "flac"].includes(ext || "")
}

function isPdfFile(file: File): boolean {
  if (file.type === "application/pdf") return true
  const ext = file.name.split(".").pop()?.toLowerCase()
  return ext === "pdf"
}

// Emojis populares organizados por categoria
const EMOJI_CATEGORIES = [
  { name: "Frequentes", emojis: ["😊", "😂", "❤️", "👍", "🔥", "✨", "🎉", "💯", "🙏", "😍", "🥰", "😘", "🤔", "👀", "💪", "🤝"] },
  { name: "Rostos", emojis: ["😀", "😃", "😄", "😁", "😅", "🤣", "😇", "🙂", "😉", "😌", "😎", "🥳", "😏", "😒", "😔", "😢"] },
  { name: "Gestos", emojis: ["👋", "🤚", "✋", "🖐️", "👌", "🤌", "✌️", "🤞", "🫰", "🤙", "👈", "👉", "👆", "👇", "☝️", "👏"] },
  { name: "Objetos", emojis: ["💼", "📱", "💻", "📧", "📞", "💰", "💵", "📝", "✅", "❌", "⭐", "🌟", "💡", "🎯", "🚀", "⏰"] },
]

export function Composer({ onSend, disabled, templates = [], initialText = "", onTextChange, externalFiles = [], onExternalFilesProcessed, replyTo, onCancelReply }: ComposerProps) {
  const [text, setText] = useState(initialText)
  const [attachments, setAttachments] = useState<AttachmentPreview[]>([])
  const [showTemplates, setShowTemplates] = useState(false)
  const [showEmojis, setShowEmojis] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isPlayingPreview, setIsPlayingPreview] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)

  // Sync with external initialText and resize
  useEffect(() => {
    if (initialText !== text) {
      setText(initialText)
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto"
          const maxHeight = 168
          textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, maxHeight)}px`
        }
      }, 0)
    }
  }, [initialText])

  // Process external files (from drag and drop)
  useEffect(() => {
    if (externalFiles.length > 0) {
      const newAttachments: AttachmentPreview[] = externalFiles.map(file => ({
        file,
        preview: isImageFile(file) ? URL.createObjectURL(file) : undefined,
      }))
      setAttachments(prev => [...prev, ...newAttachments])
      onExternalFilesProcessed?.()
    }
  }, [externalFiles, onExternalFilesProcessed])

  // Notify parent on text change
  const updateText = useCallback((newText: string) => {
    setText(newText)
    onTextChange?.(newText)
  }, [onTextChange])

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim()
    if ((!trimmed && attachments.length === 0) || disabled) return

    onSend(trimmed, attachments.map(a => a.file))
    updateText("")
    setAttachments([])

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }, [text, attachments, disabled, onSend, updateText])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const newAttachments: AttachmentPreview[] = []
    for (const file of Array.from(files)) {
      const preview = isImageFile(file) ? URL.createObjectURL(file) : undefined
      newAttachments.push({ file, preview })
    }
    setAttachments(prev => [...prev, ...newAttachments])
    e.target.value = ""
  }, [])

  const removeAttachment = useCallback((index: number) => {
    setAttachments(prev => {
      const att = prev[index]
      if (att?.preview) URL.revokeObjectURL(att.preview)
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  const insertTemplate = useCallback((template: Template) => {
    const newText = text + template.body
    updateText(newText)
    setShowTemplates(false)
    textareaRef.current?.focus()
  }, [text, updateText])

  const insertEmoji = useCallback((emoji: string) => {
    const newText = text + emoji
    updateText(newText)
    textareaRef.current?.focus()
  }, [text, updateText])

  // Fechar dropdowns ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest("[data-templates-dropdown]")) {
        setShowTemplates(false)
      }
      if (!target.closest("[data-emoji-picker]")) {
        setShowEmojis(false)
      }
    }

    document.addEventListener("click", handleClickOutside)
    return () => document.removeEventListener("click", handleClickOutside)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Comandos rápidos com /
    if (e.key === "/" && text === "" && templates.length > 0) {
      e.preventDefault()
      setShowTemplates(true)
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === "Escape") {
      setShowTemplates(false)
      setShowEmojis(false)
    }
  }

  // Auto-resize textarea
  const resizeTextarea = useCallback((textarea: HTMLTextAreaElement) => {
    textarea.style.height = "auto"
    const maxHeight = 168
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
  }, [])

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    updateText(value)
    resizeTextarea(e.target)

    // Detectar comando rápido
    if (value.startsWith("/") && templates.length > 0) {
      setShowTemplates(true)
    } else {
      setShowTemplates(false)
    }
  }

  // Filtrar templates pelo comando digitado
  const filteredTemplates = text.startsWith("/")
    ? templates.filter(t =>
        t.shortcut?.toLowerCase().includes(text.slice(1).toLowerCase()) ||
        t.title.toLowerCase().includes(text.slice(1).toLowerCase())
      )
    : templates

  // Audio recording functions
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" })
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
    } catch (err) {
      console.error("Erro ao acessar microfone:", err)
      alert("Não foi possível acessar o microfone. Verifique as permissões.")
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current)
        recordingIntervalRef.current = null
      }
    }
  }, [isRecording])

  const cancelRecording = useCallback(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
    }
    setAudioBlob(null)
    setAudioUrl(null)
    setRecordingTime(0)
    setIsPlayingPreview(false)
  }, [audioUrl])

  const sendAudio = useCallback(() => {
    if (audioBlob) {
      const fileName = `audio_${Date.now()}.webm`
      const audioFile = new File([audioBlob], fileName, { type: "audio/webm" })
      onSend("", [audioFile])
      cancelRecording()
    }
  }, [audioBlob, onSend, cancelRecording])

  const togglePreviewPlayback = useCallback(() => {
    if (!audioPreviewRef.current) return

    if (isPlayingPreview) {
      audioPreviewRef.current.pause()
      setIsPlayingPreview(false)
    } else {
      audioPreviewRef.current.play()
      setIsPlayingPreview(true)
    }
  }, [isPlayingPreview])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current)
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
      }
    }
  }, [audioUrl])

  const hasContent = text.trim() || attachments.length > 0

  return (
    <div className="flex-shrink-0 px-4 pb-4 pt-2 md:px-12 lg:px-20">
      <div className="mx-auto max-w-3xl">

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {attachments.map((att, idx) => {
            const isPdf = isPdfFile(att.file)
            const isAudio = isAudioFile(att.file)
            const isImage = isImageFile(att.file)

            const getIcon = () => {
              if (isPdf) return <FileText className="h-5 w-5 text-red-500" />
              if (isAudio) return <FileAudio className="h-5 w-5 text-purple-500" />
              if (isImage && !att.preview) return <ImageIcon className="h-5 w-5 text-blue-500" />
              return <FileIcon className="h-5 w-5 text-zinc-500" />
            }

            const getBgColor = () => {
              if (isPdf) return "bg-red-50 dark:bg-red-900/20"
              if (isAudio) return "bg-purple-50 dark:bg-purple-900/20"
              if (isImage) return "bg-blue-50 dark:bg-blue-900/20"
              return "bg-zinc-100 dark:bg-zinc-800"
            }

            return (
              <div key={idx} className={`relative flex items-center gap-2 rounded-lg px-3 py-2 ${getBgColor()}`}>
                {att.preview ? (
                  <img src={att.preview} alt={att.file.name} className="h-10 w-10 rounded object-cover" />
                ) : (
                  getIcon()
                )}
                <div className="flex flex-col">
                  <span className="max-w-32 truncate text-sm">{att.file.name}</span>
                  <span className="text-xs text-zinc-500">{(att.file.size / 1024).toFixed(0)} KB</span>
                </div>
                <button onClick={() => removeAttachment(idx)} className="rounded-full p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700">
                  <X className="h-4 w-4 text-zinc-500" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" />

      {/* Recording UI */}
      {isRecording ? (
        <div className="flex items-center gap-3 rounded-full border border-red-300 bg-red-50 px-4 py-2 dark:border-red-700 dark:bg-red-900/20">
          <div className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
          <span className="text-sm text-red-600 dark:text-red-400">Gravando... {formatTime(recordingTime)}</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={stopRecording}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
            title="Parar gravação"
          >
            <Square className="h-4 w-4" />
          </button>
        </div>
      ) : audioUrl ? (
        <div className="flex items-center gap-3 rounded-full border border-blue-300 bg-blue-50 px-4 py-2 dark:border-blue-700 dark:bg-blue-900/20">
          <button
            type="button"
            onClick={togglePreviewPlayback}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-white hover:bg-blue-600"
          >
            {isPlayingPreview ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
          </button>
          <div className="flex flex-1 items-center gap-2">
            <Mic className="h-4 w-4 text-blue-500" />
            <span className="text-sm text-blue-600 dark:text-blue-400">Áudio ({formatTime(recordingTime)})</span>
          </div>
          <audio ref={audioPreviewRef} src={audioUrl} onEnded={() => setIsPlayingPreview(false)} className="hidden" />
          <button onClick={cancelRecording} className="rounded-full p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30">
            <X className="h-5 w-5" />
          </button>
          <button onClick={sendAudio} className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-500 text-white hover:bg-violet-600">
            <Send className="h-5 w-5" />
          </button>
        </div>
      ) : (
        /* Main composer - Telegram style */
        <div className="flex items-end gap-3">
          {/* Input container with emoji and attach inside */}
          <div className={`relative flex flex-1 flex-col overflow-hidden border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-[#212121] ${replyTo ? "rounded-2xl" : "rounded-full"}`}>
            {/* Reply preview - dentro do input, estilo Telegram */}
            {replyTo && (() => {
              // Verifica se tem foto no reply
              const photoAttachment = replyTo.attachments?.find(a => a.mime_type?.startsWith("image/"))
              const hasPhoto = !!photoAttachment
              const photoUrl = hasPhoto && photoAttachment.storage_path
                ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${photoAttachment.storage_bucket || "attachments"}/${photoAttachment.storage_path}`
                : null

              return (
                <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
                  <Reply className="h-4 w-4 flex-shrink-0 text-blue-500" />
                  {/* Thumbnail da foto */}
                  {photoUrl && (
                    <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded">
                      <img src={photoUrl} alt="Foto" className="h-full w-full object-cover" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-blue-500">
                      Reply to {replyTo.senderName || (replyTo.direction === "outbound" ? "Você" : "Contato")}
                    </div>
                    <div className="truncate text-sm text-zinc-500 dark:text-zinc-400">
                      {hasPhoto ? "Foto" : (replyTo.text?.slice(0, 60) || "Anexo")}
                    </div>
                  </div>
                  <button
                    onClick={onCancelReply}
                    className="flex-shrink-0 rounded-full p-1 text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )
            })()}
            {/* Input row */}
            <div className="flex items-end">
            {/* Emoji picker */}
            <div className="relative" data-emoji-picker>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowEmojis(!showEmojis) }}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
                title="Emojis"
              >
                <Smile className="h-6 w-6" />
              </button>
              {showEmojis && (
                <div
                  ref={emojiPickerRef}
                  className="absolute bottom-12 left-0 z-50 w-72 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
                >
                  {EMOJI_CATEGORIES.map((category, idx) => (
                    <div key={idx} className="mb-2">
                      <div className="mb-1 text-xs font-medium text-zinc-500">{category.name}</div>
                      <div className="flex flex-wrap gap-1">
                        {category.emojis.map((emoji, i) => (
                          <button
                            key={i}
                            onClick={() => insertEmoji(emoji)}
                            className="flex h-8 w-8 items-center justify-center rounded hover:bg-zinc-100 dark:hover:bg-zinc-700"
                          >
                            <span className="text-xl">{emoji}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Message"
              rows={1}
              disabled={disabled}
              className="flex-1 resize-none bg-transparent py-2.5 pr-2 text-sm focus:outline-none disabled:opacity-50"
            />

            {/* Templates dropdown - comandos rápidos */}
            {showTemplates && filteredTemplates.length > 0 && (
              <div
                data-templates-dropdown
                className="absolute bottom-12 left-0 z-50 w-64 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
              >
                <div className="px-3 py-1 text-xs font-medium text-zinc-500">Comandos rápidos</div>
                {filteredTemplates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => {
                      updateText("")
                      insertTemplate(t)
                    }}
                    className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  >
                    <span className="text-sm font-medium">{t.title}</span>
                    {t.shortcut && <span className="text-xs text-zinc-500">/{t.shortcut}</span>}
                  </button>
                ))}
              </div>
            )}

            {/* Attach button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
              title="Anexar arquivo"
            >
              <Paperclip className="h-6 w-6" />
            </button>
            </div>
          </div>

          {/* Mic / Send button */}
          {hasContent ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={disabled}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-50"
              title="Enviar"
            >
              <Send className="h-5 w-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              disabled={disabled}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-50"
              title="Gravar áudio"
            >
              <Mic className="h-5 w-5" />
            </button>
          )}
        </div>
      )}
      </div>
    </div>
  )
}
