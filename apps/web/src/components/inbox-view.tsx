"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { createClient } from "@/lib/supabase"
import { ConversationList, type Conversation, ChannelTabs } from "@/components/inbox"
import { ChatView, type Message, type Template, type AISuggestion } from "@/components/inbox"
import { WorkspaceSelector } from "@/components/workspace-selector"
import { ThemeToggle } from "@/components/theme-toggle"
import { SidebarMenu } from "@/components/sidebar-menu"
import { Menu, Search, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useWorkspace } from "@/contexts/workspace-context"

// Infere mime_type pela extensão quando file.type está vazio
function inferMimeType(file: File): string {
  if (file.type) return file.type

  const ext = file.name.split(".").pop()?.toLowerCase()
  const mimeMap: Record<string, string> = {
    // Imagens
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
    // Áudio
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    opus: "audio/opus",
    m4a: "audio/mp4",
    aac: "audio/aac",
    webm: "audio/webm",
    // Vídeo
    mp4: "video/mp4",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    // Documentos
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
    zip: "application/zip",
  }

  return ext ? mimeMap[ext] || "application/octet-stream" : "application/octet-stream"
}

interface InboxViewProps {
  userEmail: string
}

export function InboxView({ userEmail }: InboxViewProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedChannel, setSelectedChannel] = useState<"telegram" | "email" | "openphone_sms" | null>(null)
  const [filterTags, setFilterTags] = useState<string[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [suggestions, setSuggestions] = useState<Record<string, AISuggestion | null>>({})
  const [summaries, setSummaries] = useState<Record<string, string | null>>({})

  const supabase = createClient()
  const router = useRouter()
  const { currentWorkspace } = useWorkspace()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/login")
  }

  // Carregar conversas com tags e identity
  const loadConversations = useCallback(async () => {
    if (!currentWorkspace) return

    let query = supabase
      .from("conversations")
      .select("*, contact:contacts(display_name), contact_identities!primary_identity_id(type, value, metadata), conversation_tags(tag:tags(id, name, color))")
      .eq("workspace_id", currentWorkspace.id)

    // Filtra por canal no banco se selecionado
    if (selectedChannel) {
      query = query.eq("last_channel", selectedChannel)
    }

    const { data, error } = await query
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(50)

    if (error) {
      console.error("Error loading conversations:", error)
    }
    if (data) {
      // Mapeia contact_identities para primary_identity
      const mapped = data.map((c: Record<string, unknown>) => ({
        ...c,
        primary_identity: c.contact_identities,
      }))
      setConversations(mapped as Conversation[])
    }
    setIsLoading(false)
  }, [supabase, currentWorkspace, selectedChannel])

  // Conversas filtradas por canal, busca e tags
  const filteredConversations = useMemo(() => {
    return conversations.filter(c => {
      // Filtro por canal
      if (selectedChannel && c.last_channel !== selectedChannel) return false

      // Filtro por tags
      if (filterTags.length > 0) {
        const conversationTagIds = c.conversation_tags?.map(ct => ct.tag?.id) || []
        const hasAllTags = filterTags.every(tagId => conversationTagIds.includes(tagId))
        if (!hasAllTags) return false
      }

      // Filtro por busca
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      if (c.contact?.display_name?.toLowerCase().includes(q)) return true
      const meta = c.primary_identity?.metadata
      if (meta?.display_name?.toLowerCase().includes(q)) return true
      if (meta?.first_name?.toLowerCase().includes(q)) return true
      if (meta?.last_name?.toLowerCase().includes(q)) return true
      if (meta?.username?.toLowerCase().includes(q)) return true
      if (c.primary_identity?.value?.toLowerCase().includes(q)) return true
      return false
    })
  }, [conversations, selectedChannel, searchQuery, filterTags])

  // Marcar conversa como lida
  const markAsRead = useCallback(async (conversationId: string) => {
    await supabase
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", conversationId)
    loadConversations()
  }, [supabase, loadConversations])

  // Marcar conversa como não lida
  const markAsUnread = useCallback(async (conversationId: string) => {
    await supabase
      .from("conversations")
      .update({ unread_count: 1 })
      .eq("id", conversationId)
    loadConversations()
  }, [supabase, loadConversations])

  // Carregar mensagens da conversa selecionada
  const loadMessages = useCallback(async (conversationId: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select("*, attachments(*)")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("sent_at", { ascending: true })
      .limit(500)

    if (!error && data) {
      setMessages(data as Message[])
    }
  }, [supabase])

  // Sincronizar histórico de mensagens
  const syncHistory = useCallback(async (conversationId: string) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token

    const response = await fetch(`${apiUrl}/conversations/${conversationId}/sync-history?limit=500`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })

    if (!response.ok) {
      const error = await response.text()
      console.error("Erro ao sincronizar histórico:", error)
      throw new Error(error)
    }

    const result = await response.json()
    const jobId = result.job_id

    // Aguarda job completar (polling a cada 2s, max 60s)
    if (jobId) {
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000))

        const { data: job } = await supabase
          .from("sync_history_jobs")
          .select("status")
          .eq("id", jobId)
          .single()

        if (job?.status === "completed" || job?.status === "failed") {
          break
        }

        // Recarrega mensagens periodicamente durante sync
        loadMessages(conversationId)
      }
    }

    // Recarrega mensagens após sync
    loadMessages(conversationId)
    loadConversations()
  }, [supabase, loadMessages, loadConversations])

  // Carregar templates
  const loadTemplates = useCallback(async () => {
    const { data, error } = await supabase
      .from("templates")
      .select("id, title, content, shortcut")
      .order("title")

    if (!error && data) {
      // Map content to body for component compatibility
      setTemplates(data.map(t => ({ ...t, body: t.content })) as Template[])
    }
  }, [supabase])

  // Upload de arquivo ao Storage
  const uploadAttachment = useCallback(async (file: File, ownerId: string): Promise<string | null> => {
    const ext = file.name.split(".").pop()
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const path = `outbound/${ownerId}/${filename}`

    console.log("Uploading file to:", path)
    const { error } = await supabase.storage
      .from("attachments")
      .upload(path, file)

    if (error) {
      console.error("Upload error:", error)
      return null
    }
    console.log("Upload successful:", path)
    return path
  }, [supabase])

  // Download de attachment
  const handleDownloadAttachment = useCallback(async (attachmentId: string, filename: string) => {
    // Buscar storage_path do attachment
    const { data: att } = await supabase
      .from("attachments")
      .select("storage_path")
      .eq("id", attachmentId)
      .single()

    if (!att?.storage_path) return

    const { data } = await supabase.storage
      .from("attachments")
      .download(att.storage_path)

    if (data) {
      const url = URL.createObjectURL(data)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    }
  }, [supabase])

  // Selecionar conversa
  const handleSelectConversation = useCallback((id: string) => {
    setSelectedId(id)
    loadMessages(id)
    // Marca como lida ao selecionar
    markAsRead(id)
    // Fecha sidebar em mobile
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false)
    }
  }, [loadMessages, markAsRead])

  // Enviar mensagem com attachments
  const handleSendMessage = useCallback(async (text: string, attachmentFiles?: File[]) => {
    if (!selectedId) return
    if (!text.trim() && (!attachmentFiles || attachmentFiles.length === 0)) return

    const conv = conversations.find(c => c.id === selectedId)
    if (!conv) return

    // Buscar dados necessários para criar a mensagem
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return

    const ownerId = userData.user.id
    const now = new Date().toISOString()
    const channel = conv.last_channel || "telegram"

    // Buscar primary_identity_id da conversa
    const { data: convDetailsList, error: convError } = await supabase
      .from("conversations")
      .select("primary_identity_id")
      .eq("id", selectedId)
      .limit(1)

    if (convError) {
      console.error("Error fetching conversation details:", convError)
      return
    }

    const convDetails = convDetailsList?.[0]

    // Mapear channel para type de integration
    const channelToType: Record<string, string> = {
      telegram: "telegram_user",
      email: "email_imap_smtp",
      openphone_sms: "openphone",
    }
    const integrationType = channelToType[channel] || "telegram_user"

    // Buscar integration_account ativa do tipo correto
    const { data: integrationAccounts, error: intError } = await supabase
      .from("integration_accounts")
      .select("id")
      .eq("is_active", true)
      .eq("type", integrationType)
      .limit(1)

    if (intError) {
      console.error("Error fetching integration account:", intError)
      return
    }

    const integrationAccount = integrationAccounts?.[0]
    if (!integrationAccount) {
      console.error(`No active ${integrationType} integration account found`)
      return
    }

    // Usar primary_identity_id ou buscar uma
    let identityId = convDetails?.primary_identity_id
    if (!identityId && conv.contact_id) {
      const { data: identities, error: idError } = await supabase
        .from("contact_identities")
        .select("id")
        .eq("contact_id", conv.contact_id)
        .limit(1)

      if (idError) {
        console.error("Error fetching identity:", idError)
        return
      }
      identityId = identities?.[0]?.id
    }

    if (!identityId) {
      console.error("No identity found for conversation, contact_id:", conv.contact_id)
      return
    }

    // Enviar via API (que envia via canal e salva no banco)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token

    // Se não tem texto nem attachments, não envia
    if (!text.trim() && (!attachmentFiles || attachmentFiles.length === 0)) {
      console.error("No text and no attachments, aborting send")
      return
    }

    console.log("Sending message via API:", {
      conversation_id: selectedId,
      channel: channel,
      integration_account_id: integrationAccount.id,
    })

    let messageId: string | null = null

    // 1. Criar mensagem primeiro (para ter o ID)
    try {
      const response = await fetch(`${apiUrl}/messages/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          conversation_id: selectedId,
          text: text || "",
          channel: channel,
          integration_account_id: integrationAccount.id,
          attachments: [],
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error("Error sending message:", response.status, errorText)
        return
      }

      const messageData = await response.json()
      messageId = messageData.id
      console.log("Message created with ID:", messageId)
    } catch (error) {
      console.error("Error sending message:", error)
      return
    }

    // 2. Upload attachments e criar registros (agora temos message_id)
    if (messageId && attachmentFiles && attachmentFiles.length > 0) {
      console.log("Processing attachments:", attachmentFiles.length)
      for (const file of attachmentFiles) {
        const path = await uploadAttachment(file, ownerId)
        if (path) {
          console.log("Creating attachment record for:", path)
          const attachmentId = crypto.randomUUID()
          const mimeType = inferMimeType(file)
          console.log(`File ${file.name}: type=${file.type}, inferred=${mimeType}`)
          const { error: attError } = await supabase
            .from("attachments")
            .insert({
              id: attachmentId,
              owner_id: ownerId,
              message_id: messageId,
              storage_bucket: "attachments",
              storage_path: path,
              file_name: file.name,
              mime_type: mimeType,
              byte_size: file.size,
              metadata: {},
            })

          if (attError) {
            console.error("Attachment insert error:", attError.message)
          } else {
            console.log("Attachment created:", attachmentId)
          }
        }
      }
    }

    // Recarregar mensagens e conversas
    loadMessages(selectedId)
    loadConversations()
  }, [selectedId, conversations, supabase, loadConversations, loadMessages, uploadAttachment])

  // Carregar conversas e templates ao montar
  useEffect(() => {
    loadConversations()
    loadTemplates()
  }, [loadConversations, loadTemplates])

  // Realtime - novas mensagens
  useEffect(() => {
    const channel = supabase
      .channel("inbox-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const newMsg = payload.new as Message
          if (newMsg.conversation_id === selectedId) {
            // Recarrega mensagens para incluir attachments
            loadMessages(selectedId)
          }
          loadConversations()
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "attachments" },
        (payload) => {
          // Quando attachment é criado, recarrega mensagens
          const att = payload.new as { message_id?: string }
          if (att.message_id && selectedId) {
            loadMessages(selectedId)
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => {
          loadConversations()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, selectedId, loadConversations])

  const selectedConversation = conversations.find(c => c.id === selectedId)

  // Determina display name para ChatView
  const getDisplayName = (conv: Conversation | undefined) => {
    if (!conv) return null
    if (conv.contact?.display_name) return conv.contact.display_name
    const meta = conv.primary_identity?.metadata
    // Email: display_name
    if (meta?.display_name) return meta.display_name
    // Telegram: first_name + last_name
    if (meta?.first_name) {
      return meta.last_name ? `${meta.first_name} ${meta.last_name}` : meta.first_name
    }
    if (meta?.username) return `@${meta.username}`
    // Email fallback
    if (conv.primary_identity?.value && conv.last_channel === "email") {
      return conv.primary_identity.value
    }
    return "Desconhecido"
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      {/* Sidebar */}
      <div
        className={`flex w-96 flex-shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 ${
          isSidebarOpen ? "" : "hidden md:flex"
        }`}
      >
        {/* Header */}
        <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-zinc-200 px-4 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <SidebarMenu
              userEmail={userEmail}
              filterTags={filterTags}
              onFilterTagsChange={setFilterTags}
              onLogout={handleLogout}
            />
            <h1 className="text-lg font-semibold">Inbox</h1>
          </div>
          <div className="flex items-center gap-2">
            <WorkspaceSelector compact />
            <ThemeToggle />
            <button
              className="rounded p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 md:hidden"
              onClick={() => setIsSidebarOpen(false)}
            >
              <X className="h-5 w-5 text-zinc-500" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="flex-shrink-0 p-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar conversas..."
              className="w-full rounded-lg border border-zinc-300 py-2.5 pl-11 pr-4 text-base focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>
        </div>

        {/* Channel Tabs */}
        <ChannelTabs
          selected={selectedChannel}
          onSelect={setSelectedChannel}
        />

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center text-zinc-500">
              Carregando...
            </div>
          ) : (
            <ConversationList
              conversations={filteredConversations}
              selectedId={selectedId}
              onSelect={handleSelectConversation}
            />
          )}
        </div>

      </div>

      {/* Chat */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <div className="flex h-14 flex-shrink-0 items-center border-b border-zinc-200 px-4 dark:border-zinc-800 md:hidden">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden">
          <ChatView
            conversationId={selectedId}
            messages={messages}
            displayName={getDisplayName(selectedConversation)}
            onSendMessage={handleSendMessage}
            onDownloadAttachment={handleDownloadAttachment}
            templates={templates}
            tags={selectedConversation?.conversation_tags?.map(ct => ct.tag) || []}
            onTagsChange={loadConversations}
            draft={selectedId ? drafts[selectedId] || "" : ""}
            onDraftChange={(text) => {
              if (selectedId) {
                setDrafts(prev => ({ ...prev, [selectedId]: text }))
              }
            }}
            suggestion={selectedId ? suggestions[selectedId] || null : null}
            onSuggestionChange={(suggestion) => {
              if (selectedId) {
                setSuggestions(prev => ({ ...prev, [selectedId]: suggestion }))
              }
            }}
            summary={selectedId ? summaries[selectedId] || null : null}
            onSummaryChange={(summary) => {
              if (selectedId) {
                setSummaries(prev => ({ ...prev, [selectedId]: summary }))
              }
            }}
            contactId={selectedConversation?.contact_id}
            identityId={selectedConversation?.primary_identity_id}
            identityValue={selectedConversation?.primary_identity?.value}
            onContactLinked={loadConversations}
            unreadCount={selectedConversation?.unread_count || 0}
            onMarkAsRead={selectedId ? () => markAsRead(selectedId) : undefined}
            onMarkAsUnread={selectedId ? () => markAsUnread(selectedId) : undefined}
            onSyncHistory={selectedId ? () => syncHistory(selectedId) : undefined}
          />
        </div>
      </div>
    </div>
  )
}
