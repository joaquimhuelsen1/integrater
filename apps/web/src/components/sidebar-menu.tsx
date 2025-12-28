"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Menu,
  X,
  LayoutGrid,
  Users,
  FileText,
  Settings,
  Tag as TagIcon,
  ChevronRight,
  LogOut
} from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase"

interface Tag {
  id: string
  name: string
  color: string
}

interface SidebarMenuProps {
  userEmail: string
  filterTags: string[]
  onFilterTagsChange: (tags: string[]) => void
  onLogout: () => void
}

export function SidebarMenu({ userEmail, filterTags, onFilterTagsChange, onLogout }: SidebarMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showTagsSubmenu, setShowTagsSubmenu] = useState(false)
  const [allTags, setAllTags] = useState<Tag[]>([])

  const supabase = createClient()

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

  // Get initials from email
  const initials = (userEmail || "U").split("@")[0].slice(0, 2).toUpperCase()

  return (
    <>
      {/* Menu Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <Menu className="h-6 w-6 text-zinc-600 dark:text-zinc-400" />
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => {
            setIsOpen(false)
            setShowTagsSubmenu(false)
          }}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed left-0 top-0 z-50 h-full w-72 transform bg-white shadow-xl transition-transform duration-300 dark:bg-zinc-900 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header with user info */}
        <div className="bg-gradient-to-br from-blue-600 to-purple-600 p-4 pb-6">
          <button
            onClick={() => {
              setIsOpen(false)
              setShowTagsSubmenu(false)
            }}
            className="absolute right-2 top-2 rounded p-1 text-white/80 hover:bg-white/20 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="mt-4 flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-xl font-bold text-white">
              {initials}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-white">{userEmail}</p>
            </div>
          </div>
        </div>

        {/* Menu Items */}
        <div className="py-2">
          {/* Tags Filter */}
          <button
            onClick={() => setShowTagsSubmenu(!showTagsSubmenu)}
            className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <TagIcon className="h-5 w-5 text-orange-500" />
            <span className="flex-1">Filtrar por Tags</span>
            {filterTags.length > 0 && (
              <span className="rounded-full bg-blue-500 px-2 py-0.5 text-xs text-white">
                {filterTags.length}
              </span>
            )}
            <ChevronRight className={`h-4 w-4 text-zinc-400 transition-transform ${showTagsSubmenu ? "rotate-90" : ""}`} />
          </button>

          {/* Tags Submenu */}
          {showTagsSubmenu && (
            <div className="border-y border-zinc-100 bg-zinc-50 py-2 dark:border-zinc-800 dark:bg-zinc-800/50">
              {filterTags.length > 0 && (
                <button
                  onClick={clearFilters}
                  className="mb-2 ml-12 rounded bg-red-100 px-2 py-1 text-xs text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400"
                >
                  Limpar filtros
                </button>
              )}
              {allTags.length === 0 ? (
                <p className="px-12 py-2 text-sm text-zinc-500">Nenhuma tag criada</p>
              ) : (
                allTags.map(tag => {
                  const isSelected = filterTags.includes(tag.id)
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className={`flex w-full items-center gap-3 px-12 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 ${
                        isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                      }`}
                    >
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="flex-1">{tag.name}</span>
                      {isSelected && <span className="text-blue-500">✓</span>}
                    </button>
                  )
                })
              )}
            </div>
          )}

          <div className="my-2 border-t border-zinc-100 dark:border-zinc-800" />

          {/* CRM */}
          <Link
            href="/crm"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <LayoutGrid className="h-5 w-5 text-green-500" />
            <span>CRM</span>
          </Link>

          {/* Contacts */}
          <Link
            href="/contacts"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <Users className="h-5 w-5 text-blue-500" />
            <span>Contatos</span>
          </Link>

          {/* Logs */}
          <Link
            href="/logs"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <FileText className="h-5 w-5 text-purple-500" />
            <span>Logs</span>
          </Link>

          {/* Settings */}
          <Link
            href="/settings"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <Settings className="h-5 w-5 text-zinc-500" />
            <span>Configurações</span>
          </Link>

          <div className="my-2 border-t border-zinc-100 dark:border-zinc-800" />

          {/* Logout */}
          <button
            onClick={() => {
              setIsOpen(false)
              onLogout()
            }}
            className="flex w-full items-center gap-4 px-4 py-3 text-left text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <LogOut className="h-5 w-5" />
            <span>Sair</span>
          </button>
        </div>
      </div>
    </>
  )
}
