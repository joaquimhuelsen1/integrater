"use client"

import { useState, useEffect, useCallback } from "react"
import { UserPlus, Link2, X, Search, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase"

interface Contact {
  id: string
  display_name: string
}

interface ContactManagerProps {
  conversationId: string
  identityId: string | null
  identityValue: string | null
  onContactLinked: () => void
  apiUrl?: string
}

export function ContactManager({
  conversationId,
  identityId,
  identityValue,
  onContactLinked,
  apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
}: ContactManagerProps) {
  const supabase = createClient()
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<"create" | "link">("create")
  const [contacts, setContacts] = useState<Contact[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [newName, setNewName] = useState("")

  // Helper para obter token
  const getAuthHeaders = async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
  }

  // Carregar contatos para vincular
  const loadContacts = useCallback(async () => {
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`${apiUrl}/contacts?search=${searchQuery}`, { headers })
      if (res.ok) {
        const data = await res.json()
        setContacts(data)
      }
    } catch {
      console.error("Erro ao carregar contatos")
    }
  }, [apiUrl, searchQuery, supabase])

  useEffect(() => {
    if (isOpen && mode === "link") {
      loadContacts()
    }
  }, [isOpen, mode, loadContacts])

  // Criar novo contato
  const createContact = async () => {
    if (!newName.trim() || !identityId) return

    setIsLoading(true)
    try {
      const headers = await getAuthHeaders()

      // 1. Criar contato
      const createRes = await fetch(`${apiUrl}/contacts`, {
        method: "POST",
        headers,
        body: JSON.stringify({ display_name: newName.trim() }),
      })

      if (!createRes.ok) throw new Error("Erro ao criar contato")

      const contact = await createRes.json()

      // 2. Vincular identity ao contato
      await fetch(`${apiUrl}/contacts/${contact.id}/link-identity`, {
        method: "POST",
        headers,
        body: JSON.stringify({ identity_id: identityId }),
      })

      setIsOpen(false)
      setNewName("")
      onContactLinked()
    } catch (error) {
      console.error("Erro ao criar contato:", error)
    } finally {
      setIsLoading(false)
    }
  }

  // Vincular a contato existente
  const linkToContact = async (contactId: string) => {
    if (!identityId) return

    setIsLoading(true)
    try {
      const headers = await getAuthHeaders()
      await fetch(`${apiUrl}/contacts/${contactId}/link-identity`, {
        method: "POST",
        headers,
        body: JSON.stringify({ identity_id: identityId }),
      })

      setIsOpen(false)
      onContactLinked()
    } catch (error) {
      console.error("Erro ao vincular contato:", error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      {/* Banner */}
      <div className="mx-4 mt-3 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span className="text-sm text-amber-700 dark:text-amber-300">
            Conversa sem contato vinculado
            {identityValue && (
              <span className="ml-1 text-amber-600 dark:text-amber-400">
                ({identityValue})
              </span>
            )}
          </span>
        </div>
        <button
          onClick={() => setIsOpen(true)}
          className="rounded-md bg-amber-600 px-3 py-1 text-sm font-medium text-white hover:bg-amber-700"
        >
          Vincular
        </button>
      </div>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Vincular Contato</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="mb-4 flex gap-2">
              <button
                onClick={() => setMode("create")}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
                  mode === "create"
                    ? "bg-blue-500 text-white"
                    : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                <UserPlus className="mr-2 inline-block h-4 w-4" />
                Criar Novo
              </button>
              <button
                onClick={() => setMode("link")}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
                  mode === "link"
                    ? "bg-blue-500 text-white"
                    : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                <Link2 className="mr-2 inline-block h-4 w-4" />
                Vincular Existente
              </button>
            </div>

            {mode === "create" ? (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Nome do Contato
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Ex: João Silva"
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </div>
                {identityValue && (
                  <p className="text-sm text-zinc-500">
                    Identidade: <span className="font-medium">{identityValue}</span>
                  </p>
                )}
                <button
                  onClick={createContact}
                  disabled={!newName.trim() || isLoading}
                  className="w-full rounded-md bg-blue-500 px-4 py-2 font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  ) : (
                    "Criar Contato"
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar contatos..."
                    className="w-full rounded-md border border-zinc-300 py-2 pl-10 pr-4 dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {contacts.length === 0 ? (
                    <p className="py-4 text-center text-sm text-zinc-500">
                      Nenhum contato encontrado
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {contacts.map((contact) => (
                        <button
                          key={contact.id}
                          onClick={() => linkToContact(contact.id)}
                          disabled={isLoading}
                          className="w-full rounded-md border border-zinc-200 p-3 text-left hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        >
                          <span className="font-medium">{contact.display_name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
