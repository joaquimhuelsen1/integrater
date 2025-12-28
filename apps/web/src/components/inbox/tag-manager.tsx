"use client"

import { useState, useEffect, useCallback } from "react"
import { Tag as TagIcon, Plus, X, Check, Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase"

interface Tag {
  id: string
  name: string
  color: string
}

interface TagManagerProps {
  conversationId: string
  currentTags: Tag[]
  onTagsChange: () => void
  variant?: "default" | "menu-item"
}

const PRESET_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#3b82f6", // blue
  "#8b5cf6", // purple
  "#ec4899", // pink
]

export function TagManager({ conversationId, currentTags, onTagsChange, variant = "default" }: TagManagerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [newTagName, setNewTagName] = useState("")
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[0])
  const [isCreating, setIsCreating] = useState(false)

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

  const toggleTag = async (tag: Tag) => {
    const isCurrentlyApplied = currentTags.some(t => t.id === tag.id)

    if (isCurrentlyApplied) {
      // Remove tag
      await supabase
        .from("conversation_tags")
        .delete()
        .eq("conversation_id", conversationId)
        .eq("tag_id", tag.id)
    } else {
      // Add tag
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) return

      await supabase
        .from("conversation_tags")
        .insert({
          owner_id: userData.user.id,
          conversation_id: conversationId,
          tag_id: tag.id,
        })
    }

    onTagsChange()
  }

  const createTag = async () => {
    if (!newTagName.trim()) return

    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return

    const { data, error } = await supabase
      .from("tags")
      .insert({
        owner_id: userData.user.id,
        name: newTagName.trim(),
        color: newTagColor,
      })
      .select()
      .single()

    if (!error && data) {
      // Apply to conversation
      await supabase
        .from("conversation_tags")
        .insert({
          owner_id: userData.user.id,
          conversation_id: conversationId,
          tag_id: data.id,
        })

      setNewTagName("")
      setIsCreating(false)
      loadTags()
      onTagsChange()
    }
  }

  const deleteTag = async (tagId: string) => {
    if (!confirm("Excluir esta tag? Ela será removida de todas as conversas.")) return

    // Remove de todas as conversas primeiro
    await supabase
      .from("conversation_tags")
      .delete()
      .eq("tag_id", tagId)

    // Remove a tag
    await supabase
      .from("tags")
      .delete()
      .eq("id", tagId)

    loadTags()
    onTagsChange()
  }

  const isMenuItem = variant === "menu-item"

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={isMenuItem
          ? "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
          : "flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        }
      >
        <TagIcon className={isMenuItem ? "h-4 w-4 text-orange-500" : "h-4 w-4"} />
        <span>Tags</span>
        {currentTags.length > 0 && (
          <span className={isMenuItem
            ? "ml-auto rounded-full bg-zinc-200 px-1.5 text-xs dark:bg-zinc-700"
            : "ml-1 rounded-full bg-zinc-200 px-1.5 text-xs dark:bg-zinc-700"
          }>
            {currentTags.length}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
            <div className="p-2">
              <div className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Tags aplicadas
              </div>

              {/* Current tags */}
              <div className="mb-3 flex flex-wrap gap-1">
                {currentTags.length === 0 ? (
                  <span className="text-xs text-zinc-400">Nenhuma tag</span>
                ) : (
                  currentTags.map(tag => (
                    <span
                      key={tag.id}
                      className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: tag.color + "20", color: tag.color }}
                    >
                      {tag.name}
                      <button
                        onClick={() => toggleTag(tag)}
                        className="hover:opacity-70"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>

              <div className="border-t border-zinc-100 pt-2 dark:border-zinc-700">
                <div className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Adicionar tag
                </div>

                {/* All tags */}
                <div className="max-h-32 space-y-1 overflow-y-auto">
                  {allTags
                    .filter(t => !currentTags.some(ct => ct.id === t.id))
                    .map(tag => (
                      <div key={tag.id} className="flex items-center gap-1">
                        <button
                          onClick={() => toggleTag(tag)}
                          className="flex flex-1 items-center gap-2 rounded px-2 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700"
                        >
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                          {tag.name}
                        </button>
                        <button
                          onClick={() => deleteTag(tag.id)}
                          className="rounded p-1 text-zinc-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30"
                          title="Excluir tag"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                </div>

                {/* Create new tag */}
                {isCreating ? (
                  <div className="mt-2 space-y-2 border-t border-zinc-100 pt-2 dark:border-zinc-700">
                    <input
                      type="text"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      placeholder="Nome da tag"
                      className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-700"
                      autoFocus
                    />
                    <div className="flex gap-1">
                      {PRESET_COLORS.map(color => (
                        <button
                          key={color}
                          onClick={() => setNewTagColor(color)}
                          className={`h-5 w-5 rounded-full ${newTagColor === color ? "ring-2 ring-offset-1 ring-blue-500" : ""}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={createTag}
                        className="flex items-center gap-1 rounded bg-blue-500 px-2 py-1 text-xs text-white hover:bg-blue-600"
                      >
                        <Check className="h-3 w-3" />
                        Criar
                      </button>
                      <button
                        onClick={() => setIsCreating(false)}
                        className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsCreating(true)}
                    className="mt-2 flex w-full items-center gap-1 rounded px-2 py-1 text-sm text-blue-500 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  >
                    <Plus className="h-4 w-4" />
                    Nova tag
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
