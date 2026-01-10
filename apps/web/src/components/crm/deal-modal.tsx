"use client"

import { useState, useEffect, useCallback } from "react"
import {
  X,
  Trash2,
  Trophy,
  XCircle,
  Plus,
  Package,
  User,
  DollarSign,
  Tag,
  FileText,
  History,
  ChevronDown,
  Maximize2,
  Minimize2,
  RotateCcw,
  Upload,
  File,
  MoreVertical,
  Archive,
  Send,
} from "lucide-react"
import { ContactSelector } from "./contact-selector"
import { DealTimeline } from "./deal-timeline"
import { ProductSelector } from "./product-selector"
import { apiFetch } from "@/lib/api"

interface Stage {
  id: string
  name: string
  color: string
  position: number
  is_win: boolean
  is_loss: boolean
}

interface Deal {
  id: string
  title: string
  value: number
  probability: number
  expected_close_date: string | null
  stage_id: string
  contact_id: string | null
  conversation_id: string | null
  contact?: { id: string; display_name: string | null; metadata?: Record<string, unknown> } | null
  won_at: string | null
  lost_at: string | null
  lost_reason: string | null
  custom_fields: Record<string, unknown>
  info: string | null
  created_at: string
  updated_at: string
  products?: { id: string; name: string; value: number }[]
  products_total?: number
}

interface DealTag {
  id: string
  name: string
  color: string
}

interface DealFile {
  id: string
  name: string
  file_url: string
  file_size: number | null
  mime_type: string | null
  created_at: string
}

interface DealModalProps {
  dealId: string | null
  pipelineId: string
  initialStageId: string | null
  stages: Stage[]
  onClose: () => void
  onSave: () => void
  onSendMessage?: (dealId: string) => void
}

type TabType = "activity" | "notes" | "products" | "files"

export function DealModal({
  dealId,
  pipelineId,
  initialStageId,
  stages,
  onClose,
  onSave,
  onSendMessage,
}: DealModalProps) {
  const [deal, setDeal] = useState<Deal | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("dealModalFullscreen") === "true"
    }
    return false
  })

  // Form fields
  const [title, setTitle] = useState("")
  const [value, setValue] = useState("")
  const [stageId, setStageId] = useState(initialStageId || "")
  const [contactId, setContactId] = useState<string | null>(null)
  const [selectedContact, setSelectedContact] = useState<Deal["contact"]>(null)
  const [info, setInfo] = useState<string | null>(null)

  // Tabs
  const [activeTab, setActiveTab] = useState<TabType>("activity")

  // Produtos
  const [products, setProducts] = useState<{ id: string; name: string; value: number; product_id?: string }[]>([])
  const [productsTotal, setProductsTotal] = useState(0)
  const [showProductSelector, setShowProductSelector] = useState(false)
  const [showManualProduct, setShowManualProduct] = useState(false)
  const [newProductName, setNewProductName] = useState("")
  const [newProductValue, setNewProductValue] = useState("")
  const [isAddingProduct, setIsAddingProduct] = useState(false)

  // Tags
  const [tags, setTags] = useState<DealTag[]>([])
  const [allTags, setAllTags] = useState<DealTag[]>([])
  const [showTagSelector, setShowTagSelector] = useState(false)

  // Files
  const [files, setFiles] = useState<DealFile[]>([])
  const [isUploadingFile, setIsUploadingFile] = useState(false)

  // Notes
  const [noteContent, setNoteContent] = useState("")
  const [isSavingNote, setIsSavingNote] = useState(false)
  const [timelineKey, setTimelineKey] = useState(0)

  // Editing states
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [isEditingValue, setIsEditingValue] = useState(false)
  
  // Menu dropdown
  const [showMoreMenu, setShowMoreMenu] = useState(false)

  const isNew = !dealId
  const isWon = !!deal?.won_at
  const isLost = !!deal?.lost_at
  const isClosed = isWon || isLost

  // Sort stages by position
  const sortedStages = [...stages].sort((a, b) => a.position - b.position)

  // Calculate time in current stage (mock - would need real data)
  const getTimeInStage = (stageId: string) => {
    // TODO: Calculate real time from stage change activities
    return "0 dias"
  }

  const loadDeal = useCallback(async () => {
    if (!dealId) return

    setIsLoading(true)
    try {
      const [dealRes, tagsRes, filesRes, allTagsRes] = await Promise.all([
        apiFetch(`/deals/${dealId}`),
        apiFetch(`/deals/${dealId}/tags`),
        apiFetch(`/deals/${dealId}/files`),
        apiFetch(`/deal-tags`),
      ])

      if (dealRes.ok) {
        const data = await dealRes.json()
        setDeal(data)
        setTitle(data.title)
        setValue(data.value?.toString() || "0")
        setStageId(data.stage_id)
        setContactId(data.contact_id || null)
        setSelectedContact(data.contact || null)
        setProducts(data.products || [])
        setProductsTotal(data.products_total || 0)
        setInfo(data.info || null)
      }

      if (tagsRes.ok) {
        setTags(await tagsRes.json())
      }

      if (filesRes.ok) {
        setFiles(await filesRes.json())
      }

      if (allTagsRes.ok) {
        setAllTags(await allTagsRes.json())
      }
    } catch (error) {
      console.error("Erro ao carregar deal:", error)
    } finally {
      setIsLoading(false)
    }
  }, [dealId])

  useEffect(() => {
    if (dealId) {
      loadDeal()
    } else if (initialStageId) {
      setStageId(initialStageId)
    }
  }, [dealId, initialStageId, loadDeal])

  // Save fullscreen preference
  useEffect(() => {
    localStorage.setItem("dealModalFullscreen", isFullscreen.toString())
  }, [isFullscreen])

  const handleSave = async () => {
    if (!title.trim()) return

    setIsSaving(true)
    try {
      const payload = {
        title: title.trim(),
        value: parseFloat(value) || 0,
        stage_id: stageId,
        pipeline_id: pipelineId,
        contact_id: contactId,
      }

      const url = isNew ? `/deals` : `/deals/${dealId}`
      const method = isNew ? "POST" : "PATCH"

      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        if (isNew) {
          onSave()
        } else {
          await loadDeal()
        }
      }
    } catch (error) {
      console.error("Erro ao salvar deal:", error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleWin = async () => {
    if (!dealId) return

    try {
      const res = await apiFetch(`/deals/${dealId}/win`, { method: "POST" })
      if (res.ok) {
        onSave()
      }
    } catch (error) {
      console.error("Erro ao marcar como ganho:", error)
    }
  }

  const handleLose = async () => {
    if (!dealId) return

    try {
      const res = await apiFetch(`/deals/${dealId}/lose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: null }),
      })
      if (res.ok) {
        onSave()
      }
    } catch (error) {
      console.error("Erro ao marcar como perdido:", error)
    }
  }

  const handleReopen = async () => {
    if (!dealId) return

    try {
      const res = await apiFetch(`/deals/${dealId}/reopen`, { method: "POST" })
      if (res.ok) {
        await loadDeal()
      }
    } catch (error) {
      console.error("Erro ao reabrir deal:", error)
    }
  }

  const handleArchive = async () => {
    if (!dealId) return
    setShowMoreMenu(false)

    try {
      const res = await apiFetch(`/deals/${dealId}/archive`, { method: "POST" })
      if (res.ok) {
        onSave()
      }
    } catch (error) {
      console.error("Erro ao arquivar deal:", error)
    }
  }

  const handleDelete = async () => {
    if (!dealId || !confirm("Tem certeza que deseja excluir este deal permanentemente? Esta ação não pode ser desfeita.")) return
    setShowMoreMenu(false)

    try {
      const res = await apiFetch(`/deals/${dealId}`, { method: "DELETE" })
      if (res.ok) {
        onSave()
      }
    } catch (error) {
      console.error("Erro ao excluir deal:", error)
    }
  }

  // Products handlers
  const handleAddProductFromCatalog = async (catalogProduct: { id: string; name: string; value: number }) => {
    if (!dealId) return

    setIsAddingProduct(true)
    try {
      const res = await apiFetch(`/deals/${dealId}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: catalogProduct.id }),
      })

      if (res.ok) {
        const newProduct = await res.json()
        setProducts((prev) => [...prev, newProduct])
        setProductsTotal((prev) => prev + catalogProduct.value)
        setShowProductSelector(false)
      }
    } catch (error) {
      console.error("Erro ao adicionar produto:", error)
    } finally {
      setIsAddingProduct(false)
    }
  }

  const handleAddManualProduct = async () => {
    if (!dealId || !newProductName.trim()) return

    setIsAddingProduct(true)
    try {
      const res = await apiFetch(`/deals/${dealId}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProductName.trim(),
          value: parseFloat(newProductValue) || 0,
        }),
      })

      if (res.ok) {
        const newProduct = await res.json()
        setProducts((prev) => [...prev, newProduct])
        setProductsTotal((prev) => prev + (parseFloat(newProductValue) || 0))
        setNewProductName("")
        setNewProductValue("")
        setShowManualProduct(false)
      }
    } catch (error) {
      console.error("Erro ao adicionar produto:", error)
    } finally {
      setIsAddingProduct(false)
    }
  }

  const handleRemoveProduct = async (productId: string, productValue: number) => {
    if (!dealId) return

    try {
      const res = await apiFetch(`/deals/${dealId}/products/${productId}`, { method: "DELETE" })
      if (res.ok) {
        setProducts((prev) => prev.filter((p) => p.id !== productId))
        setProductsTotal((prev) => prev - productValue)
      }
    } catch (error) {
      console.error("Erro ao remover produto:", error)
    }
  }

  // Tags handlers
  const handleAddTag = async (tagId: string) => {
    if (!dealId) return

    try {
      await apiFetch(`/deals/${dealId}/tags/${tagId}`, { method: "POST" })
      const tagToAdd = allTags.find((t) => t.id === tagId)
      if (tagToAdd) {
        setTags((prev) => [...prev, tagToAdd])
      }
      setShowTagSelector(false)
    } catch (error) {
      console.error("Erro ao adicionar tag:", error)
    }
  }

  const handleRemoveTag = async (tagId: string) => {
    if (!dealId) return

    try {
      await apiFetch(`/deals/${dealId}/tags/${tagId}`, { method: "DELETE" })
      setTags((prev) => prev.filter((t) => t.id !== tagId))
    } catch (error) {
      console.error("Erro ao remover tag:", error)
    }
  }

  // File handlers
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!dealId || !e.target.files?.length) return

    const file = e.target.files?.[0]
    if (!file) return

    setIsUploadingFile(true)

    try {
      // TODO: Upload to Supabase Storage first, then save reference
      // For now, just mock
      console.log("Would upload:", file.name)
    } catch (error) {
      console.error("Erro ao fazer upload:", error)
    } finally {
      setIsUploadingFile(false)
    }
  }

  const handleRemoveFile = async (fileId: string) => {
    if (!dealId) return

    try {
      await apiFetch(`/deals/${dealId}/files/${fileId}`, { method: "DELETE" })
      setFiles((prev) => prev.filter((f) => f.id !== fileId))
    } catch (error) {
      console.error("Erro ao remover arquivo:", error)
    }
  }

  // Note handler
  const handleSaveNote = async () => {
    if (!dealId || !noteContent.trim()) return

    setIsSavingNote(true)
    try {
      const res = await apiFetch(`/deals/${dealId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activity_type: "note",
          content: noteContent.trim(),
        }),
      })

      if (res.ok) {
        setNoteContent("")
        setTimelineKey((k) => k + 1) // Force timeline refresh
      }
    } catch (error) {
      console.error("Erro ao salvar nota:", error)
    } finally {
      setIsSavingNote(false)
    }
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("pt-BR")
  }

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return ""
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // Modal classes based on fullscreen state (mobile always fullscreen)
  const modalClasses = isFullscreen
    ? "fixed inset-0 z-50 flex flex-col bg-white dark:bg-zinc-900"
    : "fixed inset-0 md:inset-auto md:right-0 md:top-0 z-50 h-full md:h-full w-full md:max-w-4xl flex flex-col bg-white shadow-2xl dark:bg-zinc-900 md:animate-slide-in-right"

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={modalClasses}>
        {/* Header - Pipedrive style (responsive) */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-3 md:px-4 py-2 md:py-3 dark:border-zinc-800">
          <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
            {/* Back/Close button */}
            <button
              onClick={onClose}
              className="rounded p-1.5 hover:bg-zinc-100 active:bg-zinc-200 dark:hover:bg-zinc-800 dark:active:bg-zinc-700 flex-shrink-0"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Title - Editable */}
            {isEditingTitle ? (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  setIsEditingTitle(false)
                  if (dealId) handleSave()
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setIsEditingTitle(false)
                    if (dealId) handleSave()
                  }
                }}
                autoFocus
                className="border-b-2 border-blue-500 bg-transparent text-lg md:text-xl font-semibold outline-none min-w-0 flex-1"
              />
            ) : (
              <h1
                className="cursor-pointer text-lg md:text-xl font-semibold hover:text-blue-600 truncate min-w-0"
                onClick={() => !isClosed && setIsEditingTitle(true)}
              >
                {isNew ? "Novo Deal" : title || "Sem título"}
              </h1>
            )}
          </div>

          <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
            {/* Owner (placeholder) - hidden on mobile */}
            <div className="hidden lg:flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700">
              <User className="h-4 w-4 text-zinc-400" />
              <span>Proprietário</span>
              <ChevronDown className="h-4 w-4 text-zinc-400" />
            </div>

            {/* Won/Lost buttons */}
            {!isNew && !isClosed && (
              <>
                <button
                  onClick={handleWin}
                  className="rounded-lg bg-green-500 px-2 md:px-4 py-1.5 text-xs md:text-sm font-medium text-white hover:bg-green-600 active:bg-green-700"
                >
                  <span className="hidden md:inline">Won</span>
                  <Trophy className="h-4 w-4 md:hidden" />
                </button>
                <button
                  onClick={handleLose}
                  className="rounded-lg bg-red-500 px-2 md:px-4 py-1.5 text-xs md:text-sm font-medium text-white hover:bg-red-600 active:bg-red-700"
                >
                  <span className="hidden md:inline">Lost</span>
                  <XCircle className="h-4 w-4 md:hidden" />
                </button>
              </>
            )}

            {/* Reopen button if closed */}
            {isClosed && (
              <button
                onClick={handleReopen}
                className="flex items-center gap-1 rounded-lg border border-zinc-300 px-2 md:px-3 py-1.5 text-sm hover:bg-zinc-50 active:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800 dark:active:bg-zinc-700"
              >
                <RotateCcw className="h-4 w-4" />
                <span className="hidden md:inline">Reabrir</span>
              </button>
            )}

            {/* Send message button */}
            {!isNew && (
              <button
                onClick={() => dealId && onSendMessage?.(dealId)}
                className="flex items-center gap-1 rounded-lg border border-zinc-300 px-2 md:px-3 py-1.5 text-sm hover:bg-zinc-50 active:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800 dark:active:bg-zinc-700"
                title="Enviar mensagem"
              >
                <Send className="h-4 w-4" />
                <span className="hidden md:inline">Enviar mensagem</span>
              </button>
            )}

            {/* Fullscreen toggle - hidden on mobile (always fullscreen) */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="hidden md:block rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
            >
              {isFullscreen ? (
                <Minimize2 className="h-5 w-5" />
              ) : (
                <Maximize2 className="h-5 w-5" />
              )}
            </button>

            {/* More options menu */}
            {!isNew && (
              <div className="relative">
                <button 
                  onClick={() => setShowMoreMenu(!showMoreMenu)}
                  className="rounded p-1.5 hover:bg-zinc-100 active:bg-zinc-200 dark:hover:bg-zinc-800 dark:active:bg-zinc-700"
                >
                  <MoreVertical className="h-5 w-5" />
                </button>
                
                {showMoreMenu && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setShowMoreMenu(false)}
                    />
                    <div className="absolute right-0 top-9 z-20 w-44 md:w-40 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                      <button
                        onClick={handleArchive}
                        className="flex w-full items-center gap-2 px-3 py-3 md:py-2 text-sm text-zinc-700 hover:bg-zinc-100 active:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      >
                        <Archive className="h-5 w-5 md:h-4 md:w-4" />
                        Arquivar
                      </button>
                      <button
                        onClick={handleDelete}
                        className="flex w-full items-center gap-2 px-3 py-3 md:py-2 text-sm text-red-600 hover:bg-red-50 active:bg-red-100 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="h-5 w-5 md:h-4 md:w-4" />
                        Excluir
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Pipeline Progress Bar - Pipedrive style (hidden on mobile for space) */}
        {!isNew && (
          <div className="hidden md:flex border-b border-zinc-200 dark:border-zinc-800">
            {sortedStages.map((stage, index) => {
              const isCurrentStage = stage.id === stageId
              const isPastStage = sortedStages.findIndex((s) => s.id === stageId) > index

              return (
                <div
                  key={stage.id}
                  className="relative flex-1 cursor-pointer"
                  onClick={() => {
                    if (!isClosed) {
                      setStageId(stage.id)
                      if (dealId) handleSave()
                    }
                  }}
                >
                  {/* Stage bar */}
                  <div
                    className={`h-8 flex items-center justify-center text-xs font-medium text-white ${
                      isCurrentStage
                        ? "bg-green-500"
                        : isPastStage
                        ? "bg-green-400"
                        : "bg-zinc-300 dark:bg-zinc-700"
                    }`}
                    style={{
                      clipPath: index < sortedStages.length - 1
                        ? "polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%, 8px 50%)"
                        : index > 0
                        ? "polygon(0 0, 100% 0, 100% 100%, 0 100%, 8px 50%)"
                        : "polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%)",
                      marginLeft: index > 0 ? "-8px" : "0",
                    }}
                  >
                    {getTimeInStage(stage.id)}
                  </div>
                  {/* Stage name tooltip */}
                  <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs text-zinc-500">
                    {isCurrentStage && (
                      <span className="rounded bg-zinc-800 px-2 py-0.5 text-white dark:bg-zinc-100 dark:text-zinc-800">
                        {stage.name}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        
        {/* Mobile: Simple stage indicator */}
        {!isNew && (
          <div className="flex md:hidden items-center gap-2 px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto">
            <span className="text-xs text-zinc-500 flex-shrink-0">Estágio:</span>
            <select
              value={stageId}
              onChange={(e) => {
                if (!isClosed) {
                  setStageId(e.target.value)
                  if (dealId) handleSave()
                }
              }}
              disabled={isClosed}
              className="flex-1 text-sm font-medium bg-transparent border-none outline-none disabled:opacity-50"
            >
              {sortedStages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Main Content - Two columns on desktop, single on mobile */}
        <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-zinc-500">Carregando...</div>
            </div>
          ) : (
            <>
              {/* Left Sidebar - Summary (Pipedrive style) */}
              <div className="w-full md:w-[400px] lg:w-[500px] flex-shrink-0 overflow-y-auto border-b md:border-b-0 md:border-r border-zinc-200 p-3 md:p-4 dark:border-zinc-800">
                {/* Summary Header */}
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-semibold">Summary</h3>
                  <button className="text-zinc-400 hover:text-zinc-600">
                    <span>⋯</span>
                  </button>
                </div>

                {/* Status badge if closed */}
                {isClosed && (
                  <div className="mb-4">
                    {isWon ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700 dark:bg-green-900/50 dark:text-green-400">
                        <Trophy className="h-4 w-4" />
                        Ganho
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700 dark:bg-red-900/50 dark:text-red-400">
                        <XCircle className="h-4 w-4" />
                        Perdido
                      </span>
                    )}
                  </div>
                )}

                {/* Value */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 text-zinc-500">
                    <DollarSign className="h-4 w-4" />
                    <span className="text-sm">Valor</span>
                  </div>
                  {isEditingValue ? (
                    <input
                      type="number"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      onBlur={() => {
                        setIsEditingValue(false)
                        if (dealId) handleSave()
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          setIsEditingValue(false)
                          if (dealId) handleSave()
                        }
                      }}
                      autoFocus
                      className="mt-1 w-full rounded border border-blue-500 px-2 py-1 text-lg font-semibold outline-none"
                    />
                  ) : (
                    <div
                      className="mt-1 cursor-pointer text-lg font-semibold hover:text-blue-600"
                      onClick={() => !isClosed && setIsEditingValue(true)}
                    >
                      {formatCurrency(parseFloat(value) || 0)}
                    </div>
                  )}
                </div>

                {/* Products Link */}
                <button
                  onClick={() => {
                    setActiveTab("products")
                  }}
                  className="mb-4 flex w-full items-center gap-2 text-blue-600 hover:text-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  <span className="text-sm font-medium">Products</span>
                </button>

                {/* Person (Contact) */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 text-zinc-500">
                    <User className="h-4 w-4" />
                    <span className="text-sm">Person</span>
                  </div>
                  {selectedContact ? (
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-medium text-blue-600">
                        {selectedContact.display_name?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                      <span className="text-sm font-medium">{selectedContact.display_name || "Sem nome"}</span>
                    </div>
                  ) : (
                    <div className="mt-1">
                      <ContactSelector
                        selectedContactId={contactId}
                        selectedContact={selectedContact ?? null}
                        onSelect={(contact) => {
                          if (contact) {
                            setContactId(contact.id)
                            setSelectedContact({ id: contact.id, display_name: contact.display_name })
                            if (dealId) handleSave()
                          } else {
                            setContactId(null)
                            setSelectedContact(null)
                          }
                        }}
                        disabled={isClosed}
                      />
                    </div>
                  )}
                </div>

                {/* Tags */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 text-zinc-500">
                    <Tag className="h-4 w-4" />
                    <span className="text-sm">Tags</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="group inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
                        style={{ backgroundColor: tag.color }}
                      >
                        {tag.name}
                        {!isClosed && (
                          <button
                            onClick={() => handleRemoveTag(tag.id)}
                            className="hidden group-hover:block"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    ))}
                    {!isClosed && (
                      <div className="relative">
                        <button
                          onClick={() => setShowTagSelector(!showTagSelector)}
                          className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                        >
                          + Tag
                        </button>
                        {showTagSelector && (
                          <div className="absolute left-0 top-full z-10 mt-1 w-40 rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                            {allTags
                              .filter((t) => !tags.some((tt) => tt.id === t.id))
                              .map((tag) => (
                                <button
                                  key={tag.id}
                                  onClick={() => handleAddTag(tag.id)}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700"
                                >
                                  <span
                                    className="h-3 w-3 rounded-full"
                                    style={{ backgroundColor: tag.color }}
                                  />
                                  {tag.name}
                                </button>
                              ))}
                            {allTags.filter((t) => !tags.some((tt) => tt.id === t.id)).length === 0 && (
                              <div className="px-3 py-2 text-sm text-zinc-500">
                                Nenhuma tag disponível
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Informações (dados do webhook) */}
                {info && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 text-zinc-500 mb-2">
                      <FileText className="h-4 w-4" />
                      <span className="text-sm font-medium">Informações</span>
                    </div>
                    <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-3 text-sm space-y-1">
                      {info.split('\n').map((line, index) => {
                        const [label, ...valueParts] = line.split(':')
                        const value = valueParts.join(':').trim()
                        if (!label || !value) return null
                        return (
                          <div key={index} className="flex flex-col">
                            <span className="text-xs text-zinc-500">{label.trim()}</span>
                            <span className="text-zinc-900 dark:text-zinc-100">{value}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Campos Personalizados do Deal */}
                {deal?.custom_fields && typeof deal.custom_fields === 'object' && Object.keys(deal.custom_fields).length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 text-zinc-500 mb-2">
                      <FileText className="h-4 w-4" />
                      <span className="text-sm font-medium">Campos Personalizados</span>
                    </div>
                    <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-3 text-sm space-y-1">
                      {Object.entries(deal.custom_fields).map(([key, value]) => (
                        <div key={key} className="flex flex-col">
                          <span className="text-xs text-zinc-500 capitalize">
                            {key.replace(/_/g, ' ')}
                          </span>
                          <span className="text-zinc-900 dark:text-zinc-100">
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Contact Custom Fields */}
                {selectedContact?.metadata && Object.keys(selectedContact.metadata).length > 0 && (
                  <div className="border-t border-zinc-200 pt-4 dark:border-zinc-700">
                    <h4 className="mb-2 text-xs font-medium uppercase text-zinc-400">
                      Dados do Contato
                    </h4>
                    {Object.entries(selectedContact.metadata).map(([key, value]) => (
                      <div key={key} className="mb-2">
                        <div className="text-xs text-zinc-500">{key}</div>
                        <div className="text-sm">{String(value)}</div>
                      </div>
                    ))}
                  </div>
                )}


              </div>

              {/* Right Content Area - Tabs */}
              <div className="flex flex-1 flex-col overflow-hidden">
                {/* Tabs Header - Pipedrive style (scrollable on mobile) */}
                <div className="flex border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto">
                  {[
                    { id: "activity" as const, label: "Activity", icon: History },
                    { id: "notes" as const, label: "Notes", icon: FileText },
                    { id: "products" as const, label: "Products", icon: Package },
                    { id: "files" as const, label: "Files", icon: File },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 md:gap-2 border-b-2 px-3 md:px-4 py-2.5 md:py-3 text-xs md:text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                        activeTab === tab.id
                          ? "border-blue-500 text-blue-600"
                          : "border-transparent text-zinc-500 hover:text-zinc-700 active:text-zinc-900"
                      }`}
                    >
                      <tab.icon className="h-4 w-4" />
                      <span className="hidden sm:inline">{tab.label}</span>
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto p-3 md:p-4">
                  {/* Activity Tab */}
                  {activeTab === "activity" && (
                    <div>
                      {/* Quick add activity */}
                      <div className="mb-4 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
                        <input
                          type="text"
                          placeholder="Click here to add an activity..."
                          className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
                        />
                      </div>

                      {/* History Section */}
                      <div>
                        <h3 className="mb-3 flex items-center gap-2 font-semibold">
                          <History className="h-4 w-4" />
                          History
                        </h3>

                        {/* History sub-tabs */}
                        <div className="mb-3 flex gap-2 text-sm">
                          <button className="rounded-full bg-blue-100 px-3 py-1 text-blue-600 dark:bg-blue-900/50">
                            All
                          </button>
                          <button className="rounded-full px-3 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                            Activities ({0})
                          </button>
                          <button className="rounded-full px-3 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                            Notes ({0})
                          </button>
                        </div>

                        {/* Timeline */}
                        {dealId && <DealTimeline key={`activity-${timelineKey}`} dealId={dealId} isClosed={isClosed} />}
                      </div>
                    </div>
                  )}

                  {/* Notes Tab */}
                  {activeTab === "notes" && (
                    <div>
                      <div className="mb-4">
                        <textarea
                          value={noteContent}
                          onChange={(e) => setNoteContent(e.target.value)}
                          placeholder="Adicione uma nota..."
                          rows={4}
                          disabled={isClosed}
                          className="w-full rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-800 disabled:opacity-50"
                        />
                        <div className="mt-2 flex justify-end">
                          <button
                            onClick={handleSaveNote}
                            disabled={isClosed || isSavingNote || !noteContent.trim()}
                            className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                          >
                            {isSavingNote ? "Salvando..." : "Salvar Nota"}
                          </button>
                        </div>
                      </div>

                      {dealId && <DealTimeline key={`notes-${timelineKey}`} dealId={dealId} isClosed={isClosed} filterType="note" />}
                    </div>
                  )}

                  {/* Products Tab */}
                  {activeTab === "products" && (
                    <div>
                      {/* Add Product Button */}
                      {!isClosed && !showProductSelector && !showManualProduct && (
                        <button
                          onClick={() => setShowProductSelector(true)}
                          className="mb-4 flex items-center gap-2 text-blue-600 hover:text-blue-700"
                        >
                          <Plus className="h-4 w-4" />
                          <span className="text-sm font-medium">Add product</span>
                        </button>
                      )}

                      {/* Product Selector */}
                      {showProductSelector && !isClosed && (
                        <div className="mb-4">
                          <ProductSelector
                            onSelect={handleAddProductFromCatalog}
                            onCancel={() => setShowProductSelector(false)}
                            onCreateManual={() => {
                              setShowProductSelector(false)
                              setShowManualProduct(true)
                            }}
                          />
                        </div>
                      )}

                      {/* Manual product form */}
                      {showManualProduct && !isClosed && (
                        <div className="mb-4 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                          <p className="mb-2 text-sm text-zinc-500">Criar produto manual</p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newProductName}
                              onChange={(e) => setNewProductName(e.target.value)}
                              placeholder="Nome do produto"
                              className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                            />
                            <input
                              type="number"
                              value={newProductValue}
                              onChange={(e) => setNewProductValue(e.target.value)}
                              placeholder="Valor"
                              min="0"
                              step="0.01"
                              className="w-32 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                            />
                          </div>
                          <div className="mt-3 flex justify-end gap-2">
                            <button
                              onClick={() => {
                                setShowManualProduct(false)
                                setNewProductName("")
                                setNewProductValue("")
                              }}
                              className="rounded px-3 py-1.5 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={handleAddManualProduct}
                              disabled={isAddingProduct || !newProductName.trim()}
                              className="rounded bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                            >
                              {isAddingProduct ? "Salvando..." : "Salvar"}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Products List */}
                      {products.length === 0 ? (
                        <div className="py-8 text-center text-zinc-400">
                          <Package className="mx-auto mb-2 h-8 w-8" />
                          <p>Nenhum produto adicionado</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {products.map((p) => (
                            <div
                              key={p.id}
                              className="group flex items-center justify-between rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"
                            >
                              <div>
                                <div className="font-medium">{p.name}</div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-lg font-semibold text-green-600">
                                  {formatCurrency(p.value)}
                                </span>
                                {!isClosed && (
                                  <button
                                    onClick={() => handleRemoveProduct(p.id, p.value)}
                                    className="hidden rounded p-1 text-red-500 hover:bg-red-50 group-hover:block dark:hover:bg-red-950/30"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}

                          {/* Total */}
                          <div className="mt-4 flex items-center justify-between border-t border-zinc-200 pt-4 dark:border-zinc-700">
                            <span className="font-medium">Total</span>
                            <span className="text-xl font-bold text-green-600">
                              {formatCurrency(productsTotal)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Files Tab */}
                  {activeTab === "files" && (
                    <div>
                      {/* Upload Button */}
                      {!isClosed && (
                        <label className="mb-4 flex cursor-pointer items-center gap-2 text-blue-600 hover:text-blue-700">
                          <Upload className="h-4 w-4" />
                          <span className="text-sm font-medium">Upload file</span>
                          <input
                            type="file"
                            onChange={handleFileUpload}
                            className="hidden"
                          />
                        </label>
                      )}

                      {/* Files List */}
                      {files.length === 0 ? (
                        <div className="py-8 text-center text-zinc-400">
                          <File className="mx-auto mb-2 h-8 w-8" />
                          <p>Nenhum arquivo</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {files.map((f) => (
                            <div
                              key={f.id}
                              className="group flex items-center justify-between rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"
                            >
                              <div className="flex items-center gap-3">
                                <File className="h-5 w-5 text-zinc-400" />
                                <div>
                                  <div className="font-medium">{f.name}</div>
                                  <div className="text-xs text-zinc-500">
                                    {formatFileSize(f.file_size)} • {formatDate(f.created_at)}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <a
                                  href={f.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded p-1 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                                >
                                  <span className="text-sm">Abrir</span>
                                </a>
                                {!isClosed && (
                                  <button
                                    onClick={() => handleRemoveFile(f.id)}
                                    className="hidden rounded p-1 text-red-500 hover:bg-red-50 group-hover:block dark:hover:bg-red-950/30"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer for new deal (sticky on mobile) */}
        {isNew && (
          <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-3 md:px-4 py-3 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 md:py-2 text-sm hover:bg-zinc-100 active:bg-zinc-200 dark:hover:bg-zinc-800 dark:active:bg-zinc-700"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !title.trim()}
              className="rounded-lg bg-blue-500 px-4 py-2.5 md:py-2 text-sm font-medium text-white hover:bg-blue-600 active:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? "Criando..." : "Criar Deal"}
            </button>
          </div>
        )}
      </div>

      {/* Animation styles */}
      <style jsx>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.3s ease-out;
        }
      `}</style>
    </>
  )
}
