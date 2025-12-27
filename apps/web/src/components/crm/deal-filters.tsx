"use client"

import { useState, useEffect, useRef } from "react"
import { Search, Calendar, Tag, Filter, X, ChevronDown } from "lucide-react"

interface DealTag {
  id: string
  name: string
  color: string
}

interface Stage {
  id: string
  name: string
  color: string
}

export interface DealFiltersState {
  search: string
  dateFrom: string
  dateTo: string
  tagIds: string[]
  stageIds: string[]
  showWon: boolean
  showLost: boolean
}

interface DealFiltersProps {
  filters: DealFiltersState
  onFiltersChange: (filters: DealFiltersState) => void
  stages: Stage[]
  tags: DealTag[]
  onClear: () => void
}

export const defaultFilters: DealFiltersState = {
  search: "",
  dateFrom: "",
  dateTo: "",
  tagIds: [],
  stageIds: [],
  showWon: true,
  showLost: true,
}

export function DealFilters({
  filters,
  onFiltersChange,
  stages,
  tags,
  onClear,
}: DealFiltersProps) {
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTagSelector, setShowTagSelector] = useState(false)
  const [showStageSelector, setShowStageSelector] = useState(false)
  const [showMoreFilters, setShowMoreFilters] = useState(false)

  const dateRef = useRef<HTMLDivElement>(null)
  const tagRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dateRef.current && !dateRef.current.contains(e.target as Node)) {
        setShowDatePicker(false)
      }
      if (tagRef.current && !tagRef.current.contains(e.target as Node)) {
        setShowTagSelector(false)
      }
      if (stageRef.current && !stageRef.current.contains(e.target as Node)) {
        setShowStageSelector(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const hasActiveFilters =
    filters.search ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.tagIds.length > 0 ||
    filters.stageIds.length > 0 ||
    !filters.showWon ||
    !filters.showLost

  const toggleTag = (tagId: string) => {
    const newTagIds = filters.tagIds.includes(tagId)
      ? filters.tagIds.filter((id) => id !== tagId)
      : [...filters.tagIds, tagId]
    onFiltersChange({ ...filters, tagIds: newTagIds })
  }

  const toggleStage = (stageId: string) => {
    const newStageIds = filters.stageIds.includes(stageId)
      ? filters.stageIds.filter((id) => id !== stageId)
      : [...filters.stageIds, stageId]
    onFiltersChange({ ...filters, stageIds: newStageIds })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          value={filters.search}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          placeholder="Buscar deals..."
          className="w-48 rounded-lg border border-zinc-300 py-1.5 pl-8 pr-3 text-sm dark:border-zinc-700 dark:bg-zinc-800"
        />
        {filters.search && (
          <button
            onClick={() => onFiltersChange({ ...filters, search: "" })}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Date Range */}
      <div ref={dateRef} className="relative">
        <button
          onClick={() => setShowDatePicker(!showDatePicker)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${
            filters.dateFrom || filters.dateTo
              ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          }`}
        >
          <Calendar className="h-4 w-4" />
          {filters.dateFrom || filters.dateTo ? (
            <span>
              {filters.dateFrom && new Date(filters.dateFrom).toLocaleDateString("pt-BR")}
              {filters.dateFrom && filters.dateTo && " - "}
              {filters.dateTo && new Date(filters.dateTo).toLocaleDateString("pt-BR")}
            </span>
          ) : (
            <span>Data</span>
          )}
          <ChevronDown className="h-3 w-3" />
        </button>

        {showDatePicker && (
          <div className="absolute left-0 top-full z-20 mt-1 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
            <div className="flex flex-col gap-2">
              <div>
                <label className="text-xs text-zinc-500">De</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => onFiltersChange({ ...filters, dateFrom: e.target.value })}
                  className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-700"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500">Ate</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => onFiltersChange({ ...filters, dateTo: e.target.value })}
                  className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-700"
                />
              </div>
              {(filters.dateFrom || filters.dateTo) && (
                <button
                  onClick={() => onFiltersChange({ ...filters, dateFrom: "", dateTo: "" })}
                  className="text-xs text-red-500 hover:text-red-600"
                >
                  Limpar datas
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div ref={tagRef} className="relative">
          <button
            onClick={() => setShowTagSelector(!showTagSelector)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${
              filters.tagIds.length > 0
                ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            }`}
          >
            <Tag className="h-4 w-4" />
            <span>Tags {filters.tagIds.length > 0 && `(${filters.tagIds.length})`}</span>
            <ChevronDown className="h-3 w-3" />
          </button>

          {showTagSelector && (
            <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-48 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 ${
                    filters.tagIds.includes(tag.id) ? "bg-blue-50 dark:bg-blue-900/30" : ""
                  }`}
                >
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="flex-1 text-left">{tag.name}</span>
                  {filters.tagIds.includes(tag.id) && (
                    <span className="text-blue-500">✓</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stages */}
      <div ref={stageRef} className="relative">
        <button
          onClick={() => setShowStageSelector(!showStageSelector)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${
            filters.stageIds.length > 0
              ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          }`}
        >
          <Filter className="h-4 w-4" />
          <span>Etapas {filters.stageIds.length > 0 && `(${filters.stageIds.length})`}</span>
          <ChevronDown className="h-3 w-3" />
        </button>

        {showStageSelector && (
          <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-48 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
            {stages.map((stage) => (
              <button
                key={stage.id}
                onClick={() => toggleStage(stage.id)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 ${
                  filters.stageIds.includes(stage.id) ? "bg-blue-50 dark:bg-blue-900/30" : ""
                }`}
              >
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: stage.color }}
                />
                <span className="flex-1 text-left">{stage.name}</span>
                {filters.stageIds.includes(stage.id) && (
                  <span className="text-blue-500">✓</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* More Filters (Won/Lost toggle) */}
      <div className="relative">
        <button
          onClick={() => setShowMoreFilters(!showMoreFilters)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${
            !filters.showWon || !filters.showLost
              ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          }`}
        >
          <span>Status</span>
          <ChevronDown className="h-3 w-3" />
        </button>

        {showMoreFilters && (
          <div className="absolute left-0 top-full z-20 mt-1 w-40 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
            <label className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700">
              <input
                type="checkbox"
                checked={filters.showWon}
                onChange={(e) => onFiltersChange({ ...filters, showWon: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm">Mostrar Ganhos</span>
            </label>
            <label className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700">
              <input
                type="checkbox"
                checked={filters.showLost}
                onChange={(e) => onFiltersChange({ ...filters, showLost: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm">Mostrar Perdidos</span>
            </label>
          </div>
        )}
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <button
          onClick={onClear}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
        >
          <X className="h-4 w-4" />
          Limpar
        </button>
      )}

      {/* Active Filters Pills */}
      {filters.tagIds.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {filters.tagIds.map((tagId) => {
            const tag = tags.find((t) => t.id === tagId)
            if (!tag) return null
            return (
              <span
                key={tagId}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-white"
                style={{ backgroundColor: tag.color }}
              >
                {tag.name}
                <button onClick={() => toggleTag(tagId)}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
