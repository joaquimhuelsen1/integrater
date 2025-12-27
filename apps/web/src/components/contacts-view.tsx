"use client"

import { useState, useEffect, useCallback } from "react"
import { ArrowLeft, Search, Plus, Pencil, Trash2, X, User } from "lucide-react"
import Link from "next/link"

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

export function ContactsView() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [editName, setEditName] = useState("")

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  const loadContacts = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
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
  }, [API_URL, searchQuery])

  useEffect(() => {
    loadContacts()
  }, [loadContacts])

  const createContact = async () => {
    if (!newName.trim()) return

    try {
      const res = await fetch(`${API_URL}/contacts`, {
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
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            <Plus className="h-4 w-4" />
            Novo Contato
          </button>
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
                  <div className="flex items-center gap-2">
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
