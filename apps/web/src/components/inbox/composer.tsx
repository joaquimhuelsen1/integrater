"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Send, Paperclip, X, FileText, ChevronDown, Mic, Square, Play, Pause, Image as ImageIcon, FileAudio, File as FileIcon, Languages, Loader2 } from "lucide-react"

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

interface ComposerProps {
  onSend: (text: string, attachments?: File[]) => void
  disabled?: boolean
  templates?: Template[]
  initialText?: string
  onTextChange?: (text: string) => void
  externalFiles?: File[]
  onExternalFilesProcessed?: () => void
  apiUrl?: string
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

export function Composer({ onSend, disabled, templates = [], initialText = "", onTextChange, externalFiles = [], onExternalFilesProcessed, apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000" }: ComposerProps) {
  const [text, setText] = useState(initialText)
  const [attachments, setAttachments] = useState<AttachmentPreview[]>([])
  const [showTemplates, setShowTemplates] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isPlayingPreview, setIsPlayingPreview] = useState(false)
  const [isTranslating, setIsTranslating] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null)

  // Sync with external initialText and resize
  useEffect(() => {
    if (initialText !== text) {
      setText(initialText)
      // Resize textarea after state update
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

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }, [text, attachments, disabled, onSend, updateText])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const newAttachments: AttachmentPreview[] = []
    for (const file of Array.from(files)) {
      const preview = isImageFile(file)
        ? URL.createObjectURL(file)
        : undefined
      newAttachments.push({ file, preview })
    }
    setAttachments(prev => [...prev, ...newAttachments])
    e.target.value = "" // Reset input
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

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    if (!showTemplates) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest("[data-templates-dropdown]")) {
        setShowTemplates(false)
      }
    }

    document.addEventListener("click", handleClickOutside)
    return () => document.removeEventListener("click", handleClickOutside)
  }, [showTemplates])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // Auto-resize textarea up to 8 lines (~168px), then scroll
  const resizeTextarea = useCallback((textarea: HTMLTextAreaElement) => {
    textarea.style.height = "auto"
    const maxHeight = 168 // 8 lines × ~21px per line
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
  }, [])

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateText(e.target.value)
    resizeTextarea(e.target)
  }

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

  // Traduzir rascunho PT→EN
  const translateDraft = useCallback(async () => {
    if (!text.trim() || isTranslating) return

    setIsTranslating(true)
    try {
      const response = await fetch(`${apiUrl}/translate/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), target_lang: "en" }),
      })

      if (response.ok) {
        const data = await response.json()
        updateText(data.translated_text)
        // Resize textarea
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.style.height = "auto"
            const maxHeight = 168
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, maxHeight)}px`
          }
        }, 0)
      }
    } catch (error) {
      console.error("Erro ao traduzir:", error)
    } finally {
      setIsTranslating(false)
    }
  }, [text, isTranslating, apiUrl, updateText])

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

  return (
    <div className="flex-shrink-0 border-t border-zinc-200 p-4 dark:border-zinc-800">
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
              <div
                key={idx}
                className={`relative flex items-center gap-2 rounded-lg px-3 py-2 ${getBgColor()}`}
              >
                {att.preview ? (
                  <img
                    src={att.preview}
                    alt={att.file.name}
                    className="h-10 w-10 rounded object-cover"
                  />
                ) : (
                  getIcon()
                )}
                <div className="flex flex-col">
                  <span className="max-w-32 truncate text-sm">{att.file.name}</span>
                  <span className="text-xs text-zinc-500">
                    {(att.file.size / 1024).toFixed(0)} KB
                  </span>
                </div>
                <button
                  onClick={() => removeAttachment(idx)}
                  className="rounded-full p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                >
                  <X className="h-4 w-4 text-zinc-500" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Attach button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          title="Anexar arquivo"
        >
          <Paperclip className="h-5 w-5" />
        </button>

        {/* Templates dropdown */}
        {templates.length > 0 && (
          <div className="relative" data-templates-dropdown>
            <button
              type="button"
              onClick={() => setShowTemplates(!showTemplates)}
              className="flex h-10 items-center gap-1 rounded-lg px-3 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              title="Templates"
            >
              <FileText className="h-4 w-4" />
              <ChevronDown className="h-3 w-3" />
            </button>
            {showTemplates && (
              <div className="absolute bottom-12 left-0 z-10 w-64 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                {templates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => insertTemplate(t)}
                    className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  >
                    <span className="text-sm font-medium">{t.title}</span>
                    {t.shortcut && (
                      <span className="text-xs text-zinc-500">/{t.shortcut}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recording UI */}
        {isRecording ? (
          <div className="flex flex-1 items-center gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-2 dark:border-red-700 dark:bg-red-900/20">
            <div className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
            <span className="text-sm text-red-600 dark:text-red-400">
              Gravando... {formatTime(recordingTime)}
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={stopRecording}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
              title="Parar gravação"
            >
              <Square className="h-4 w-4" />
            </button>
          </div>
        ) : audioUrl ? (
          <div className="flex flex-1 items-center gap-3 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 dark:border-blue-700 dark:bg-blue-900/20">
            <button
              type="button"
              onClick={togglePreviewPlayback}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-white hover:bg-blue-600"
              title={isPlayingPreview ? "Pausar" : "Reproduzir"}
            >
              {isPlayingPreview ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
            </button>
            <div className="flex flex-1 items-center gap-2">
              <Mic className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-blue-600 dark:text-blue-400">
                Áudio gravado ({formatTime(recordingTime)})
              </span>
            </div>
            <audio
              ref={audioPreviewRef}
              src={audioUrl}
              onEnded={() => setIsPlayingPreview(false)}
              className="hidden"
            />
            <button
              type="button"
              onClick={cancelRecording}
              className="flex h-8 w-8 items-center justify-center rounded-full text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30"
              title="Descartar"
            >
              <X className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={sendAudio}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white hover:bg-blue-600"
              title="Enviar áudio"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Digite sua mensagem..."
              rows={1}
              disabled={disabled}
              className="flex-1 resize-none overflow-y-auto rounded-lg border border-zinc-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800"
            />

            {/* Mic button - only show when no text */}
            {!text.trim() && attachments.length === 0 && (
              <button
                type="button"
                onClick={startRecording}
                disabled={disabled}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
                title="Gravar áudio"
              >
                <Mic className="h-5 w-5" />
              </button>
            )}

            {/* Translate button - only show when there's text */}
            {text.trim() && (
              <button
                type="button"
                onClick={translateDraft}
                disabled={isTranslating || disabled}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-purple-500 hover:bg-purple-100 disabled:opacity-50 dark:hover:bg-purple-900/30"
                title="Traduzir para inglês (Gemini Pro)"
              >
                {isTranslating ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Languages className="h-5 w-5" />
                )}
              </button>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={(!text.trim() && attachments.length === 0) || disabled}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              title="Enviar"
            >
              <Send className="h-5 w-5" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
