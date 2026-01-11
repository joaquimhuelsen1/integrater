"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Menu,
  LayoutGrid,
  Users,
  FileText,
  Settings,
  ChevronRight,
  LogOut,
  Bookmark,
  ShoppingBag,
  Zap
} from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase"
import { useWorkspace } from "@/contexts/workspace-context"

interface Tag {
  id: string
  name: string
  color: string
}

// Modo de filtro: "any" = tem alguma das tags, "exact" = tem APENAS essas tags
export type TagFilterMode = "any" | "exact"

interface SidebarMenuProps {
  userEmail: string
  filterTags: string[]
  onFilterTagsChange: (tags: string[]) => void
  filterMode: TagFilterMode
  onFilterModeChange: (mode: TagFilterMode) => void
  onLogout: () => void
}

export function SidebarMenu({ userEmail, filterTags, onFilterTagsChange, filterMode, onFilterModeChange, onLogout }: SidebarMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showTagsSubmenu, setShowTagsSubmenu] = useState(false)
  const [allTags, setAllTags] = useState<Tag[]>([])
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const supabase = createClient()
  const { currentWorkspace } = useWorkspace()

  // Base path para links (com workspace na URL)
  const basePath = currentWorkspace ? `/${currentWorkspace.id}` : ""

  const loadTags = useCallback(async () => {
    const { data } = await supabase
      .from("tags")
      .select("id, name, color")
      .order("name")

    if (data) setAllTags(data)
  }, [supabase])

  useEffect(() => {
    if (isOpen) loadTags()
  }, [isOpen, loadTags])

  // Fechar ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
        setShowTagsSubmenu(false)
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen])

  const toggleTag = (tagId: string) => {
    if (filterTags.includes(tagId)) {
      onFilterTagsChange(filterTags.filter(id => id !== tagId))
    } else {
      onFilterTagsChange([...filterTags, tagId])
    }
  }

  const clearFilters = () => {
    onFilterTagsChange([])
  }

  // Get name from email
  const userName = userEmail?.split("@")[0] ?? "User"
  const displayName = userName.charAt(0).toUpperCase() + userName.slice(1)
  const initials = userName.slice(0, 2).toUpperCase()

  return (
    <div className="relative">
      {/* Menu Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <Menu className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
      </button>

      {/* Popup Menu */}
      {isOpen && (
        <div
          ref={menuRef}
          className="absolute left-0 top-full mt-2 z-50 w-64 rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          {/* User Profile Header */}
          <div className="flex items-center gap-3 border-b border-zinc-100 p-3 dark:border-zinc-800">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-sm font-medium text-white">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {displayName}
              </p>
            </div>
          </div>

          {/* Menu Items */}
          <div className="py-1">
            {/* Filtrar por Tags */}
            <button
              onClick={() => setShowTagsSubmenu(!showTagsSubmenu)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Bookmark className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
              <span className="flex-1 text-sm">Filtrar por Tags</span>
              {filterTags.length > 0 && (
                <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-xs text-white">
                  {filterTags.length}
                </span>
              )}
              <ChevronRight className={`h-4 w-4 text-zinc-400 transition-transform ${showTagsSubmenu ? "rotate-90" : ""}`} />
            </button>

            {/* Tags Submenu */}
            {showTagsSubmenu && (
              <div className="border-b border-zinc-100 bg-zinc-50 py-1 dark:border-zinc-800 dark:bg-zinc-800/50">
                {/* Modo de filtro */}
                <div className="flex items-center gap-1 px-4 py-1.5 mb-1">
                  <button
                    onClick={() => onFilterModeChange("any")}
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                      filterMode === "any"
                        ? "bg-emerald-500 text-white"
                        : "bg-zinc-200 text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    Contém
                  </button>
                  <button
                    onClick={() => onFilterModeChange("exact")}
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                      filterMode === "exact"
                        ? "bg-purple-500 text-white"
                        : "bg-zinc-200 text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    Apenas
                  </button>
                  {filterTags.length > 0 && (
                    <button
                      onClick={clearFilters}
                      className="ml-auto rounded bg-red-100 px-2 py-0.5 text-xs text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400"
                    >
                      Limpar
                    </button>
                  )}
                </div>
                {allTags.length === 0 ? (
                  <p className="px-10 py-2 text-sm text-zinc-500">Nenhuma tag</p>
                ) : (
                  <div className="max-h-32 overflow-y-auto">
                    {allTags.map(tag => {
                      const isSelected = filterTags.includes(tag.id)
                      return (
                        <button
                          key={tag.id}
                          onClick={() => toggleTag(tag.id)}
                          className={`flex w-full items-center gap-2 px-10 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 ${
                            isSelected ? "bg-emerald-50 dark:bg-emerald-900/20" : ""
                          }`}
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                          <span className="flex-1 truncate">{tag.name}</span>
                          {isSelected && <span className="text-emerald-500 text-xs">✓</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Contacts */}
            <Link
              href={`${basePath}/contacts`}
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Users className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
              <span className="text-sm">Contatos</span>
            </Link>

            {/* CRM */}
            <Link
              href={`${basePath}/crm`}
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <LayoutGrid className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
              <span className="text-sm">CRM</span>
            </Link>

            {/* Automacoes */}
            <Link
              href={`${basePath}/crm/automations`}
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Zap className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
              <span className="text-sm">Automacoes</span>
            </Link>

            {/* Compradores */}
            <Link
              href={`${basePath}/buyers`}
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <ShoppingBag className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
              <span className="text-sm">Compradores</span>
            </Link>

            {/* Settings */}
            <Link
              href={`${basePath}/settings`}
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Settings className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
              <span className="text-sm">Configurações</span>
            </Link>

            {/* Logs - mantém global */}
            <Link
              href="/logs"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <FileText className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
              <span className="text-sm">Logs</span>
            </Link>

            <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />

            {/* Logout */}
            <button
              onClick={() => {
                setIsOpen(false)
                onLogout()
              }}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <LogOut className="h-4 w-4" />
              <span className="text-sm">Sair</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
