"use client"

import { useRef, useEffect, useState, useCallback, useMemo } from "react"
import { Languages, Loader2, Sparkles, FileText, X, Check, Pencil, Upload, MailOpen, Mail, RefreshCw, MoreVertical, Unlink, MessageSquare, Phone, Briefcase } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { MessageItem } from "./message-item"
import { DateDivider } from "./date-divider"
import { ServiceMessage } from "./service-message"
import { Composer } from "./composer"
import { PinnedBar } from "./pinned-bar"
import { TagManager } from "./tag-manager"
import { ContactManager } from "./contact-manager"
import { groupMessagesByDate } from "@/lib/group-messages-by-date"
import type { Tag } from "./conversation-list"

// Formata "última vez visto" de forma amigável
function formatLastSeen(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return "agora"
  if (diffMin < 60) return `há ${diffMin} min`
  if (diffHours < 24) return `há ${diffHours}h`
  if (diffDays === 1) return "ontem"
  if (diffDays < 7) return `há ${diffDays} dias`
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

export interface Message {
  id: string
  conversation_id: string
  direction: "inbound" | "outbound"
  text: string | null
  subject: string | null  // Assunto do email
  channel: "telegram" | "email" | "openphone_sms"
  sent_at: string
  edited_at?: string | null  // Quando foi editada
  deleted_at?: string | null // Quando foi deletada (soft delete)
  message_type?: string // text, service_join, service_leave, service_kick, service_add
  attachments?: { id: string; file_name: string; mime_type: string; storage_path: string; storage_bucket?: string }[]
  reply_to_message_id?: string | null
  is_pinned?: boolean
  raw_payload?: {
    action_user_id?: number
    action_user_name?: string
    action_user_ids?: number[]
  }
}

export interface Translation {
  message_id: string
  translated_text: string
  source_lang: string | null
}

export interface Template {
  id: string
  title: string
  body: string
  shortcut: string | null
}

export interface AISuggestion {
  id: string
  content: string
}

// Canal disponível para envio
interface AvailableChannel {
  type: string
  label: string
}

interface ChatViewProps {
  conversationId: string | null
  messages: Message[]
  displayName: string | null
  avatarUrl?: string | null
  onSendMessage: (text: string, attachments?: File[]) => void
  onDownloadAttachment?: (attachmentId: string, filename: string) => void
  templates?: Template[]
  tags?: Tag[]
  onTagsChange?: () => void
  isLoading?: boolean
  apiUrl?: string
  draft?: string
  onDraftChange?: (text: string) => void
  suggestion?: AISuggestion | null
  onSuggestionChange?: (suggestion: AISuggestion | null) => void
  summary?: string | null
  onSummaryChange?: (summary: string | null) => void
  contactId?: string | null
  identityId?: string | null
  identityValue?: string | null
  onContactLinked?: () => void
  unreadCount?: number
  onMarkAsRead?: () => void
  onMarkAsUnread?: () => void
  onSyncHistory?: () => Promise<void>
  // Props para timeline unificada
  showChannelIndicator?: boolean
  availableChannels?: AvailableChannel[]
  selectedSendChannel?: string | null
  onSendChannelChange?: (channel: string) => void
  // Desvincular contato
  onUnlinkContact?: () => void
  // Callbacks para mensagens de serviço (join/leave)
  onOpenUserChat?: (telegramUserId: number, userName: string) => void
  onSendWelcome?: (telegramUserId: number, userName: string) => Promise<boolean>
  // Template de boas-vindas para novos membros
  welcomeTemplate?: string
  // Workspace para vincular contatos
  workspaceId?: string
  // Canal da conversa para mostrar ícone no header
  channel?: "telegram" | "email" | "openphone_sms" | null
  // Abrir painel CRM
  onOpenCRMPanel?: () => void
  // Callback para atualizar mensagem localmente (edit)
  onMessageUpdate?: (messageId: string, updates: Partial<Message>) => void
  // Callback para remover mensagem localmente (delete)
  onMessageDelete?: (messageId: string) => void
}

export function ChatView({
  conversationId,
  messages,
  displayName,
  avatarUrl,
  onSendMessage,
  onDownloadAttachment,
  templates = [],
  tags = [],
  onTagsChange,
  isLoading,
  apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  draft = "",
  onDraftChange,
  suggestion = null,
  onSuggestionChange,
  summary = null,
  onSummaryChange,
  contactId = null,
  identityId = null,
  identityValue = null,
  onContactLinked,
  unreadCount = 0,
  onMarkAsRead,
  onMarkAsUnread,
  onSyncHistory,
  showChannelIndicator = false,
  availableChannels = [],
  selectedSendChannel = null,
  onSendChannelChange,
  onUnlinkContact,
  onOpenUserChat,
  onSendWelcome,
  welcomeTemplate,
  workspaceId,
  channel = null,
  onOpenCRMPanel,
  onMessageUpdate,
  onMessageDelete,
}: ChatViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [showTranslation, setShowTranslation] = useState(false)
  const [translations, setTranslations] = useState<Record<string, Translation>>({})
  const [isTranslating, setIsTranslating] = useState(false)

  // IA States (loading only - suggestion/summary from props)
  const [isSuggesting, setIsSuggesting] = useState(false)
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showAvatarModal, setShowAvatarModal] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Reply/Pin states
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null)

  // Edit/Delete states
  const [editingMessage, setEditingMessage] = useState<Message | null>(null)
  const [editText, setEditText] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  // Fecha menu ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const dragCounterRef = useRef(0)

  // Track messages being translated to avoid duplicates
  const translatingRef = useRef<Set<string>>(new Set())

  // Read receipts - IDs de mensagens que foram lidas
  const [readMessageIds, setReadMessageIds] = useState<Set<string>>(new Set())

  // Presence status - typing e online
  const [isTyping, setIsTyping] = useState(false)
  const [isOnline, setIsOnline] = useState(false)
  const [lastSeen, setLastSeen] = useState<string | null>(null)

  // Busca eventos de leitura para mensagens outbound
  useEffect(() => {
    const fetchReadEvents = async () => {
      const outboundMsgIds = messages
        .filter(m => m.direction === "outbound")
        .map(m => m.id)

      if (outboundMsgIds.length === 0) {
        setReadMessageIds(new Set())
        return
      }

      const supabase = createClient()
      const { data } = await supabase
        .from("message_events")
        .select("message_id")
        .in("message_id", outboundMsgIds)
        .eq("type", "read")

      if (data) {
        setReadMessageIds(new Set(data.map(e => e.message_id)))
      }
    }

    fetchReadEvents()
  }, [messages])

  // Polling para presence status (typing/online) - 1 segundo
  useEffect(() => {
    if (!conversationId && !identityId) {
      setIsTyping(false)
      setIsOnline(false)
      setLastSeen(null)
      return
    }

    const supabase = createClient()

    const fetchPresence = async () => {
      try {
        // Busca por conversation_id OU contact_identity_id
        let query = supabase
          .from("presence_status")
          .select("is_typing, is_online, last_seen_at, typing_expires_at")

        if (conversationId) {
          query = query.eq("conversation_id", conversationId)
        } else if (identityId) {
          query = query.eq("contact_identity_id", identityId)
        }

        const { data } = await query.maybeSingle()

        if (data) {
          // Verifica se typing expirou (5 segundos)
          const typingExpired = data.typing_expires_at
            ? new Date(data.typing_expires_at) < new Date()
            : true

          setIsTyping(data.is_typing && !typingExpired)
          setIsOnline(data.is_online || false)
          setLastSeen(data.last_seen_at)
        } else {
          setIsTyping(false)
          setIsOnline(false)
          setLastSeen(null)
        }
      } catch (err) {
        // Ignora erros silenciosamente
      }
    }

    // Busca inicial
    fetchPresence()

    // Polling a cada 1 segundo
    const interval = setInterval(fetchPresence, 1000)

    return () => {
      clearInterval(interval)
    }
  }, [conversationId, identityId])

  // Agrupa mensagens por data para exibir divisores
  const groupedMessages = useMemo(
    () => groupMessagesByDate(messages),
    [messages]
  )

  // Mapa de mensagens por ID para lookup de replies
  const messagesById = useMemo(() => {
    const map: Record<string, Message> = {}
    for (const msg of messages) {
      map[msg.id] = msg
    }
    return map
  }, [messages])

  // Filtra mensagens fixadas
  const pinnedMessages = useMemo(() =>
    messages.filter(m => m.is_pinned),
    [messages]
  )

  // Navega até uma mensagem específica
  const scrollToMessage = useCallback((messageId: string) => {
    const element = messageRefs.current.get(messageId)
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" })
      // Destaca a mensagem brevemente
      element.classList.add("ring-2", "ring-primary", "ring-offset-2")
      setTimeout(() => {
        element.classList.remove("ring-2", "ring-primary", "ring-offset-2")
      }, 2000)
    }
  }, [])

  // Handlers para reply
  const handleReply = useCallback((message: Message) => {
    setReplyToMessage(message)
  }, [])

  const handleCancelReply = useCallback(() => {
    setReplyToMessage(null)
  }, [])

  // Handlers para pin/unpin (atualiza no banco)
  const handlePin = useCallback(async (messageId: string) => {
    try {
      const resp = await fetch(`${apiUrl}/messages/${messageId}/pin`, { method: "POST" })
      if (resp.ok) {
        // Mensagem pinada - realtime vai atualizar
      }
    } catch (err) {
      console.error("Erro ao fixar mensagem:", err)
    }
  }, [apiUrl])

  const handleUnpin = useCallback(async (messageId: string) => {
    try {
      const resp = await fetch(`${apiUrl}/messages/${messageId}/unpin`, { method: "POST" })
      if (resp.ok) {
        // Mensagem desafixada - realtime vai atualizar
      }
    } catch (err) {
      console.error("Erro ao desafixar mensagem:", err)
    }
  }, [apiUrl])

  // Handlers para edit/delete
  const handleEdit = useCallback((message: Message) => {
    setEditingMessage(message)
    setEditText(message.text || "")
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingMessage(null)
    setEditText("")
  }, [])

  const handleConfirmEdit = useCallback(async () => {
    if (!editingMessage || !editText.trim() || isEditing) return

    setIsEditing(true)
    try {
      const resp = await fetch(`${apiUrl}/messages/${editingMessage.id}?text=${encodeURIComponent(editText.trim())}`, {
        method: "PUT",
      })
      if (resp.ok) {
        // Atualiza mensagem localmente (optimistic update)
        onMessageUpdate?.(editingMessage.id, {
          text: editText.trim(),
          edited_at: new Date().toISOString()
        })
        setEditingMessage(null)
        setEditText("")
      } else {
        console.error("Erro ao editar mensagem")
      }
    } catch (err) {
      console.error("Erro ao editar mensagem:", err)
    } finally {
      setIsEditing(false)
    }
  }, [apiUrl, editingMessage, editText, isEditing, onMessageUpdate])

  const handleDelete = useCallback(async (messageId: string) => {
    if (isDeleting) return

    // Confirmação simples
    if (!window.confirm("Tem certeza que deseja deletar esta mensagem?")) {
      return
    }

    setIsDeleting(true)
    try {
      const resp = await fetch(`${apiUrl}/messages/${messageId}?for_everyone=true`, {
        method: "DELETE",
      })
      if (resp.ok) {
        // Remove mensagem localmente (optimistic update)
        onMessageDelete?.(messageId)
      } else {
        console.error("Erro ao deletar mensagem")
      }
    } catch (err) {
      console.error("Erro ao deletar mensagem:", err)
    } finally {
      setIsDeleting(false)
    }
  }, [apiUrl, isDeleting, onMessageDelete])

  // Scroll para o final das mensagens (sempre instantâneo, sem animação)
  useEffect(() => {
    if (messages.length === 0) return
    messagesEndRef.current?.scrollIntoView({ behavior: "instant" })
  }, [messages])

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    dragCounterRef.current = 0

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      setPendingFiles(files)
    }
  }, [])

  // Clear translation states when conversation changes
  useEffect(() => {
    setTranslations({})
    setShowTranslation(false)
  }, [conversationId])

  // Load cached translations when conversation changes (1 request batch)
  useEffect(() => {
    if (!conversationId || messages.length === 0) return

    const loadCachedTranslations = async () => {
      try {
        const resp = await fetch(
          `${apiUrl}/translate/conversation/${conversationId}/cache?target_lang=pt-BR`
        )
        if (resp.ok) {
          const data = await resp.json()
          const cached: Record<string, Translation> = {}
          for (const t of data.translations || []) {
            cached[t.message_id] = {
              message_id: t.message_id,
              translated_text: t.translated_text,
              source_lang: t.source_lang,
            }
          }
          if (Object.keys(cached).length > 0) {
            setTranslations(cached)
            // Auto-ativar tradução se há traduções em cache
            setShowTranslation(true)
          }
        }
      } catch {
        // Ignora erros
      }
    }

    loadCachedTranslations()
  }, [conversationId, messages.length, apiUrl])

  // Auto-translate new messages when in Portuguese mode (only inbound)
  useEffect(() => {
    if (!conversationId || !showTranslation || messages.length === 0) return

    const translateNewMessages = async () => {
      // Find inbound messages without translations and not being translated
      const untranslated = messages.filter(
        (m) =>
          m.direction === "inbound" &&
          m.text &&
          m.text.length >= 2 &&
          !translations[m.id] &&
          !translatingRef.current.has(m.id)
      )

      if (untranslated.length === 0) return

      // Mark as being translated
      for (const msg of untranslated) {
        translatingRef.current.add(msg.id)
      }

      // Translate each new message
      for (const msg of untranslated) {
        try {
          const resp = await fetch(`${apiUrl}/translate/message/${msg.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target_lang: "pt-BR" }),
          })
          if (resp.ok) {
            const data = await resp.json()
            setTranslations((prev) => ({
              ...prev,
              [msg.id]: {
                message_id: msg.id,
                translated_text: data.translated_text,
                source_lang: data.source_lang,
              },
            }))
          }
        } catch {
          // Ignora erros de tradução individual
        } finally {
          translatingRef.current.delete(msg.id)
        }
      }
    }

    translateNewMessages()
  }, [conversationId, showTranslation, messages, translations, apiUrl])

  const translateConversation = useCallback(async () => {
    if (!conversationId || isTranslating) return

    setIsTranslating(true)
    try {
      // Traduz conversa inteira e recebe todas traduções de volta
      const response = await fetch(`${apiUrl}/translate/conversation/${conversationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_lang: "pt-BR" }),
      })

      if (response.ok) {
        const data = await response.json()
        const newTranslations: Record<string, Translation> = {}

        // Usa traduções retornadas diretamente (sem requests adicionais)
        for (const t of data.translations || []) {
          newTranslations[t.message_id] = {
            message_id: t.message_id,
            translated_text: t.translated_text,
            source_lang: t.source_lang,
          }
        }

        setTranslations(newTranslations)
        setShowTranslation(true)
      }
    } catch (error) {
      console.error("Erro ao traduzir conversa:", error)
    } finally {
      setIsTranslating(false)
    }
  }, [conversationId, apiUrl, isTranslating])

  // Sugestão de resposta (em inglês)
  const suggestReply = useCallback(async () => {
    if (!conversationId || isSuggesting) return

    setIsSuggesting(true)
    onSuggestionChange?.(null)
    try {
      const response = await fetch(`${apiUrl}/ai/conversation/${conversationId}/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      if (response.ok) {
        const data = await response.json()
        onSuggestionChange?.({ id: data.suggestion_id, content: data.content })
      }
    } catch (error) {
      console.error("Erro ao gerar sugestão:", error)
    } finally {
      setIsSuggesting(false)
    }
  }, [conversationId, apiUrl, isSuggesting, onSuggestionChange])

  // Resumo da conversa (em português)
  const summarizeConversation = useCallback(async () => {
    if (!conversationId || isSummarizing) return

    setIsSummarizing(true)
    onSummaryChange?.(null)
    try {
      const response = await fetch(`${apiUrl}/ai/conversation/${conversationId}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      if (response.ok) {
        const data = await response.json()
        onSummaryChange?.(data.content)
      }
    } catch (error) {
      console.error("Erro ao gerar resumo:", error)
    } finally {
      setIsSummarizing(false)
    }
  }, [conversationId, apiUrl, isSummarizing, onSummaryChange])

  // Inserir sugestão no composer
  const useSuggestion = useCallback(() => {
    if (suggestion) {
      onDraftChange?.(suggestion.content)
      // Registrar feedback
      fetch(`${apiUrl}/ai/suggestion/${suggestion.id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accepted" }),
      }).catch(() => {})
      onSuggestionChange?.(null)
    }
  }, [suggestion, apiUrl, onDraftChange, onSuggestionChange])

  // Rejeitar sugestão
  const rejectSuggestion = useCallback(() => {
    if (suggestion) {
      fetch(`${apiUrl}/ai/suggestion/${suggestion.id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rejected" }),
      }).catch(() => {})
      onSuggestionChange?.(null)
    }
  }, [suggestion, apiUrl, onSuggestionChange])

  // Enviar mensagem e limpar draft e reply
  const handleSendMessage = useCallback((text: string, attachments?: File[]) => {
    onSendMessage(text, attachments)
    onDraftChange?.("")
    setReplyToMessage(null) // Limpa reply após enviar
  }, [onSendMessage, onDraftChange])

  // Sincronizar histórico
  const handleSyncHistory = useCallback(async () => {
    if (!onSyncHistory || isSyncing) return
    setIsSyncing(true)
    try {
      await onSyncHistory()
    } finally {
      setIsSyncing(false)
    }
  }, [onSyncHistory, isSyncing])

  if (!conversationId) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        Selecione uma conversa
      </div>
    )
  }

  return (
    <div
      className="relative flex h-full flex-col"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-blue-500/20 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-blue-500 bg-white/90 px-12 py-8 dark:bg-zinc-900/90">
            <Upload className="h-12 w-12 text-blue-500" />
            <span className="text-lg font-medium text-blue-600 dark:text-blue-400">
              Solte arquivos aqui
            </span>
            <span className="text-sm text-zinc-500">
              Imagens, PDFs, documentos...
            </span>
          </div>
        </div>
      )}
      {/* Modal de edição de mensagem */}
      {editingMessage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={handleCancelEdit}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl dark:bg-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2">
              <Pencil className="h-5 w-5 text-zinc-500" />
              <h3 className="font-medium text-zinc-900 dark:text-zinc-100">Editar mensagem</h3>
            </div>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="mb-3 w-full resize-none rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-900 focus:border-violet-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              rows={4}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={handleCancelEdit}
                className="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmEdit}
                disabled={isEditing || !editText.trim()}
                className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {isEditing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal foto de perfil em tela cheia */}
      {showAvatarModal && avatarUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setShowAvatarModal(false)}
        >
          <button
            onClick={() => setShowAvatarModal(false)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
            title="Fechar"
          >
            <X className="h-6 w-6" />
          </button>
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <img
              src={avatarUrl}
              alt={displayName || "Avatar"}
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <p className="mt-4 text-center text-lg font-medium text-white">
              {displayName}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-[#18181B]">
        <div className="flex items-center gap-3">
          {/* Avatar - clicável para ver em tela cheia */}
          {avatarUrl ? (
            <button
              onClick={() => setShowAvatarModal(true)}
              className="relative h-10 w-10 overflow-hidden rounded-full ring-2 ring-transparent transition-all hover:ring-violet-500 cursor-pointer"
              title="Ver foto de perfil"
            >
              <img
                src={avatarUrl}
                alt={displayName || "Avatar"}
                className="h-full w-full object-cover"
              />
            </button>
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-sm font-medium text-white">
              {displayName
                ? displayName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)
                : "?"}
            </div>
          )}
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
                {displayName || "Conversa"}
              </h2>
              {/* Indicador online */}
              {isOnline && (
                <span className="h-2 w-2 rounded-full bg-green-500" title="Online" />
              )}
            </div>
            {/* Typing indicator */}
            {isTyping ? (
              <span className="text-xs text-zinc-500 animate-pulse">
                digitando...
              </span>
            ) : isOnline ? (
              <span className="text-xs text-green-600 dark:text-green-400">
                online
              </span>
            ) : lastSeen ? (
              <span className="text-xs text-zinc-500">
                visto {formatLastSeen(lastSeen)}
              </span>
            ) : null}
          </div>
          {/* Ícone do canal com cor */}
          {channel && (
            <span className="flex items-center justify-center rounded-full p-1">
              {channel === "telegram" && (
                <MessageSquare className="h-4 w-4 text-blue-500" />
              )}
              {channel === "email" && (
                <Mail className="h-4 w-4 text-orange-500" />
              )}
              {channel === "openphone_sms" && (
                <Phone className="h-4 w-4 text-purple-500" />
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle tradução */}
          {Object.keys(translations).length > 0 && (
            <div className="flex items-center rounded-md border border-zinc-200 dark:border-zinc-700">
              <button
                onClick={() => setShowTranslation(false)}
                className={`px-2 py-1 text-xs transition-colors ${
                  !showTranslation
                    ? "bg-zinc-200 dark:bg-zinc-700"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                Original
              </button>
              <button
                onClick={() => setShowTranslation(true)}
                className={`px-2 py-1 text-xs transition-colors ${
                  showTranslation
                    ? "bg-zinc-200 dark:bg-zinc-700"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                Português
              </button>
            </div>
          )}
          {/* Botão traduzir */}
          <button
            onClick={translateConversation}
            disabled={isTranslating}
            className="flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            title="Traduzir conversa"
          >
            {isTranslating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Languages className="h-3.5 w-3.5" />
            )}
            <span>{isTranslating ? "Traduzindo..." : "Traduzir"}</span>
          </button>
          {/* Botão CRM */}
          {onOpenCRMPanel && (
            <button
              onClick={onOpenCRMPanel}
              className="flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              title="Abrir painel CRM"
            >
              <Briefcase className="h-3.5 w-3.5" />
              <span>CRM</span>
            </button>
          )}
          {/* Menu de opções */}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex items-center justify-center rounded-md border border-zinc-200 p-1.5 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              title="Mais opções"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full z-50 mt-1 min-w-48 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                {/* Sugerir */}
                <button
                  onClick={() => { suggestReply(); setShowMenu(false); }}
                  disabled={isSuggesting || messages.length === 0}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  {isSuggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-purple-500" />}
                  {isSuggesting ? "Gerando..." : "Sugerir resposta"}
                </button>
                {/* Resumir */}
                <button
                  onClick={() => { summarizeConversation(); setShowMenu(false); }}
                  disabled={isSummarizing || messages.length === 0}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  {isSummarizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4 text-blue-500" />}
                  {isSummarizing ? "Resumindo..." : "Resumir conversa"}
                </button>
                {/* Separador */}
                <div className="my-1 border-t border-zinc-200 dark:border-zinc-700" />
                {/* Tags */}
                {onTagsChange && (
                  <TagManager
                    conversationId={conversationId}
                    currentTags={tags}
                    onTagsChange={onTagsChange}
                    variant="menu-item"
                  />
                )}
                {/* Desvincular do contato */}
                {contactId && onUnlinkContact && (
                  <button
                    onClick={() => { onUnlinkContact(); setShowMenu(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-orange-600 hover:bg-zinc-100 dark:text-orange-400 dark:hover:bg-zinc-700"
                  >
                    <Unlink className="h-4 w-4" />
                    Desvincular do contato
                  </button>
                )}
                {/* Separador */}
                <div className="my-1 border-t border-zinc-200 dark:border-zinc-700" />
                {/* Marcar lida/não lida */}
                {(onMarkAsRead || onMarkAsUnread) && (
                  <button
                    onClick={() => { unreadCount > 0 ? onMarkAsRead?.() : onMarkAsUnread?.(); setShowMenu(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  >
                    {unreadCount > 0 ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                    {unreadCount > 0 ? "Marcar como lida" : "Marcar como não lida"}
                  </button>
                )}
                {/* Sync histórico */}
                {onSyncHistory && (
                  <button
                    onClick={() => { handleSyncHistory(); setShowMenu(false); }}
                    disabled={isSyncing}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-green-600 hover:bg-zinc-100 disabled:opacity-50 dark:text-green-400 dark:hover:bg-zinc-700"
                  >
                    <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
                    {isSyncing ? "Sincronizando..." : "Sincronizar histórico"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Banner contato não vinculado */}
      {!contactId && identityId && onContactLinked && (
        <ContactManager
          conversationId={conversationId}
          identityId={identityId}
          identityValue={identityValue}
          onContactLinked={onContactLinked}
          apiUrl={apiUrl}
          workspaceId={workspaceId}
        />
      )}

      {/* Sugestão de IA */}
      {suggestion && (
        <div className="mx-4 mt-3 flex-shrink-0 rounded-lg border border-purple-200 bg-purple-50 p-3 dark:border-purple-800 dark:bg-purple-900/20">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                Sugestão de resposta (inglês)
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={useSuggestion}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-green-600 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900/30"
                title="Usar sugestão"
              >
                <Check className="h-3.5 w-3.5" />
                Usar
              </button>
              <button
                onClick={rejectSuggestion}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/30"
                title="Descartar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <p className="text-sm text-purple-800 dark:text-purple-200">{suggestion.content}</p>
        </div>
      )}

      {/* Resumo da conversa */}
      {summary && (
        <div className="mx-4 mt-3 flex-shrink-0 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                Resumo (português)
              </span>
            </div>
            <button
              onClick={() => onSummaryChange?.(null)}
              className="rounded p-1 text-blue-600 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-900/30"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-sm text-blue-800 dark:text-blue-200">{summary}</p>
        </div>
      )}

      {/* Mensagens fixadas */}
      {pinnedMessages.length > 0 && (
        <PinnedBar
          pinnedMessages={pinnedMessages}
          onNavigate={scrollToMessage}
          onUnpin={handleUnpin}
          contactName={displayName || undefined}
        />
      )}

      {/* Messages + Composer wrapper com background único */}
      <div className="chat-background flex min-h-0 flex-1 flex-col">
        {/* Messages (scroll area) */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:px-12 lg:px-20">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-zinc-500">Carregando...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-zinc-500">Nenhuma mensagem</span>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              {groupedMessages.map((item, index) =>
                item.type === "date_divider" ? (
                  <DateDivider key={`date-${item.dateKey}`} date={item.date} />
                ) : item.message.message_type?.startsWith("service_") ? (
                  // Mensagem de serviço (join, leave, etc) - interativa
                  <ServiceMessage
                    key={item.message.id}
                    message={item.message}
                    onOpenChat={onOpenUserChat}
                    onSendWelcome={onSendWelcome}
                  />
                ) : (
                  <div
                    key={item.message.id}
                    ref={(el) => {
                      if (el) messageRefs.current.set(item.message.id, el)
                      else messageRefs.current.delete(item.message.id)
                    }}
                    className="transition-all duration-300"
                  >
                    <MessageItem
                      message={item.message}
                      onDownload={onDownloadAttachment}
                      translation={showTranslation && item.message.direction === "inbound" ? translations[item.message.id] : undefined}
                      showChannelIndicator={showChannelIndicator}
                      onReply={handleReply}
                      onPin={handlePin}
                      onUnpin={handleUnpin}
                      isPinned={item.message.is_pinned}
                      replyToMessage={item.message.reply_to_message_id ? messagesById[item.message.reply_to_message_id] : null}
                      isRead={readMessageIds.has(item.message.id)}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  </div>
                )
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Composer (flutuando sobre o mesmo background) */}
        <Composer
          onSend={handleSendMessage}
          templates={templates}
          initialText={draft}
          onTextChange={onDraftChange}
          externalFiles={pendingFiles}
          onExternalFilesProcessed={() => setPendingFiles([])}
          availableChannels={availableChannels}
          selectedChannel={selectedSendChannel}
          onChannelChange={onSendChannelChange}
          replyTo={replyToMessage ? {
            ...replyToMessage,
            senderName: replyToMessage.direction === "outbound" ? "Você" : (displayName || "Contato")
          } : null}
          onCancelReply={handleCancelReply}
        />
      </div>
    </div>
  )
}
