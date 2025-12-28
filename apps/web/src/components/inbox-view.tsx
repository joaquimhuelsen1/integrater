"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { createClient } from "@/lib/supabase"
import { ConversationList, type Conversation, ChannelTabs, type ChannelId } from "@/components/inbox"
import { ChatView, type Message, type Template, type AISuggestion } from "@/components/inbox"

// Tipo para canais disponíveis do contato
interface ContactChannel {
  type: string
  identityId: string
  conversationId: string
}
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
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("selectedConversationId")
    }
    return null
  })
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedChannel, setSelectedChannel] = useState<ChannelId>(null)
  const [filterTags, setFilterTags] = useState<string[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [suggestions, setSuggestions] = useState<Record<string, AISuggestion | null>>({})
  const [summaries, setSummaries] = useState<Record<string, string | null>>({})
  // Canais disponíveis do contato selecionado e canal escolhido para envio
  const [contactChannels, setContactChannels] = useState<ContactChannel[]>([])
  const [selectedSendChannel, setSelectedSendChannel] = useState<string | null>(null)

  const supabase = createClient()
  const router = useRouter()
  const { currentWorkspace } = useWorkspace()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/login")
  }

  // Carregar conversas com tags e identity
  const loadConversations = useCallback(async (search?: string) => {
    if (!currentWorkspace) {
      setIsLoading(false)
      return
    }

    const searchTerm = search?.trim().toLowerCase()

    // Se há busca, buscar por contatos E identities
    let matchingContactIds: string[] = []
    let matchingIdentityIds: string[] = []

    if (searchTerm) {
      // Busca em contacts.display_name
      const { data: matchingContacts } = await supabase
        .from("contacts")
        .select("id")
        .eq("workspace_id", currentWorkspace.id)
        .ilike("display_name", `%${searchTerm}%`)
        .limit(100)

      if (matchingContacts) {
        matchingContactIds = matchingContacts.map(c => c.id)
      }

      // Busca em contact_identities.value (email, telefone, username)
      const { data: matchingIdentities } = await supabase
        .from("contact_identities")
        .select("id, contact_id")
        .ilike("value", `%${searchTerm}%`)
        .limit(100)

      if (matchingIdentities) {
        // Coleta IDs das identities para buscar por primary_identity_id
        matchingIdentityIds = matchingIdentities.map(i => i.id)
        // Também adiciona contact_ids se existirem
        const identityContactIds = matchingIdentities.map(i => i.contact_id).filter(Boolean) as string[]
        matchingContactIds = [...new Set([...matchingContactIds, ...identityContactIds])]
      }
    }

    let query = supabase
      .from("conversations")
      .select("*, contact:contacts(display_name), contact_identities!primary_identity_id(type, value, metadata), conversation_tags(tag:tags(id, name, color)), is_pinned")
      .eq("workspace_id", currentWorkspace.id)

    // Filtra por canal no banco se selecionado
    if (selectedChannel) {
      query = query.eq("last_channel", selectedChannel)
    }

    // Se há busca, filtrar por contatos OU identities encontrados
    if (searchTerm) {
      if (matchingContactIds.length === 0 && matchingIdentityIds.length === 0) {
        // Busca não encontrou nada - retorna vazio
        setConversations([])
        setIsLoading(false)
        return
      }

      // Usa OR para buscar por contact_id OU primary_identity_id
      const conditions: string[] = []
      if (matchingContactIds.length > 0) {
        conditions.push(`contact_id.in.(${matchingContactIds.join(",")})`)
      }
      if (matchingIdentityIds.length > 0) {
        conditions.push(`primary_identity_id.in.(${matchingIdentityIds.join(",")})`)
      }
      query = query.or(conditions.join(","))
    }

    const { data, error } = await query
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(searchTerm ? 200 : 50) // Mais resultados quando buscando

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

  // Fixar conversa no banco de dados
  const handlePinConversation = useCallback(async (id: string) => {
    await supabase
      .from("conversations")
      .update({ is_pinned: true })
      .eq("id", id)
    loadConversations(searchQuery)
  }, [supabase, loadConversations, searchQuery])

  // Desafixar conversa no banco de dados
  const handleUnpinConversation = useCallback(async (id: string) => {
    await supabase
      .from("conversations")
      .update({ is_pinned: false })
      .eq("id", id)
    loadConversations(searchQuery)
  }, [supabase, loadConversations, searchQuery])

  // Persistir conversa selecionada no localStorage
  useEffect(() => {
    if (selectedId) {
      localStorage.setItem("selectedConversationId", selectedId)
    } else {
      localStorage.removeItem("selectedConversationId")
    }
  }, [selectedId])

  // Busca com debounce no banco de dados
  useEffect(() => {
    const timer = setTimeout(() => {
      loadConversations(searchQuery)
    }, 300) // 300ms debounce

    return () => clearTimeout(timer)
  }, [searchQuery, loadConversations])

  // Conversas filtradas por tags e ordenadas (fixadas no topo)
  const filteredConversations = useMemo(() => {
    const filtered = conversations.filter(c => {
      // Filtro por canal (já feito no banco, mas mantém para segurança)
      if (selectedChannel && c.last_channel !== selectedChannel) return false

      // Filtro por tags
      if (filterTags.length > 0) {
        const conversationTagIds = c.conversation_tags?.map(ct => ct.tag?.id) || []
        const hasAllTags = filterTags.every(tagId => conversationTagIds.includes(tagId))
        if (!hasAllTags) return false
      }

      return true
    })

    // Ordenar: fixadas primeiro, depois por data
    return filtered.sort((a, b) => {
      const aIsPinned = a.is_pinned
      const bIsPinned = b.is_pinned

      // Se ambos são fixados ou ambos não são, mantém ordem por data (já ordenada do banco)
      if (aIsPinned === bIsPinned) return 0

      // Fixados vêm primeiro
      return aIsPinned ? -1 : 1
    })
  }, [conversations, selectedChannel, filterTags])

  // Marcar conversa como lida
  const markAsRead = useCallback(async (conversationId: string) => {
    await supabase
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", conversationId)
    loadConversations(searchQuery)
  }, [supabase, loadConversations, searchQuery])

  // Marcar conversa como não lida
  const markAsUnread = useCallback(async (conversationId: string) => {
    await supabase
      .from("conversations")
      .update({ unread_count: 1 })
      .eq("id", conversationId)
    loadConversations(searchQuery)
  }, [supabase, loadConversations, searchQuery])

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

  // Carregar mensagens de TODAS as conversas de um contato (timeline unificada)
  const loadContactMessages = useCallback(async (contactId: string) => {
    // Buscar todas as conversas do contato
    const { data: convs, error: convError } = await supabase
      .from("conversations")
      .select("id, last_channel, primary_identity_id")
      .eq("contact_id", contactId)

    if (convError || !convs || convs.length === 0) {
      setMessages([])
      setContactChannels([])
      return
    }

    // Buscar identities para obter o tipo de cada canal
    const identityIds = convs.map(c => c.primary_identity_id).filter(Boolean)
    const { data: identities } = await supabase
      .from("contact_identities")
      .select("id, type")
      .in("id", identityIds)

    // Mapear canais disponíveis para o dropdown
    const channels: ContactChannel[] = convs.map(c => {
      const identity = identities?.find(i => i.id === c.primary_identity_id)
      return {
        type: identity?.type || c.last_channel || "unknown",
        identityId: c.primary_identity_id || "",
        conversationId: c.id,
      }
    }).filter(ch => ch.identityId)

    setContactChannels(channels)

    // Selecionar primeiro canal por padrão se não há seleção
    const firstChannel = channels[0]
    if (firstChannel && !selectedSendChannel) {
      setSelectedSendChannel(firstChannel.type)
    }

    // Buscar mensagens de TODAS as conversas do contato
    const convIds = convs.map(c => c.id)
    const { data: msgs, error: msgError } = await supabase
      .from("messages")
      .select("*, attachments(*)")
      .in("conversation_id", convIds)
      .is("deleted_at", null)
      .order("sent_at", { ascending: true })
      .limit(500)

    if (!msgError && msgs) {
      setMessages(msgs as Message[])
    }
  }, [supabase, selectedSendChannel])

  // Desvincular conversa do contato
  const unlinkContact = useCallback(async (conversationId: string) => {
    const { error } = await supabase
      .from("conversations")
      .update({ contact_id: null })
      .eq("id", conversationId)

    if (error) {
      console.error("Erro ao desvincular contato:", error)
      return
    }

    // Limpa estados do modo contatos
    setSelectedContactId(null)
    setContactChannels([])
    setSelectedSendChannel(null)

    // Recarrega mensagens apenas dessa conversa
    loadMessages(conversationId)
    loadConversations(searchQuery)
  }, [supabase, loadMessages, loadConversations, searchQuery])

  // Template de boas-vindas para novos membros
  const welcomeTemplate = `Hi, this is Ethan.
It's a great pleasure to have you in the relationship rebuilding program.

I talk individually with each student, always in a direct and personal way, to really understand their story on a deep level.

That's why I can't talk to several students throughout the day, especially since many join every day.

Now it's your turn.

If you've already filled out the form, let me know; I'll review it before asking specific questions.
If you haven't filled it out yet, share your story right here: what happened, where you are now, and what your biggest questions are.

The more details you share, the more precise our conversation will be.

I'll be waiting.`

  // Abrir chat com usuário específico do Telegram
  const handleOpenUserChat = useCallback(async (telegramUserId: number, userName: string) => {
    if (!currentWorkspace) return

    // Buscar se já existe uma identity/conversa para esse usuário
    const { data: existingIdentity } = await supabase
      .from("contact_identities")
      .select("id")
      .eq("value", String(telegramUserId))
      .eq("type", "telegram_user")
      .single()

    if (existingIdentity) {
      // Buscar conversa existente
      const { data: conv } = await supabase
        .from("conversations")
        .select("id")
        .eq("primary_identity_id", existingIdentity.id)
        .eq("workspace_id", currentWorkspace.id)
        .single()

      if (conv) {
        // Selecionar a conversa existente
        setSelectedId(conv.id)
        setSelectedContactId(null)
        setContactChannels([])
        loadMessages(conv.id)
        return
      }
    }

    // Se não existe, criar via API (que vai criar identity + conversa)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token

    try {
      const response = await fetch(`${apiUrl}/telegram/start-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          telegram_user_id: telegramUserId,
          user_name: userName,
          workspace_id: currentWorkspace.id,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.conversation_id) {
          setSelectedId(data.conversation_id)
          setSelectedContactId(null)
          setContactChannels([])
          loadMessages(data.conversation_id)
          loadConversations(searchQuery)
        }
      }
    } catch (error) {
      console.error("Error starting chat:", error)
    }
  }, [supabase, currentWorkspace, loadMessages, loadConversations, searchQuery])

  // Enviar mensagem de boas-vindas para usuário
  const handleSendWelcome = useCallback(async (telegramUserId: number, userName: string): Promise<boolean> => {
    if (!currentWorkspace) return false

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token

    try {
      // Primeiro, criar/buscar a conversa
      const response = await fetch(`${apiUrl}/telegram/start-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          telegram_user_id: telegramUserId,
          user_name: userName,
          workspace_id: currentWorkspace.id,
        }),
      })

      if (!response.ok) return false

      const data = await response.json()
      const conversationId = data.conversation_id
      const integrationAccountId = data.integration_account_id

      if (!conversationId || !integrationAccountId) return false

      // Enviar a mensagem de boas-vindas
      const sendResponse = await fetch(`${apiUrl}/messages/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          text: welcomeTemplate,
          channel: "telegram",
          integration_account_id: integrationAccountId,
          attachments: [],
        }),
      })

      if (sendResponse.ok) {
        loadConversations(searchQuery)
        return true
      }
      return false
    } catch (error) {
      console.error("Error sending welcome:", error)
      return false
    }
  }, [supabase, currentWorkspace, welcomeTemplate, loadConversations, searchQuery])

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
    loadConversations(searchQuery)
  }, [supabase, loadMessages, loadConversations, searchQuery])

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
    setSelectedSendChannel(null) // Reset canal selecionado

    // Buscar a conversa para verificar se tem contact_id
    const conv = conversations.find(c => c.id === id)
    if (conv?.contact_id) {
      // Se tem contato, carregar mensagens de TODAS as conversas do contato
      setSelectedContactId(conv.contact_id)
      loadContactMessages(conv.contact_id)
    } else {
      // Se não tem contato, carregar apenas mensagens dessa conversa
      setSelectedContactId(null)
      setContactChannels([])
      loadMessages(id)
    }

    // Marca como lida ao selecionar
    markAsRead(id)
    // Fecha sidebar em mobile
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false)
    }
  }, [conversations, loadMessages, loadContactMessages, markAsRead])

  // Enviar mensagem com attachments
  const handleSendMessage = useCallback(async (text: string, attachmentFiles?: File[]) => {
    if (!selectedId) return
    if (!text.trim() && (!attachmentFiles || attachmentFiles.length === 0)) return

    // Se tem múltiplos canais disponíveis, usar o canal selecionado
    let targetConversationId = selectedId
    let channel = "telegram"

    if (contactChannels.length > 0 && selectedSendChannel) {
      // Encontrar a conversa do canal selecionado
      const selectedChannelInfo = contactChannels.find(ch => ch.type === selectedSendChannel)
      if (selectedChannelInfo) {
        targetConversationId = selectedChannelInfo.conversationId
        // Mapear tipo de identidade para channel
        const typeToChannel: Record<string, string> = {
          telegram_user: "telegram",
          email: "email",
          phone: "openphone_sms",
          openphone_sms: "openphone_sms",
        }
        channel = typeToChannel[selectedChannelInfo.type] || "telegram"
      }
    } else {
      // Usar a conversa selecionada diretamente
      const conv = conversations.find(c => c.id === selectedId)
      if (conv) {
        channel = conv.last_channel || "telegram"
      }
    }

    // Buscar dados necessários para criar a mensagem
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return

    const ownerId = userData.user.id

    // Buscar primary_identity_id da conversa de destino
    const { data: convDetailsList, error: convError } = await supabase
      .from("conversations")
      .select("primary_identity_id, contact_id")
      .eq("id", targetConversationId)
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
    if (!identityId && convDetails?.contact_id) {
      const { data: identities, error: idError } = await supabase
        .from("contact_identities")
        .select("id")
        .eq("contact_id", convDetails.contact_id)
        .limit(1)

      if (idError) {
        console.error("Error fetching identity:", idError)
        return
      }
      identityId = identities?.[0]?.id
    }

    if (!identityId) {
      console.error("No identity found for conversation")
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
      conversation_id: targetConversationId,
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
          conversation_id: targetConversationId,
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
    if (selectedContactId) {
      loadContactMessages(selectedContactId)
    } else {
      loadMessages(selectedId)
    }
    loadConversations(searchQuery)
  }, [selectedId, selectedContactId, contactChannels, selectedSendChannel, conversations, supabase, loadConversations, loadMessages, loadContactMessages, uploadAttachment, searchQuery])

  // Carregar templates ao montar (conversas são carregadas pelo debounce effect)
  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  // Realtime - novas mensagens
  useEffect(() => {
    const channel = supabase
      .channel("inbox-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const newMsg = payload.new as Message
          // Se tem contato selecionado, verificar se msg é de qualquer conversa do contato
          if (selectedContactId && contactChannels.some(ch => ch.conversationId === newMsg.conversation_id)) {
            loadContactMessages(selectedContactId)
          } else if (newMsg.conversation_id === selectedId) {
            // Recarrega mensagens para incluir attachments
            loadMessages(selectedId)
          }
          loadConversations(searchQuery)
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "attachments" },
        (payload) => {
          // Quando attachment é criado, recarrega mensagens
          const att = payload.new as { message_id?: string }
          if (att.message_id && selectedId) {
            if (selectedContactId) {
              loadContactMessages(selectedContactId)
            } else {
              loadMessages(selectedId)
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => {
          loadConversations(searchQuery)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, selectedId, selectedContactId, contactChannels, loadConversations, loadMessages, loadContactMessages, searchQuery])

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
              onPin={handlePinConversation}
              onUnpin={handleUnpinConversation}
              onMarkRead={markAsRead}
              onMarkUnread={markAsUnread}
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
            avatarUrl={selectedConversation?.primary_identity?.metadata?.avatar_url}
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
            showChannelIndicator={!!selectedContactId}
            availableChannels={contactChannels.map(ch => ({ type: ch.type, label: ch.type }))}
            selectedSendChannel={selectedSendChannel}
            onSendChannelChange={setSelectedSendChannel}
            onUnlinkContact={selectedId ? () => unlinkContact(selectedId) : undefined}
            onOpenUserChat={handleOpenUserChat}
            onSendWelcome={handleSendWelcome}
            welcomeTemplate={welcomeTemplate}
          />
        </div>
      </div>
    </div>
  )
}
