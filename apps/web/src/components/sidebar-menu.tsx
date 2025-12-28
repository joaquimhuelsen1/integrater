"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Menu,
  LayoutGrid,
  Users,
  FileText,
  Settings,
  Tag as TagIcon,
  ChevronRight,
  LogOut,
  Bookmark,
  MoreHorizontal
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
  const [showMoreSubmenu, setShowMoreSubmenu] = useState(false)
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

  // Get name from email
  const userName = userEmail?.split("@")[0] ?? "User"
  const displayName = userName.charAt(0).toUpperCase() + userName.slice(1)
  const initials = userName.slice(0, 2).toUpperCase()

  return (
    <>
      {/* Menu Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <Menu className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => {
            setIsOpen(false)
            setShowTagsSubmenu(false)
            setShowMoreSubmenu(false)
          }}
        />
      )}

      {/* Sidebar - Telegram Style */}
      <div
        className={`fixed left-0 top-0 z-50 h-full w-72 transform bg-white shadow-xl transition-transform duration-200 dark:bg-zinc-900 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* User Profile Header */}
        <div className="flex items-center gap-3 border-b border-zinc-100 p-4 dark:border-zinc-800">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-sm font-medium text-white">
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
          {/* Saved Messages / Filtros */}
          <button
            onClick={() => setShowTagsSubmenu(!showTagsSubmenu)}
            className="flex w-full items-center gap-4 px-4 py-2.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <Bookmark className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
            <span className="flex-1 text-sm">Filtrar por Tags</span>
            {filterTags.length > 0 && (
              <span className="rounded-full bg-blue-500 px-1.5 py-0.5 text-xs text-white">
                {filterTags.length}
              </span>
            )}
            <ChevronRight className={`h-4 w-4 text-zinc-400 transition-transform ${showTagsSubmenu ? "rotate-90" : ""}`} />
          </button>

          {/* Tags Submenu */}
          {showTagsSubmenu && (
            <div className="border-b border-zinc-100 bg-zinc-50 py-1 dark:border-zinc-800 dark:bg-zinc-800/50">
              {filterTags.length > 0 && (
                <button
                  onClick={clearFilters}
                  className="mb-1 ml-12 rounded bg-red-100 px-2 py-0.5 text-xs text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400"
                >
                  Limpar filtros
                </button>
              )}
              {allTags.length === 0 ? (
                <p className="px-12 py-2 text-sm text-zinc-500">Nenhuma tag</p>
              ) : (
                allTags.map(tag => {
                  const isSelected = filterTags.includes(tag.id)
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className={`flex w-full items-center gap-3 px-12 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 ${
                        isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="flex-1">{tag.name}</span>
                      {isSelected && <span className="text-blue-500 text-xs">✓</span>}
                    </button>
                  )
                })
              )}
            </div>
          )}

          {/* Contacts */}
          <Link
            href="/contacts"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-4 px-4 py-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <Users className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
            <span className="text-sm">Contatos</span>
          </Link>

          {/* Settings */}
          <Link
            href="/settings"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-4 px-4 py-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <Settings className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
            <span className="text-sm">Configurações</span>
          </Link>

          {/* More */}
          <button
            onClick={() => setShowMoreSubmenu(!showMoreSubmenu)}
            className="flex w-full items-center gap-4 px-4 py-2.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <MoreHorizontal className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
            <span className="flex-1 text-sm">Mais</span>
            <ChevronRight className={`h-4 w-4 text-zinc-400 transition-transform ${showMoreSubmenu ? "rotate-90" : ""}`} />
          </button>

          {/* More Submenu */}
          {showMoreSubmenu && (
            <div className="border-b border-zinc-100 bg-zinc-50 py-1 dark:border-zinc-800 dark:bg-zinc-800/50">
              {/* CRM */}
              <Link
                href="/crm"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 px-12 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700"
              >
                <LayoutGrid className="h-4 w-4 text-zinc-500" />
                <span>CRM</span>
              </Link>

              {/* Logs */}
              <Link
                href="/logs"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 px-12 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700"
              >
                <FileText className="h-4 w-4 text-zinc-500" />
                <span>Logs</span>
              </Link>
            </div>
          )}

          <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />

          {/* Logout */}
          <button
            onClick={() => {
              setIsOpen(false)
              onLogout()
            }}
            className="flex w-full items-center gap-4 px-4 py-2.5 text-left text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <LogOut className="h-5 w-5" />
            <span className="text-sm">Sair</span>
          </button>
        </div>
      </div>
    </>
  )
}
