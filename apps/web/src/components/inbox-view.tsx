"use client"

import { useState, useEffect, useCallback, useMemo, useRef, MutableRefObject } from "react"
import { createClient } from "@/lib/supabase"
import { ConversationList, type Conversation, ChannelTabs, type ChannelId } from "@/components/inbox"
import { ChatView, type Message, type Template, type AISuggestion } from "@/components/inbox"
import { useRealtimeMessages, type RealtimeMessage } from "@/hooks/use-realtime-messages"

// Tipo para canais disponíveis do contato
interface ContactChannel {
  type: string
  identityId: string
  conversationId: string
}
import { WorkspaceSelector } from "@/components/workspace-selector"
import { ThemeToggle } from "@/components/theme-toggle"
import { SidebarMenu, type TagFilterMode } from "@/components/sidebar-menu"
import { CRMPanel } from "@/components/crm/crm-panel"
import { ArrowLeft, Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { useWorkspace } from "@/contexts/workspace-context"
import { useSoundContext } from "@/contexts/sound-context"

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
  workspaceId?: string
}

/**
 * Lê o ID da conversa do hash da URL.
 * Formato: #conv-123 ou simplesmente #123
 */
function getConversationIdFromHash(): string | null {
  if (typeof window === "undefined") return null
  const hash = window.location.hash.slice(1) // Remove #
  if (!hash) return null
  // Remove prefixo "conv-" se existir
  return hash.startsWith("conv-") ? hash.slice(5) : hash
}

/**
 * Atualiza o hash da URL com o ID da conversa.
 * Não recarrega a página (instantâneo).
 */
function setConversationIdInHash(id: string | null) {
  if (typeof window === "undefined") return
  if (id) {
    window.location.hash = id
  } else {
    // Remove hash sem adicionar ao histórico
    history.replaceState(null, "", window.location.pathname)
  }
}

export function InboxView({ userEmail, workspaceId }: InboxViewProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  // Usa hash da URL para conversa selecionada (não localStorage)
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    return getConversationIdFromHash()
  })
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [cachedSelectedConversation, setCachedSelectedConversation] = useState<Conversation | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  // Mobile: controla qual view está ativa (list ou chat)
  // Em mobile, mostra apenas uma view por vez (estilo WhatsApp)
  const [mobileView, setMobileView] = useState<"list" | "chat">("list")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedChannel, setSelectedChannel] = useState<ChannelId>(null)
  const [filterTags, setFilterTags] = useState<string[]>([])
  const [filterMode, setFilterMode] = useState<TagFilterMode>("any")
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [suggestions, setSuggestions] = useState<Record<string, AISuggestion | null>>({})
  const [summaries, setSummaries] = useState<Record<string, string | null>>({})
  // Canais disponíveis do contato selecionado e canal escolhido para envio
  const [contactChannels, setContactChannels] = useState<ContactChannel[]>([])
  const [selectedSendChannel, setSelectedSendChannel] = useState<string | null>(null)
  // Painel CRM lateral
  const [isCRMPanelOpen, setIsCRMPanelOpen] = useState(false)
  // Read status para lista de conversas
  const [readConversationIds, setReadConversationIds] = useState<Set<string>>(new Set())
  const [lastMessageDirections, setLastMessageDirections] = useState<Record<string, "inbound" | "outbound">>({})
  // Presence status - identities que estão online
  const [onlineIdentityIds, setOnlineIdentityIds] = useState<Set<string>>(new Set())
  // Typing status - identities que estão digitando
  const [typingIdentityIds, setTypingIdentityIds] = useState<Set<string>>(new Set())

  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const { currentWorkspace } = useWorkspace()
  const { playSound } = useSoundContext()

  // Refs para evitar re-subscriptions no realtime
  const selectedIdRef = useRef(selectedId)
  const selectedContactIdRef = useRef(selectedContactId)
  const contactChannelsRef = useRef(contactChannels)
  const searchQueryRef = useRef(searchQuery)

  // Atualiza refs quando valores mudam
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])
  useEffect(() => { selectedContactIdRef.current = selectedContactId }, [selectedContactId])
  useEffect(() => { contactChannelsRef.current = contactChannels }, [contactChannels])
  useEffect(() => { searchQueryRef.current = searchQuery }, [searchQuery])

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

      // Busca também em metadata (nome de grupos, first_name, username)
      const { data: metadataMatches } = await supabase
        .from("contact_identities")
        .select("id, contact_id")
        .or(`metadata->>title.ilike.%${searchTerm}%,metadata->>first_name.ilike.%${searchTerm}%,metadata->>username.ilike.%${searchTerm}%`)
        .limit(100)

      if (metadataMatches) {
        const metaIdentityIds = metadataMatches.map(i => i.id)
        matchingIdentityIds = [...new Set([...matchingIdentityIds, ...metaIdentityIds])]
        const metaContactIds = metadataMatches.map(i => i.contact_id).filter(Boolean) as string[]
        matchingContactIds = [...new Set([...matchingContactIds, ...metaContactIds])]
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

  // Arquivar conversa
  const handleArchiveConversation = useCallback(async (id: string) => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    await fetch(`${API_URL}/conversations/${id}/archive`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` }
    })

    // Remove da lista local e limpa seleção se necessário
    setConversations(prev => prev.filter(c => c.id !== id))
    if (selectedId === id) {
      setSelectedId(null)
      setMessages([])
    }
  }, [supabase, selectedId])

  // Desarquivar conversa
  const handleUnarchiveConversation = useCallback(async (id: string) => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    await fetch(`${API_URL}/conversations/${id}/unarchive`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` }
    })

    // Remove da lista de arquivadas e recarrega
    setConversations(prev => prev.filter(c => c.id !== id))
    if (selectedId === id) {
      setSelectedId(null)
      setMessages([])
    }
  }, [supabase, selectedId])

  // Excluir conversa
  const handleDeleteConversation = useCallback(async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta conversa? Esta ação não pode ser desfeita.")) {
      return
    }

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    await fetch(`${API_URL}/conversations/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` }
    })

    // Remove da lista local e limpa seleção se necessário
    setConversations(prev => prev.filter(c => c.id !== id))
    if (selectedId === id) {
      setSelectedId(null)
      setMessages([])
    }
  }, [supabase, selectedId])

  // Sincroniza hash da URL com selectedId
  useEffect(() => {
    setConversationIdInHash(selectedId)
  }, [selectedId])

  // Escuta mudanças no hash (back/forward do browser)
  useEffect(() => {
    const handleHashChange = () => {
      const hashId = getConversationIdFromHash()
      if (hashId !== selectedId) {
        setSelectedId(hashId)
      }
    }
    window.addEventListener("hashchange", handleHashChange)
    return () => window.removeEventListener("hashchange", handleHashChange)
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
      // Esconder conversas sem mensagens (sem preview = sem mensagem real)
      if (!c.last_message_preview) return false

      // Aba "Arquivadas" - mostrar apenas arquivadas
      if (selectedChannel === "archived") {
        return !!c.archived_at
      }

      // Outras abas - esconder arquivadas
      if (c.archived_at) return false

      // Filtro por canal (já feito no banco, mas mantém para segurança)
      if (selectedChannel && c.last_channel !== selectedChannel) return false

      // Filtro por tags
      if (filterTags.length > 0) {
        const conversationTagIds = c.conversation_tags?.map(ct => ct.tag?.id).filter(Boolean) || []
        
        if (filterMode === "exact") {
          // Modo "Apenas": conversa deve ter EXATAMENTE essas tags (mesma quantidade e mesmos IDs)
          if (conversationTagIds.length !== filterTags.length) return false
          const hasExactTags = filterTags.every(tagId => conversationTagIds.includes(tagId))
          if (!hasExactTags) return false
        } else {
          // Modo "Contém": conversa deve ter TODAS as tags selecionadas (pode ter mais)
          const hasAllTags = filterTags.every(tagId => conversationTagIds.includes(tagId))
          if (!hasAllTags) return false
        }
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
  }, [conversations, selectedChannel, filterTags, filterMode])

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
    // Busca as 500 mais recentes (desc) e depois inverte para ordem cronológica
    const { data, error } = await supabase
      .from("messages")
      .select("*, attachments(*)")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("sent_at", { ascending: false })
      .limit(500)

    if (!error && data) {
      // Inverte para mostrar em ordem cronológica (antigas primeiro, novas embaixo)
      const dbMessages = data.reverse() as Message[]
      const dbIds = new Set(dbMessages.map(m => m.id))

      // Preservar APENAS mensagens "sending" ou "failed" que não estão no banco
      // Mensagens "sent" temporárias são removidas pois o banco já tem a real
      setMessages(prev => {
        const toKeep = prev.filter(m => {
          if (m.sending_status === "sending" || m.sending_status === "failed") {
            return !dbIds.has(m.id)
          }
          return false
        })
        return [...dbMessages, ...toKeep]
      })
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

    // Buscar mensagens de TODAS as conversas do contato (500 mais recentes)
    const convIds = convs.map(c => c.id)
    const { data: msgs, error: msgError } = await supabase
      .from("messages")
      .select("*, attachments(*)")
      .in("conversation_id", convIds)
      .is("deleted_at", null)
      .order("sent_at", { ascending: false })
      .limit(500)

    if (!msgError && msgs) {
      // Inverte para ordem cronológica
      const dbMessages = msgs.reverse() as Message[]
      const dbIds = new Set(dbMessages.map(m => m.id))

      // Preservar APENAS mensagens "sending" ou "failed" que não estão no banco
      // Mensagens "sent" temporárias são removidas pois o banco já tem a real
      setMessages(prev => {
        const toKeep = prev.filter(m => {
          if (m.sending_status === "sending" || m.sending_status === "failed") {
            return !dbIds.has(m.id)
          }
          return false
        })
        return [...dbMessages, ...toKeep]
      })
    }
  }, [supabase, selectedSendChannel])

  // Restaurar mensagens quando conversa selecionada é restaurada do localStorage
  const hasLoadedRef = useRef(false)
  useEffect(() => {
    if (selectedId && conversations.length > 0 && !hasLoadedRef.current) {
      const conv = conversations.find(c => c.id === selectedId)
      if (conv) {
        hasLoadedRef.current = true
        // Cache da conversa para manter dados quando mudar de canal
        setCachedSelectedConversation(conv)
        if (conv.contact_id) {
          setSelectedContactId(conv.contact_id)
          loadContactMessages(conv.contact_id)
        } else {
          setSelectedContactId(null)
          loadMessages(selectedId)
        }
      }
    }
  }, [selectedId, conversations, loadMessages, loadContactMessages])

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

      if (!conversationId) return false

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
          // integration_account_id é resolvido pela API baseado no workspace
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

    // OTIMIZAÇÃO: Usa Realtime para aguardar job, não polling!
    if (jobId) {
      await new Promise<void>((resolve) => {
        const channel = supabase
          .channel(`sync-job-${jobId}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "sync_history_jobs",
              filter: `id=eq.${jobId}`,
            },
            (payload) => {
              const job = payload.new as { status: string }
              if (job.status === "completed" || job.status === "failed") {
                supabase.removeChannel(channel)
                resolve()
              }
            }
          )
          .subscribe()

        // Timeout de segurança (60s max)
        setTimeout(() => {
          supabase.removeChannel(channel)
          resolve()
        }, 60000)
      })
    }

    // Recarrega mensagens após sync (1x apenas)
    loadMessages(conversationId)
    loadConversations(searchQuery)
  }, [supabase, loadMessages, loadConversations, searchQuery])

  // Sincronizar contatos OpenPhone (atualiza nomes)
  const syncOpenPhoneContacts = useCallback(async () => {
    if (!currentWorkspace) return

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token

    // Buscar conta OpenPhone do workspace
    const { data: accounts } = await supabase
      .from("integration_accounts")
      .select("id")
      .eq("workspace_id", currentWorkspace.id)
      .eq("type", "openphone")
      .limit(1)

    const account = accounts?.[0]
    if (!account) {
      console.warn("Nenhuma conta OpenPhone encontrada")
      return
    }

    const accountId = account.id

    const response = await fetch(
      `${apiUrl}/openphone/contacts/sync?account_id=${accountId}&workspace_id=${currentWorkspace.id}`,
      {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }
    )

    if (!response.ok) {
      const error = await response.text()
      console.error("Erro ao sincronizar contatos:", error)
      throw new Error(error)
    }

    const result = await response.json()
    console.log(`Sync contatos: ${result.synced} atualizados, ${result.skipped} ignorados`)

    // Recarrega conversas para mostrar nomes atualizados
    loadConversations(searchQuery)
  }, [supabase, currentWorkspace, loadConversations, searchQuery])

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

    // Guardar no cache para manter dados quando mudar de canal
    if (conv) {
      setCachedSelectedConversation(conv)
    }
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
    // Mobile: muda para view de chat
    if (window.innerWidth < 768) {
      setMobileView("chat")
    }
  }, [conversations, loadMessages, loadContactMessages, markAsRead])

  // Voltar para lista no mobile
  const handleBackToList = useCallback(() => {
    setMobileView("list")
  }, [])

  // Enviar mensagem com attachments (com optimistic update)
  const handleSendMessage = useCallback(async (text: string, attachmentFiles?: File[], replyToMessageId?: string) => {
    if (!selectedId) return
    if (!text.trim() && (!attachmentFiles || attachmentFiles.length === 0)) return

    // Se tem múltiplos canais disponíveis, usar o canal selecionado
    let targetConversationId = selectedId
    let channel: "telegram" | "email" | "openphone_sms" = "telegram"

    if (contactChannels.length > 0 && selectedSendChannel) {
      // Encontrar a conversa do canal selecionado
      const selectedChannelInfo = contactChannels.find(ch => ch.type === selectedSendChannel)
      if (selectedChannelInfo) {
        targetConversationId = selectedChannelInfo.conversationId
        // Mapear tipo de identidade para channel
        const typeToChannel: Record<string, "telegram" | "email" | "openphone_sms"> = {
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

    // Gera UUID real (mesmo ID usado pelo frontend e backend)
    // Isso evita duplicatas: quando o Realtime receber o INSERT, o ID já existe
    const messageId = crypto.randomUUID()

    // Mensagem com ID real (aparece instantaneamente)
    const optimisticMessage: Message = {
      id: messageId,
      conversation_id: targetConversationId,
      direction: "outbound",
      text: text || "",
      subject: null,
      channel: channel,
      sent_at: new Date().toISOString(),
      sending_status: "sending", // Mostra ícone de carregando
    }

    // Optimistic update: adiciona imediatamente na lista
    setMessages(prev => [...prev, optimisticMessage])
    
    // Toca som de envio
    playSound("send")

    // Buscar dados necessários para criar a mensagem
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      // Falhou: marcar como erro
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, sending_status: "failed" as const } : m
      ))
      return
    }

    const ownerId = userData.user.id

    // Buscar primary_identity_id da conversa de destino
    const { data: convDetailsList, error: convError } = await supabase
      .from("conversations")
      .select("primary_identity_id, contact_id")
      .eq("id", targetConversationId)
      .limit(1)

    if (convError) {
      console.error("Error fetching conversation details:", convError)
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, sending_status: "failed" as const } : m
      ))
      return
    }

    const convDetails = convDetailsList?.[0]

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
        setMessages(prev => prev.map(m =>
          m.id === messageId ? { ...m, sending_status: "failed" as const } : m
        ))
        return
      }
      identityId = identities?.[0]?.id
    }

    if (!identityId) {
      console.error("No identity found for conversation")
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, sending_status: "failed" as const } : m
      ))
      return
    }

    // Enviar via API
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token

    // 1. Upload attachments PRIMEIRO (antes de criar mensagem)
    const attachmentIds: string[] = []
    if (attachmentFiles && attachmentFiles.length > 0) {
      console.log("Uploading attachments FIRST:", attachmentFiles.length)
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
              message_id: null, // Será vinculado pela API
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
            attachmentIds.push(attachmentId)
          }
        }
      }
    }

    // 2. Criar mensagem no servidor (com mesmo ID do frontend)
    try {
      const response = await fetch(`${apiUrl}/messages/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          id: messageId, // Mesmo ID do frontend - evita duplicata com Realtime
          conversation_id: targetConversationId,
          text: text || "",
          channel: channel,
          // integration_account_id é resolvido pela API baseado no workspace
          attachments: attachmentIds, // IDs dos attachments já criados
          reply_to_message_id: replyToMessageId || null,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error("Error sending message:", response.status, errorText)
        // Marcar como falha
        setMessages(prev => prev.map(m =>
          m.id === messageId ? { ...m, sending_status: "failed" as const } : m
        ))
        return
      }

      const messageData = await response.json()
      console.log("Message created with ID:", messageData.id)

      // Sucesso: apenas atualiza o status (Realtime vai trazer os dados completos)
      // O ID já é o mesmo, então não precisa substituir
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, ...messageData, sending_status: "sent" as const } : m
      ))
    } catch (error) {
      console.error("Error sending message:", error)
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, sending_status: "failed" as const } : m
      ))
      return
    }

    // Atualizar lista de conversas
    loadConversations(searchQuery)
  }, [selectedId, selectedContactId, contactChannels, selectedSendChannel, conversations, supabase, loadConversations, loadMessages, loadContactMessages, uploadAttachment, searchQuery, playSound])

  // Enviar typing notification para o Telegram
  const handleTyping = useCallback(async () => {
    if (!selectedId) return

    // Descobrir o canal da conversa
    const conv = conversations.find(c => c.id === selectedId)
    if (!conv || conv.last_channel !== "telegram") return // Só funciona para Telegram

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token

      await fetch(`${apiUrl}/messages/typing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          conversation_id: selectedId,
        }),
      })
    } catch (error) {
      // Silencioso - typing não é crítico
      console.debug("Typing notification failed:", error)
    }
  }, [selectedId, conversations, supabase])

  // Carregar templates ao montar (conversas são carregadas pelo debounce effect)
  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  // IDs das conversas para o Realtime (1 conversa ou várias se contato)
  const realtimeConversationIds = useMemo(() => {
    if (contactChannels.length > 0) {
      return contactChannels.map(ch => ch.conversationId)
    }
    return selectedId ? [selectedId] : []
  }, [selectedId, contactChannels])

  // Handlers do Realtime
  const handleRealtimeInsert = useCallback((msg: RealtimeMessage) => {
    console.log("[Realtime] INSERT recebido:", msg.id, "direction:", msg.direction)
    
    // Toca som ANTES do setMessages para garantir que execute
    if (msg.direction === "inbound") {
      console.log("[Realtime] Tocando som de recebimento")
      playSound("receive")
    }
    
    setMessages(prev => {
      // Verifica se já existe (pelo ID ou se é uma msg temporária com mesmo texto/timestamp)
      const exists = prev.some(m => m.id === msg.id)
      if (exists) {
        // Já existe - apenas atualiza (pode ter vindo do optimistic update)
        return prev.map(m => m.id === msg.id ? { ...m, ...msg, sending_status: "sent" as const } : m)
      }
      // Nova mensagem - adiciona no final
      return [...prev, { ...msg, attachments: [] }]
    })
    // Atualiza lista de conversas (nova mensagem = conversa sobe no topo)
    loadConversations(searchQueryRef.current)
  }, [loadConversations, playSound])

  const handleRealtimeUpdate = useCallback((msg: RealtimeMessage) => {
    console.log("[Realtime] UPDATE recebido:", msg.id)
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, ...msg } : m))
  }, [])

  const handleRealtimeDelete = useCallback((msg: RealtimeMessage) => {
    console.log("[Realtime] DELETE recebido:", msg.id)
    // Soft delete - marca deleted_at
    setMessages(prev => prev.map(m => 
      m.id === msg.id ? { ...m, deleted_at: msg.deleted_at } : m
    ))
  }, [])

  // Hook de Realtime para mensagens
  const { isConnected: isRealtimeConnected } = useRealtimeMessages({
    conversationIds: realtimeConversationIds,
    enabled: realtimeConversationIds.length > 0,
    onInsert: handleRealtimeInsert,
    onUpdate: handleRealtimeUpdate,
    onDelete: handleRealtimeDelete,
  })

  // Realtime para conversas (substitui polling de 30s)
  // OTIMIZAÇÃO: Usa ref para evitar re-subscribe quando loadConversations/searchQuery mudam
  // Também adiciona debounce de 1s para evitar múltiplas queries em rajada
  const realtimeDebounceRef = useRef<NodeJS.Timeout | null>(null)
  useEffect(() => {
    if (!currentWorkspace?.id) return

    const channel = supabase
      .channel(`conversations-${currentWorkspace.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `workspace_id=eq.${currentWorkspace.id}`,
        },
        () => {
          // Debounce: evita múltiplas queries em rajada (ex: várias msgs chegando)
          if (realtimeDebounceRef.current) {
            clearTimeout(realtimeDebounceRef.current)
          }
          realtimeDebounceRef.current = setTimeout(() => {
            loadConversationsRef.current(searchQueryRef.current)
          }, 30000) // 30s debounce - meta <5k queries/dia
        }
      )
      .subscribe()

    return () => {
      if (realtimeDebounceRef.current) {
        clearTimeout(realtimeDebounceRef.current)
      }
      supabase.removeChannel(channel)
    }
  }, [currentWorkspace?.id, supabase]) // Removido searchQuery e loadConversations das deps!

  // Realtime para read status (substitui polling de 3s)
  // OTIMIZAÇÃO: Usa ref para conversations, busca inicial apenas 1x
  // Realtime usa payload direto em vez de refetch completo
  const conversationsRef = useRef(conversations)
  useEffect(() => { conversationsRef.current = conversations }, [conversations])
  
  // Ref para armazenar mapeamento message_id -> conversation_id
  const msgToConvRef = useRef<Record<string, string>>({})
  
  useEffect(() => {
    if (!currentWorkspace?.id) return

    // Busca inicial única (apenas 1x no mount)
    const fetchReadStatusInitial = async () => {
      const convs = conversationsRef.current
      if (convs.length === 0) return
      
      try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        const convIds = convs
          .filter(c => c.last_message_at && c.last_message_at > thirtyDaysAgo)
          .map(c => c.id)

        if (convIds.length === 0) return

        const { data: lastMessages } = await supabase
          .from("messages")
          .select("id, conversation_id, direction")
          .in("conversation_id", convIds)
          .is("deleted_at", null)
          .order("sent_at", { ascending: false })

        if (!lastMessages) return

        // Mapeia última msg total (para direção) e última OUTBOUND (para read status)
        const lastMsgByConv: Record<string, { id: string; direction: string }> = {}
        const lastOutboundByConv: Record<string, string> = {}

        for (const msg of lastMessages) {
          // Última msg total (para mostrar direção na lista)
          if (!lastMsgByConv[msg.conversation_id]) {
            lastMsgByConv[msg.conversation_id] = { id: msg.id, direction: msg.direction }
          }
          // Última msg OUTBOUND (para verificar read status)
          if (msg.direction === "outbound" && !lastOutboundByConv[msg.conversation_id]) {
            lastOutboundByConv[msg.conversation_id] = msg.id
            // Salva mapeamento para uso no realtime
            msgToConvRef.current[msg.id] = msg.conversation_id
          }
        }

        const directions: Record<string, "inbound" | "outbound"> = {}
        for (const [convId, msg] of Object.entries(lastMsgByConv)) {
          directions[convId] = msg.direction as "inbound" | "outbound"
        }
        setLastMessageDirections(directions)

        const outboundMsgIds = Object.values(lastOutboundByConv)

        if (outboundMsgIds.length === 0) {
          setReadConversationIds(new Set())
          return
        }

        const { data: readEvents } = await supabase
          .from("message_events")
          .select("message_id")
          .in("message_id", outboundMsgIds)
          .eq("type", "read")

        if (readEvents) {
          const readMsgIds = new Set(readEvents.map(e => e.message_id))
          const readConvIds = new Set<string>()
          for (const [convId, msgId] of Object.entries(lastOutboundByConv)) {
            if (readMsgIds.has(msgId)) {
              readConvIds.add(convId)
            }
          }
          setReadConversationIds(readConvIds)
        }
      } catch (err) {
        // Ignora erros
      }
    }

    // Busca inicial com pequeno delay para aguardar conversations carregar
    const initTimer = setTimeout(fetchReadStatusInitial, 500)

    // Realtime: usa payload direto, sem refetch!
    const channel = supabase
      .channel(`read-status-${currentWorkspace.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_events",
        },
        (payload) => {
          const newEvent = payload.new as { type: string; message_id: string }
          if (newEvent.type === "read") {
            // OTIMIZAÇÃO: Usa payload direto, não refetch!
            const convId = msgToConvRef.current[newEvent.message_id]
            if (convId) {
              setReadConversationIds(prev => new Set([...prev, convId]))
            }
          }
        }
      )
      .subscribe()

    return () => {
      clearTimeout(initTimer)
      supabase.removeChannel(channel)
    }
  }, [currentWorkspace?.id, supabase]) // Removido conversations das deps!

  // Realtime para presence status (online/offline) - substitui polling de 3s
  // OTIMIZAÇÃO: Usa payload direto do Realtime, não refetch!
  useEffect(() => {
    if (!currentWorkspace?.id) return

    // Busca inicial única (apenas 1x no mount)
    const fetchPresenceStatusInitial = async () => {
      const convs = conversationsRef.current
      if (convs.length === 0) return
      
      try {
        const identityIds = convs
          .map(c => c.primary_identity_id)
          .filter((id): id is string => !!id)

        if (identityIds.length === 0) return

        const { data: presenceData } = await supabase
          .from("presence_status")
          .select("contact_identity_id, is_online, is_typing, typing_expires_at")
          .in("contact_identity_id", identityIds)

        if (presenceData) {
          const now = new Date()
          const onlineIds = new Set<string>()
          const typingIds = new Set<string>()
          
          for (const p of presenceData) {
            if (p.is_online) {
              onlineIds.add(p.contact_identity_id)
            }
            // Typing só é válido se não expirou
            if (p.is_typing && p.typing_expires_at) {
              const expiresAt = new Date(p.typing_expires_at)
              if (expiresAt > now) {
                typingIds.add(p.contact_identity_id)
              }
            }
          }
          
          setOnlineIdentityIds(onlineIds)
          setTypingIdentityIds(typingIds)
        } else {
          setOnlineIdentityIds(new Set())
          setTypingIdentityIds(new Set())
        }
      } catch (err) {
        // Ignora erros
      }
    }

    // Busca inicial com delay
    const initTimer = setTimeout(fetchPresenceStatusInitial, 600)

    // Realtime: usa payload direto, sem refetch!
    const channel = supabase
      .channel(`presence-list-${currentWorkspace.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "presence_status",
        },
        (payload) => {
          // OTIMIZAÇÃO: Usa payload direto!
          const data = payload.new as { contact_identity_id: string; is_online?: boolean; is_typing?: boolean; typing_expires_at?: string } | null
          const oldData = payload.old as { contact_identity_id: string } | null
          
          if (payload.eventType === "DELETE" && oldData) {
            // Removido - considera offline
            setOnlineIdentityIds(prev => {
              const next = new Set(prev)
              next.delete(oldData.contact_identity_id)
              return next
            })
            setTypingIdentityIds(prev => {
              const next = new Set(prev)
              next.delete(oldData.contact_identity_id)
              return next
            })
          } else if (data) {
            // INSERT ou UPDATE - atualiza diretamente
            const identityId = data.contact_identity_id
            
            // Online status
            setOnlineIdentityIds(prev => {
              const next = new Set(prev)
              if (data.is_online) {
                next.add(identityId)
              } else {
                next.delete(identityId)
              }
              return next
            })
            
            // Typing status com auto-clear
            const now = new Date()
            const typingExpired = data.typing_expires_at
              ? new Date(data.typing_expires_at) < now
              : true

            if (data.is_typing && !typingExpired) {
              setTypingIdentityIds(prev => {
                const next = new Set(prev)
                next.add(identityId)
                return next
              })

              // Auto-clear quando typing_expires_at passar
              if (data.typing_expires_at) {
                const delay = new Date(data.typing_expires_at).getTime() - now.getTime()
                if (delay > 0) {
                  setTimeout(() => {
                    setTypingIdentityIds(prev => {
                      const next = new Set(prev)
                      next.delete(identityId)
                      return next
                    })
                  }, delay + 100) // +100ms margem
                }
              }
            } else {
              setTypingIdentityIds(prev => {
                const next = new Set(prev)
                next.delete(identityId)
                return next
              })
            }
          }
        }
      )
      .subscribe()

    return () => {
      clearTimeout(initTimer)
      supabase.removeChannel(channel)
    }
  }, [currentWorkspace?.id, supabase]) // Removido conversations das deps!

  // Refs para callbacks do realtime (evita re-subscriptions)
  const loadConversationsRef = useRef(loadConversations)
  const loadMessagesRef = useRef(loadMessages)
  const loadContactMessagesRef = useRef(loadContactMessages)
  useEffect(() => { loadConversationsRef.current = loadConversations }, [loadConversations])
  useEffect(() => { loadMessagesRef.current = loadMessages }, [loadMessages])
  useEffect(() => { loadContactMessagesRef.current = loadContactMessages }, [loadContactMessages])

  // Realtime - novas mensagens (dependências mínimas para evitar loop)
  useEffect(() => {
    if (!currentWorkspace?.id) {
      console.log("[Realtime] Aguardando workspace...")
      return
    }

    console.log(`[Realtime] Iniciando subscription para workspace ${currentWorkspace.id}`)

    const channel = supabase
      .channel(`inbox-realtime-${currentWorkspace.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          console.log("[Realtime] Nova mensagem:", payload.new)
          const newMsg = payload.new as Message
          const currContactId = selectedContactIdRef.current
          const currChannels = contactChannelsRef.current
          const currSelectedId = selectedIdRef.current

          // Atualiza mapeamento para read status funcionar em novas mensagens
          msgToConvRef.current[newMsg.id] = newMsg.conversation_id
          setLastMessageDirections(prev => ({
            ...prev,
            [newMsg.conversation_id]: newMsg.direction as "inbound" | "outbound"
          }))

          // Se tem contato selecionado, verificar se msg é de qualquer conversa do contato
          if (currContactId && currChannels.some(ch => ch.conversationId === newMsg.conversation_id)) {
            loadContactMessagesRef.current(currContactId)
          } else if (newMsg.conversation_id === currSelectedId) {
            loadMessagesRef.current(currSelectedId)
          }
          loadConversationsRef.current(searchQueryRef.current)
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          console.log("[Realtime] Mensagem atualizada:", payload.new)
          const updatedMsg = payload.new as Message
          // Atualiza mensagem localmente sem recarregar tudo
          setMessages(prev => prev.map(m =>
            m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m
          ))
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "attachments" },
        (payload) => {
          console.log("[Realtime] Novo attachment:", payload.new)
          const att = payload.new as { message_id?: string }
          const currSelectedId = selectedIdRef.current
          const currContactId = selectedContactIdRef.current

          if (att.message_id && currSelectedId) {
            if (currContactId) {
              loadContactMessagesRef.current(currContactId)
            } else {
              loadMessagesRef.current(currSelectedId)
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `workspace_id=eq.${currentWorkspace.id}`,
        },
        (payload) => {
          console.log("[Realtime] Mudança em conversa:", payload)
          loadConversationsRef.current(searchQueryRef.current)
        }
      )
      .subscribe((status) => {
        console.log(`[Realtime] Status: ${status}`)
      })

    return () => {
      console.log("[Realtime] Removendo channel...")
      supabase.removeChannel(channel)
    }
  }, [supabase, currentWorkspace?.id]) // Dependências mínimas!

  // Busca conversa na lista ou usa cache (para quando muda de canal)
  const conversationFromList = useMemo(() =>
    conversations.find(c => c.id === selectedId),
    [conversations, selectedId]
  )

  // Usa cache apenas se o ID bate (evita mostrar conversa errada)
  const cachedIfMatches = cachedSelectedConversation?.id === selectedId ? cachedSelectedConversation : null
  const selectedConversation = conversationFromList || cachedIfMatches

  // Atualiza cache quando conversa está na lista (mantém dados frescos)
  useEffect(() => {
    if (conversationFromList) {
      setCachedSelectedConversation(conversationFromList)
    }
  }, [conversationFromList])

  // Determina display name para ChatView
  const getDisplayName = (conv: Conversation | null | undefined) => {
    if (!conv) return null
    if (conv.contact?.display_name) return conv.contact.display_name
    const meta = conv.primary_identity?.metadata
    // Email: display_name
    if (meta?.display_name) return meta.display_name
    // Telegram group: title
    if (meta?.title) return meta.title
    // Telegram user: first_name + last_name
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
      {/* Sidebar / Lista de Conversas */}
      {/* Mobile: fullscreen quando mobileView === "list" */}
      {/* Desktop: sempre visível com largura fixa */}
      <div
        className={`flex flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900
          ${mobileView === "list" ? "w-full" : "hidden"} 
          md:flex md:w-80 lg:w-96 xl:w-[420px] md:flex-shrink-0`}
      >
        {/* Header */}
        <div className="flex h-14 md:h-16 flex-shrink-0 items-center justify-between border-b border-zinc-200 px-3 md:px-4 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <SidebarMenu
              userEmail={userEmail}
              filterTags={filterTags}
              onFilterTagsChange={setFilterTags}
              filterMode={filterMode}
              onFilterModeChange={setFilterMode}
              onLogout={handleLogout}
            />
            <h1 className="text-xl md:text-lg font-bold md:font-semibold">Inbox</h1>
          </div>
          <div className="flex items-center gap-1 md:gap-2">
            <WorkspaceSelector compact />
            <ThemeToggle />
          </div>
        </div>

        {/* Search */}
        <div className="flex-shrink-0 px-3 py-2 md:p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 md:h-5 md:w-5 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar conversas..."
              className="w-full rounded-xl md:rounded-lg border-0 md:border md:border-zinc-300 bg-zinc-100 md:bg-white py-2.5 md:py-2.5 pl-10 md:pl-11 pr-4 text-base focus:bg-zinc-200 md:focus:bg-white md:focus:border-blue-500 focus:outline-none dark:bg-zinc-800 dark:md:border-zinc-700"
            />
          </div>
        </div>

        {/* Channel Tabs - scroll horizontal no mobile */}
        <div className="overflow-x-auto scrollbar-hide">
          <ChannelTabs
            selected={selectedChannel}
            onSelect={setSelectedChannel}
          />
        </div>

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
              onArchive={handleArchiveConversation}
              onUnarchive={handleUnarchiveConversation}
              onDelete={handleDeleteConversation}
              readConversationIds={readConversationIds}
              lastMessageDirections={lastMessageDirections}
              onlineIdentityIds={onlineIdentityIds}
              typingIdentityIds={typingIdentityIds}
            />
          )}
        </div>

      </div>

      {/* Chat View */}
      {/* Mobile: fullscreen quando mobileView === "chat" */}
      {/* Desktop: sempre visível, ocupa espaço restante */}
      <div 
        className={`flex flex-1 flex-col overflow-hidden
          ${mobileView === "chat" ? "w-full" : "hidden"}
          md:flex`}
      >
        <div className="flex-1 overflow-hidden">
          <ChatView
            onBackToList={handleBackToList}
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
            onSyncContacts={syncOpenPhoneContacts}
            showChannelIndicator={!!selectedContactId}
            availableChannels={contactChannels.map(ch => ({ type: ch.type, label: ch.type }))}
            selectedSendChannel={selectedSendChannel}
            onSendChannelChange={setSelectedSendChannel}
            onUnlinkContact={selectedId ? () => unlinkContact(selectedId) : undefined}
            onOpenUserChat={handleOpenUserChat}
            onSendWelcome={handleSendWelcome}
            welcomeTemplate={welcomeTemplate}
            workspaceId={currentWorkspace?.id}
            channel={selectedConversation?.last_channel}
            onOpenCRMPanel={() => setIsCRMPanelOpen(true)}
            onMessageUpdate={(messageId, updates) => {
              setMessages(prev => prev.map(m =>
                m.id === messageId ? { ...m, ...updates } : m
              ))
            }}
            onMessageDelete={(messageId) => {
              setMessages(prev => prev.filter(m => m.id !== messageId))
            }}
            onTyping={handleTyping}
          />
        </div>
      </div>

      {/* CRM Panel */}
      {isCRMPanelOpen && selectedId && (
        <CRMPanel
          conversationId={selectedId}
          contactId={selectedConversation?.contact_id || null}
          contactName={getDisplayName(selectedConversation)}
          identityId={selectedConversation?.primary_identity_id}
          identityValue={selectedConversation?.primary_identity?.value}
          onClose={() => setIsCRMPanelOpen(false)}
          onContactLinked={loadConversations}
          workspaceId={currentWorkspace?.id}
        />
      )}
    </div>
  )
}
