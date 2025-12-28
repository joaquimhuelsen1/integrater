"use client"

import { useState, useEffect, useCallback } from "react"
import { ArrowLeft, Search, Plus, Pencil, Trash2, X, User, Settings, MessageSquare, Mail, Phone, Unlink } from "lucide-react"
import Link from "next/link"
import { ThemeToggle } from "./theme-toggle"
import { useWorkspace } from "@/contexts/workspace-context"
import { createClient } from "@/lib/supabase"

interface Contact {
  id: string
  display_name: string
  lead_stage: string
  metadata: Record<string, unknown>
  created_at: string
  identities?: Identity[]
}

interface Identity {
  id: string
  type: string
  value: string
}

interface LinkedConversation {
  id: string
  last_channel: string
  last_message_at: string
  primary_identity?: {
    type: string
    value: string
    metadata?: Record<string, unknown>
  }
}

const channelIcons: Record<string, typeof MessageSquare> = {
  telegram: MessageSquare,
  email: Mail,
  openphone_sms: Phone,
}

const channelLabels: Record<string, string> = {
  telegram: "Telegram",
  email: "Email",
  openphone_sms: "SMS",
}

export function ContactsView() {
  const { currentWorkspace } = useWorkspace()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [editName, setEditName] = useState("")
  // Estado para gerenciar conversas vinculadas
  const [managingContact, setManagingContact] = useState<Contact | null>(null)
  const [linkedConversations, setLinkedConversations] = useState<LinkedConversation[]>([])
  const [isLoadingConversations, setIsLoadingConversations] = useState(false)

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
  const supabase = createClient()

  const loadContacts = useCallback(async () => {
    if (!currentWorkspace) return

    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("workspace_id", currentWorkspace.id)
      if (searchQuery) params.set("search", searchQuery)

      const res = await fetch(`${API_URL}/contacts?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setContacts(data)
      }
    } catch {
      console.error("Erro ao carregar contatos")
    } finally {
      setIsLoading(false)
    }
  }, [API_URL, searchQuery, currentWorkspace])

  useEffect(() => {
    loadContacts()
  }, [loadContacts])

  const createContact = async () => {
    if (!newName.trim() || !currentWorkspace) return

    try {
      const params = new URLSearchParams()
      params.set("workspace_id", currentWorkspace.id)

      const res = await fetch(`${API_URL}/contacts?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: newName.trim() }),
      })

      if (res.ok) {
        setNewName("")
        setIsCreating(false)
        loadContacts()
      }
    } catch {
      console.error("Erro ao criar contato")
    }
  }

  const updateContact = async () => {
    if (!editingContact || !editName.trim()) return

    try {
      const res = await fetch(`${API_URL}/contacts/${editingContact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: editName.trim() }),
      })

      if (res.ok) {
        setEditingContact(null)
        setEditName("")
        loadContacts()
      }
    } catch {
      console.error("Erro ao atualizar contato")
    }
  }

  const deleteContact = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este contato?")) return

    try {
      const res = await fetch(`${API_URL}/contacts/${id}`, {
        method: "DELETE",
      })

      if (res.ok) {
        loadContacts()
      }
    } catch {
      console.error("Erro ao excluir contato")
    }
  }

  const startEdit = (contact: Contact) => {
    setEditingContact(contact)
    setEditName(contact.display_name)
  }

  // Carregar conversas vinculadas a um contato
  const loadLinkedConversations = async (contactId: string) => {
    setIsLoadingConversations(true)
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, last_channel, last_message_at, contact_identities!primary_identity_id(type, value, metadata)")
        .eq("contact_id", contactId)
        .order("last_message_at", { ascending: false })

      if (!error && data) {
        const mapped = data.map((c: Record<string, unknown>) => ({
          ...c,
          primary_identity: c.contact_identities,
        })) as LinkedConversation[]
        setLinkedConversations(mapped)
      }
    } catch {
      console.error("Erro ao carregar conversas vinculadas")
    } finally {
      setIsLoadingConversations(false)
    }
  }

  // Abrir modal de gerenciamento
  const startManaging = (contact: Contact) => {
    setManagingContact(contact)
    loadLinkedConversations(contact.id)
  }

  // Desvincular conversa do contato
  const unlinkConversation = async (conversationId: string) => {
    if (!managingContact) return

    const { error } = await supabase
      .from("conversations")
      .update({ contact_id: null })
      .eq("id", conversationId)

    if (error) {
      console.error("Erro ao desvincular:", error)
      return
    }

    // Recarrega conversas vinculadas
    loadLinkedConversations(managingContact.id)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    })
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-xl font-semibold">Contatos</h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
            >
              <Plus className="h-4 w-4" />
              Novo Contato
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-6">
        {/* Search */}
        <div className="mb-6 relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar contatos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-10 pr-4 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>

        {/* Create Modal */}
        {isCreating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">Novo Contato</h3>
                <button
                  onClick={() => setIsCreating(false)}
                  className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">Nome</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Ex: João Silva"
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800"
                    autoFocus
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setIsCreating(false)}
                    className="rounded-md px-4 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={createContact}
                    disabled={!newName.trim()}
                    className="rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                  >
                    Criar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Manage Conversations Modal */}
        {managingContact && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  Conversas de {managingContact.display_name}
                </h3>
                <button
                  onClick={() => setManagingContact(null)}
                  className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {isLoadingConversations ? (
                <div className="py-8 text-center text-zinc-500">Carregando...</div>
              ) : linkedConversations.length === 0 ? (
                <div className="py-8 text-center text-zinc-500">
                  <MessageSquare className="mx-auto mb-2 h-8 w-8 text-zinc-300" />
                  <p>Nenhuma conversa vinculada</p>
                </div>
              ) : (
                <div className="max-h-96 space-y-2 overflow-y-auto">
                  {linkedConversations.map((conv) => {
                    const Icon = channelIcons[conv.last_channel] || MessageSquare
                    const channelLabel = channelLabels[conv.last_channel] || conv.last_channel
                    const identity = conv.primary_identity
                    const displayValue = identity?.value || "Sem identificação"

                    return (
                      <div
                        key={conv.id}
                        className="flex items-center justify-between rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                            <Icon className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{displayValue}</p>
                            <p className="text-xs text-zinc-500">{channelLabel}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => unlinkConversation(conv.id)}
                          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-900/20"
                          title="Desvincular"
                        >
                          <Unlink className="h-4 w-4" />
                          Desvincular
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => setManagingContact(null)}
                  className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editingContact && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">Editar Contato</h3>
                <button
                  onClick={() => setEditingContact(null)}
                  className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">Nome</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800"
                    autoFocus
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditingContact(null)}
                    className="rounded-md px-4 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={updateContact}
                    disabled={!editName.trim()}
                    className="rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Contacts List */}
        <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <p className="text-sm text-zinc-500">{contacts.length} contatos</p>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-zinc-500">Carregando...</div>
          ) : contacts.length === 0 ? (
            <div className="py-12 text-center text-zinc-500">
              <User className="mx-auto mb-3 h-12 w-12 text-zinc-300" />
              <p>Nenhum contato encontrado</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">{contact.display_name}</p>
                      <p className="text-xs text-zinc-500">
                        Criado em {formatDate(contact.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startManaging(contact)}
                      className="rounded p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                      title="Gerenciar conversas"
                    >
                      <Settings className="h-4 w-4 text-blue-500" />
                    </button>
                    <button
                      onClick={() => startEdit(contact)}
                      className="rounded p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4 text-zinc-500" />
                    </button>
                    <button
                      onClick={() => deleteContact(contact.id)}
                      className="rounded p-2 hover:bg-red-100 dark:hover:bg-red-900/30"
                      title="Excluir"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
