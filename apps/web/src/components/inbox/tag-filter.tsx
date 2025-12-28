"use client"

import { useState, useEffect, useCallback } from "react"
import { Tag as TagIcon, ChevronDown, X } from "lucide-react"
import { createClient } from "@/lib/supabase"

interface Tag {
  id: string
  name: string
  color: string
}

interface TagFilterProps {
  selectedTags: string[]
  onTagsChange: (tagIds: string[]) => void
}

export function TagFilter({ selectedTags, onTagsChange }: TagFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
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
    loadTags()
  }, [loadTags])

  const toggleTag = (tagId: string) => {
    if (selectedTags.includes(tagId)) {
      onTagsChange(selectedTags.filter(id => id !== tagId))
    } else {
      onTagsChange([...selectedTags, tagId])
    }
  }

  const clearFilters = () => {
    onTagsChange([])
  }

  const selectedTagObjects = allTags.filter(t => selectedTags.includes(t.id))

  return (
    <div className="relative px-4 pb-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
          selectedTags.length > 0
            ? "border-blue-300 bg-blue-50 text-blue-600 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
            : "border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        }`}
      >
        <div className="flex items-center gap-2">
          <TagIcon className="h-4 w-4" />
          {selectedTags.length === 0 ? (
            <span>Filtrar por tags</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {selectedTagObjects.map(tag => (
                <span
                  key={tag.id}
                  className="rounded px-1.5 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: tag.color + "30", color: tag.color }}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {selectedTags.length > 0 && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation()
                clearFilters()
              }}
              className="rounded p-0.5 hover:bg-blue-100 dark:hover:bg-blue-800 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </span>
          )}
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </div>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute left-4 right-4 top-full z-20 mt-1 rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
            <div className="max-h-48 overflow-y-auto p-2">
              {allTags.length === 0 ? (
                <p className="py-2 text-center text-sm text-zinc-500">
                  Nenhuma tag criada
                </p>
              ) : (
                <div className="space-y-1">
                  {allTags.map(tag => {
                    const isSelected = selectedTags.includes(tag.id)
                    return (
                      <button
                        key={tag.id}
                        onClick={() => toggleTag(tag.id)}
                        className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors ${
                          isSelected
                            ? "bg-blue-50 dark:bg-blue-900/30"
                            : "hover:bg-zinc-100 dark:hover:bg-zinc-700"
                        }`}
                      >
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="flex-1 text-left">{tag.name}</span>
                        {isSelected && (
                          <span className="text-xs text-blue-500">✓</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
