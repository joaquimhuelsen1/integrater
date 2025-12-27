"use client"

import { useState, useEffect, useRef } from "react"
import { Search, User, X, Check, Loader2 } from "lucide-react"

interface Contact {
  id: string
  display_name: string | null
  lead_stage: string
  metadata: Record<string, unknown>
}

interface ContactSelectorProps {
  selectedContactId: string | null
  selectedContact: { id: string; display_name: string | null } | null
  onSelect: (contact: Contact | null) => void
  disabled?: boolean
}

export function ContactSelector({
  selectedContactId,
  selectedContact,
  onSelect,
  disabled = false,
}: ContactSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [contacts, setContacts] = useState<Contact[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  // Busca contatos quando search muda
  useEffect(() => {
    const searchContacts = async () => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams({ limit: "20" })
        if (search.trim()) {
          params.set("search", search.trim())
        }

        const res = await fetch(`${API_URL}/contacts?${params}`)
        if (res.ok) {
          const data = await res.json()
          setContacts(data)
          setHighlightedIndex(0)
        }
      } catch (error) {
        console.error("Erro ao buscar contatos:", error)
      } finally {
        setIsLoading(false)
      }
    }

    const debounce = setTimeout(searchContacts, 300)
    return () => clearTimeout(debounce)
  }, [API_URL, search])

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "Enter" || e.key === "ArrowDown") {
        setIsOpen(true)
      }
      return
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setHighlightedIndex((prev) => Math.min(prev + 1, contacts.length - 1))
        break
      case "ArrowUp":
        e.preventDefault()
        setHighlightedIndex((prev) => Math.max(prev - 1, 0))
        break
      case "Enter":
        e.preventDefault()
        if (contacts[highlightedIndex]) {
          handleSelect(contacts[highlightedIndex])
        }
        break
      case "Escape":
        setIsOpen(false)
        break
    }
  }

  const handleSelect = (contact: Contact) => {
    onSelect(contact)
    setIsOpen(false)
    setSearch("")
  }

  const handleClear = () => {
    onSelect(null)
    setSearch("")
  }

  const getInitials = (name: string | null) => {
    if (!name) return "?"
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  const getAvatarColor = (id: string) => {
    const colors = [
      "bg-blue-500",
      "bg-green-500",
      "bg-purple-500",
      "bg-orange-500",
      "bg-pink-500",
      "bg-teal-500",
      "bg-indigo-500",
      "bg-red-500",
    ]
    const index = id.charCodeAt(0) % colors.length
    return colors[index]
  }

  // Se tem contato selecionado, mostra ele
  if (selectedContactId && selectedContact) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800/50">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium text-white ${getAvatarColor(
            selectedContact.id
          )}`}
        >
          {getInitials(selectedContact.display_name)}
        </div>
        <div className="flex-1">
          <div className="font-medium text-sm">
            {selectedContact.display_name || "Sem nome"}
          </div>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Buscar contato..."
          className="w-full rounded-lg border border-zinc-300 py-2 pl-10 pr-3 text-sm dark:border-zinc-700 dark:bg-zinc-800 disabled:opacity-50"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-zinc-400" />
        )}
      </div>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
          {contacts.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-zinc-500">
              {isLoading ? "Buscando..." : search ? "Nenhum contato encontrado" : "Digite para buscar"}
            </div>
          ) : (
            <ul className="py-1">
              {contacts.map((contact, index) => (
                <li key={contact.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(contact)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left ${
                      index === highlightedIndex
                        ? "bg-blue-50 dark:bg-blue-950/30"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium text-white ${getAvatarColor(
                        contact.id
                      )}`}
                    >
                      {getInitials(contact.display_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium text-sm">
                        {contact.display_name || "Sem nome"}
                      </div>
                      <div className="truncate text-xs text-zinc-500">
                        {contact.lead_stage === "new" ? "Novo" : contact.lead_stage}
                      </div>
                    </div>
                    {contact.id === selectedContactId && (
                      <Check className="h-4 w-4 text-blue-500" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Opção de criar sem contato */}
          <div className="border-t border-zinc-200 dark:border-zinc-700">
            <button
              type="button"
              onClick={() => {
                onSelect(null)
                setIsOpen(false)
              }}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-zinc-300 dark:border-zinc-600">
                <User className="h-4 w-4 text-zinc-400" />
              </div>
              <span>Criar sem vincular contato</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
