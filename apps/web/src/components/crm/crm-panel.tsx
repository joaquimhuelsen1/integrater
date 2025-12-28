"use client"

import { useState, useEffect, useCallback } from "react"
import {
  X,
  Briefcase,
  UserPlus,
  Link2,
  Search,
  Loader2,
  Plus,
  Trophy,
  XCircle,
  ExternalLink,
  Calendar,
  DollarSign,
  Tag,
  User,
  Building2,
  History,
  FileText,
  Package,
  File,
  Trash2,
  RotateCcw,
  Upload,
  ArrowRight,
  StickyNote,
  MessageSquare,
} from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase"
import { DealTimeline } from "./deal-timeline"
import { ProductSelector } from "./product-selector"
import { ContactSelector } from "./contact-selector"

// Types
interface Contact {
  id: string
  display_name: string
  lead_stage?: string
  metadata?: Record<string, unknown>
}

interface Deal {
  id: string
  title: string
  value: number
  probability: number
  expected_close_date: string | null
  stage_id: string
  stage?: { id: string; name: string; color: string } | null
  pipeline_id: string
  pipeline?: { id: string; name: string; color: string } | null
  contact_id: string | null
  contact?: { id: string; display_name: string | null; metadata?: Record<string, unknown> } | null
  won_at: string | null
  lost_at: string | null
  lost_reason: string | null
  created_at: string
  products?: { id: string; name: string; value: number }[]
  products_total?: number
}

interface Stage {
  id: string
  name: string
  color: string
  position: number
  is_win?: boolean
  is_loss?: boolean
}

interface Pipeline {
  id: string
  name: string
  stages: Stage[]
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
  created_at: string
}

interface CRMPanelProps {
  conversationId: string | null
  contactId: string | null
  contactName: string | null
  identityId?: string | null
  identityValue?: string | null
  onClose: () => void
  onContactLinked: () => void
  workspaceId?: string
}

type PanelState = "loading" | "no-contact" | "contact-only" | "with-deal"
type TabType = "activity" | "notes" | "products" | "files"

export function CRMPanel({
  conversationId,
  contactId,
  contactName,
  identityId,
  identityValue,
  onClose,
  onContactLinked,
  workspaceId,
}: CRMPanelProps) {
  const supabase = createClient()
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  // Estados principais
  const [panelState, setPanelState] = useState<PanelState>("loading")
  const [deal, setDeal] = useState<Deal | null>(null)
  const [stages, setStages] = useState<Stage[]>([])
  const [pipelines, setPipelines] = useState<Pipeline[]>([])

  // Estados para vincular contato
  const [showContactModal, setShowContactModal] = useState(false)
  const [contactMode, setContactMode] = useState<"create" | "link">("create")
  const [contacts, setContacts] = useState<Contact[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [newContactName, setNewContactName] = useState("")
  const [isLinking, setIsLinking] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)

  // Estados para criar deal
  const [showCreateDeal, setShowCreateDeal] = useState(false)
  const [isCreatingDeal, setIsCreatingDeal] = useState(false)
  const [newDealTitle, setNewDealTitle] = useState("")
  const [newDealValue, setNewDealValue] = useState("")
  const [selectedPipeline, setSelectedPipeline] = useState("")
  const [selectedStage, setSelectedStage] = useState("")

  // Estados do deal (edição)
  const [activeTab, setActiveTab] = useState<TabType>("activity")
  const [isEditingValue, setIsEditingValue] = useState(false)
  const [editValue, setEditValue] = useState("")
  const [probability, setProbability] = useState(50)
  const [expectedCloseDate, setExpectedCloseDate] = useState("")
  const [lostReason, setLostReason] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  // Tags
  const [tags, setTags] = useState<DealTag[]>([])
  const [allTags, setAllTags] = useState<DealTag[]>([])
  const [showTagSelector, setShowTagSelector] = useState(false)

  // Products
  const [products, setProducts] = useState<{ id: string; name: string; value: number }[]>([])
  const [productsTotal, setProductsTotal] = useState(0)
  const [showProductSelector, setShowProductSelector] = useState(false)
  const [showManualProduct, setShowManualProduct] = useState(false)
  const [newProductName, setNewProductName] = useState("")
  const [newProductValue, setNewProductValue] = useState("")
  const [isAddingProduct, setIsAddingProduct] = useState(false)

  // Notes
  const [noteContent, setNoteContent] = useState("")
  const [isSavingNote, setIsSavingNote] = useState(false)
  const [timelineKey, setTimelineKey] = useState(0)

  // Files
  const [files, setFiles] = useState<DealFile[]>([])

  // Auth helper
  const getAuthHeaders = async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
  }

  const isWon = !!deal?.won_at
  const isLost = !!deal?.lost_at
  const isClosed = isWon || isLost
  const sortedStages = [...stages].sort((a, b) => a.position - b.position)

  // Carregar deal vinculado
  const loadDeal = useCallback(async () => {
    if (!contactId) {
      setPanelState("no-contact")
      return
    }

    try {
      const headers = await getAuthHeaders()
      const res = await fetch(
        `${API_URL}/deals?contact_id=${contactId}&include_closed=true&limit=1`,
        { headers }
      )

      if (res.ok) {
        const deals = await res.json()
        if (deals.length > 0) {
          const detailRes = await fetch(`${API_URL}/deals/${deals[0].id}`, { headers })
          if (detailRes.ok) {
            const dealData = await detailRes.json()
            setDeal(dealData)
            setEditValue(dealData.value?.toString() || "0")
            setProbability(dealData.probability || 50)
            setExpectedCloseDate(dealData.expected_close_date || "")
            setLostReason(dealData.lost_reason || "")
            setProducts(dealData.products || [])
            setProductsTotal(dealData.products_total || 0)
            setPanelState("with-deal")

            // Carregar stages do pipeline
            if (dealData.pipeline_id) {
              const stagesRes = await fetch(`${API_URL}/pipelines/${dealData.pipeline_id}/stages`, { headers })
              if (stagesRes.ok) {
                setStages(await stagesRes.json())
              }
            }

            // Carregar tags
            const [tagsRes, allTagsRes] = await Promise.all([
              fetch(`${API_URL}/deals/${deals[0].id}/tags`, { headers }),
              fetch(`${API_URL}/deal-tags`, { headers }),
            ])
            if (tagsRes.ok) setTags(await tagsRes.json())
            if (allTagsRes.ok) setAllTags(await allTagsRes.json())

            // Carregar files
            const filesRes = await fetch(`${API_URL}/deals/${deals[0].id}/files`, { headers })
            if (filesRes.ok) setFiles(await filesRes.json())

            return
          }
        }
      }
      setPanelState("contact-only")
    } catch (error) {
      console.error("Erro ao carregar deal:", error)
      setPanelState("contact-only")
    }
  }, [API_URL, contactId, supabase])

  // Carregar pipelines
  const loadPipelines = useCallback(async () => {
    if (!workspaceId) return
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`${API_URL}/pipelines?workspace_id=${workspaceId}`, { headers })
      if (res.ok) {
        const data = await res.json()
        const pipelinesWithStages = await Promise.all(
          data.map(async (p: Pipeline) => {
            const stagesRes = await fetch(`${API_URL}/pipelines/${p.id}/stages`, { headers })
            if (stagesRes.ok) {
              const stagesData = await stagesRes.json()
              return { ...p, stages: stagesData }
            }
            return { ...p, stages: [] }
          })
        )
        setPipelines(pipelinesWithStages)
        if (pipelinesWithStages.length > 0) {
          setSelectedPipeline(pipelinesWithStages[0].id)
          if (pipelinesWithStages[0].stages.length > 0) {
            setSelectedStage(pipelinesWithStages[0].stages[0].id)
          }
        }
      }
    } catch (error) {
      console.error("Erro ao carregar pipelines:", error)
    }
  }, [API_URL, workspaceId, supabase])

  // Carregar contatos para vincular
  const loadContacts = useCallback(async () => {
    if (!workspaceId) return
    try {
      const headers = await getAuthHeaders()
      const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ""
      const res = await fetch(`${API_URL}/contacts?workspace_id=${workspaceId}${searchParam}`, { headers })
      if (res.ok) setContacts(await res.json())
    } catch {
      console.error("Erro ao carregar contatos")
    }
  }, [API_URL, searchQuery, workspaceId, supabase])

  // Effects
  useEffect(() => { loadDeal() }, [loadDeal])
  useEffect(() => {
    if (showCreateDeal && pipelines.length === 0) loadPipelines()
  }, [showCreateDeal, pipelines.length, loadPipelines])
  useEffect(() => {
    if (showContactModal && contactMode === "link") loadContacts()
  }, [showContactModal, contactMode, loadContacts])
  useEffect(() => {
    const pipeline = pipelines.find((p) => p.id === selectedPipeline)
    const firstStage = pipeline?.stages?.[0]
    if (firstStage) setSelectedStage(firstStage.id)
  }, [selectedPipeline, pipelines])

  // Criar novo contato
  const handleCreateContact = async () => {
    if (!newContactName.trim() || !identityId || !workspaceId) return
    setIsLinking(true)
    try {
      const headers = await getAuthHeaders()
      const createRes = await fetch(`${API_URL}/contacts?workspace_id=${workspaceId}`, {
        method: "POST", headers, body: JSON.stringify({ display_name: newContactName.trim() }),
      })
      if (!createRes.ok) throw new Error("Erro ao criar contato")
      const contact = await createRes.json()
      await fetch(`${API_URL}/contacts/${contact.id}/link-identity`, {
        method: "POST", headers, body: JSON.stringify({ identity_id: identityId }),
      })
      setShowContactModal(false)
      setNewContactName("")
      onContactLinked()
    } catch (error) {
      console.error("Erro ao criar contato:", error)
      setLinkError("Erro ao criar contato")
    } finally {
      setIsLinking(false)
    }
  }

  // Vincular a contato existente
  const handleLinkContact = async (selectedContactId: string) => {
    if (!identityId) return
    setIsLinking(true)
    setLinkError(null)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`${API_URL}/contacts/${selectedContactId}/link-identity`, {
        method: "POST", headers, body: JSON.stringify({ identity_id: identityId }),
      })
      if (!res.ok) {
        if (res.status === 409) {
          const data = await res.json()
          setLinkError(data.detail || "Contato já vinculado a outra conversa")
          return
        }
        throw new Error("Erro ao vincular")
      }
      setShowContactModal(false)
      onContactLinked()
    } catch (error) {
      console.error("Erro ao vincular:", error)
      setLinkError("Erro ao vincular contato")
    } finally {
      setIsLinking(false)
    }
  }

  // Criar deal
  const handleCreateDeal = async () => {
    if (!newDealTitle.trim() || !selectedPipeline || !selectedStage) return
    setIsCreatingDeal(true)
    try {
      const headers = await getAuthHeaders()
      const payload: Record<string, unknown> = {
        title: newDealTitle.trim(),
        value: parseFloat(newDealValue) || 0,
        pipeline_id: selectedPipeline,
        stage_id: selectedStage,
      }
      if (contactId) payload.contact_id = contactId
      if (conversationId) payload.conversation_id = conversationId

      const res = await fetch(`${API_URL}/deals`, { method: "POST", headers, body: JSON.stringify(payload) })
      if (res.ok) {
        setShowCreateDeal(false)
        setNewDealTitle("")
        setNewDealValue("")
        loadDeal()
      }
    } catch (error) {
      console.error("Erro ao criar deal:", error)
    } finally {
      setIsCreatingDeal(false)
    }
  }

  // Salvar deal
  const handleSaveDeal = async () => {
    if (!deal?.id) return
    setIsSaving(true)
    try {
      const headers = await getAuthHeaders()
      await fetch(`${API_URL}/deals/${deal.id}`, {
        method: "PATCH", headers,
        body: JSON.stringify({
          value: parseFloat(editValue) || 0,
          probability,
          expected_close_date: expectedCloseDate || null,
        }),
      })
      loadDeal()
    } catch (error) {
      console.error("Erro ao salvar:", error)
    } finally {
      setIsSaving(false)
    }
  }

  // Mudar stage
  const handleChangeStage = async (stageId: string) => {
    if (!deal?.id || isClosed) return
    try {
      const headers = await getAuthHeaders()
      await fetch(`${API_URL}/deals/${deal.id}`, {
        method: "PATCH", headers, body: JSON.stringify({ stage_id: stageId }),
      })
      loadDeal()
    } catch (error) {
      console.error("Erro ao mudar stage:", error)
    }
  }

  // Win/Lose/Reopen
  const handleWin = async () => {
    if (!deal?.id) return
    try {
      const headers = await getAuthHeaders()
      await fetch(`${API_URL}/deals/${deal.id}/win`, { method: "POST", headers })
      loadDeal()
    } catch (error) {
      console.error("Erro:", error)
    }
  }

  const handleLose = async () => {
    if (!deal?.id) return
    try {
      const headers = await getAuthHeaders()
      await fetch(`${API_URL}/deals/${deal.id}/lose`, {
        method: "POST", headers, body: JSON.stringify({ reason: lostReason || null }),
      })
      loadDeal()
    } catch (error) {
      console.error("Erro:", error)
    }
  }

  const handleReopen = async () => {
    if (!deal?.id) return
    try {
      const headers = await getAuthHeaders()
      await fetch(`${API_URL}/deals/${deal.id}/reopen`, { method: "POST", headers })
      loadDeal()
    } catch (error) {
      console.error("Erro:", error)
    }
  }

  const handleArchive = async () => {
    if (!deal?.id || !confirm("Arquivar este deal?")) return
    try {
      const headers = await getAuthHeaders()
      await fetch(`${API_URL}/deals/${deal.id}`, { method: "DELETE", headers })
      setPanelState("contact-only")
      setDeal(null)
    } catch (error) {
      console.error("Erro:", error)
    }
  }

  // Tags
  const handleAddTag = async (tagId: string) => {
    if (!deal?.id) return
    try {
      const headers = await getAuthHeaders()
      await fetch(`${API_URL}/deals/${deal.id}/tags/${tagId}`, { method: "POST", headers })
      const tagToAdd = allTags.find((t) => t.id === tagId)
      if (tagToAdd) setTags((prev) => [...prev, tagToAdd])
      setShowTagSelector(false)
    } catch (error) {
      console.error("Erro:", error)
    }
  }

  const handleRemoveTag = async (tagId: string) => {
    if (!deal?.id) return
    try {
      const headers = await getAuthHeaders()
      await fetch(`${API_URL}/deals/${deal.id}/tags/${tagId}`, { method: "DELETE", headers })
      setTags((prev) => prev.filter((t) => t.id !== tagId))
    } catch (error) {
      console.error("Erro:", error)
    }
  }

  // Products
  const handleAddProduct = async (product: { id: string; name: string; value: number }) => {
    if (!deal?.id) return
    setIsAddingProduct(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`${API_URL}/deals/${deal.id}/products`, {
        method: "POST", headers, body: JSON.stringify({ product_id: product.id }),
      })
      if (res.ok) {
        const newProduct = await res.json()
        setProducts((prev) => [...prev, newProduct])
        setProductsTotal((prev) => prev + product.value)
        setShowProductSelector(false)
      }
    } catch (error) {
      console.error("Erro:", error)
    } finally {
      setIsAddingProduct(false)
    }
  }

  const handleAddManualProduct = async () => {
    if (!deal?.id || !newProductName.trim()) return
    setIsAddingProduct(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`${API_URL}/deals/${deal.id}/products`, {
        method: "POST", headers,
        body: JSON.stringify({ name: newProductName.trim(), value: parseFloat(newProductValue) || 0 }),
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
      console.error("Erro:", error)
    } finally {
      setIsAddingProduct(false)
    }
  }

  const handleRemoveProduct = async (productId: string, productValue: number) => {
    if (!deal?.id) return
    try {
      const headers = await getAuthHeaders()
      await fetch(`${API_URL}/deals/${deal.id}/products/${productId}`, { method: "DELETE", headers })
      setProducts((prev) => prev.filter((p) => p.id !== productId))
      setProductsTotal((prev) => prev - productValue)
    } catch (error) {
      console.error("Erro:", error)
    }
  }

  // Notes
  const handleSaveNote = async () => {
    if (!deal?.id || !noteContent.trim()) return
    setIsSavingNote(true)
    try {
      const headers = await getAuthHeaders()
      await fetch(`${API_URL}/deals/${deal.id}/activities`, {
        method: "POST", headers,
        body: JSON.stringify({ activity_type: "note", content: noteContent.trim() }),
      })
      setNoteContent("")
      setTimelineKey((k) => k + 1)
    } catch (error) {
      console.error("Erro:", error)
    } finally {
      setIsSavingNote(false)
    }
  }

  // Formatadores
  const formatCurrency = (val: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val)
  const currentPipeline = pipelines.find((p) => p.id === selectedPipeline)

  return (
    <div className="flex h-full w-[400px] flex-shrink-0 flex-col border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-zinc-200 px-4 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-zinc-500" />
          <h3 className="font-semibold">CRM</h3>
        </div>
        <div className="flex items-center gap-2">
          {/* Won/Lost buttons */}
          {panelState === "with-deal" && !isClosed && (
            <>
              <button onClick={handleWin} className="rounded bg-green-500 px-2 py-1 text-xs font-medium text-white hover:bg-green-600">
                Won
              </button>
              <button onClick={handleLose} className="rounded bg-red-500 px-2 py-1 text-xs font-medium text-white hover:bg-red-600">
                Lost
              </button>
            </>
          )}
          {isClosed && (
            <button onClick={handleReopen} className="flex items-center gap-1 rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700">
              <RotateCcw className="h-3 w-3" /> Reabrir
            </button>
          )}
          <button onClick={onClose} className="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Pipeline Progress Bar */}
      {panelState === "with-deal" && sortedStages.length > 0 && (
        <div className="flex border-b border-zinc-200 dark:border-zinc-800">
          {sortedStages.map((stage, index) => {
            const isCurrentStage = stage.id === deal?.stage_id
            const isPastStage = sortedStages.findIndex((s) => s.id === deal?.stage_id) > index
            return (
              <div
                key={stage.id}
                className={`flex-1 cursor-pointer py-2 text-center text-[10px] font-medium transition-colors ${
                  isCurrentStage ? "bg-green-500 text-white" : isPastStage ? "bg-green-400 text-white" : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400"
                }`}
                onClick={() => handleChangeStage(stage.id)}
                title={stage.name}
              >
                {isCurrentStage ? stage.name : ""}
              </div>
            )
          })}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {panelState === "loading" ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          </div>
        ) : panelState === "no-contact" ? (
          /* Estado: Sem contato vinculado */
          <div className="p-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
              <div className="mb-3 flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                <span className="font-medium text-amber-700 dark:text-amber-300">Vincule um contato primeiro</span>
              </div>
              <p className="mb-4 text-sm text-amber-600 dark:text-amber-400">
                Para acessar o CRM, vincule esta conversa a um contato.
              </p>
              <button onClick={() => setShowContactModal(true)} className="w-full rounded-lg bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700">
                Vincular Contato
              </button>
            </div>
          </div>
        ) : panelState === "contact-only" ? (
          /* Estado: Tem contato, sem deal */
          <div className="p-4">
            <div className="mb-4 flex items-center gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30">
                {contactName?.charAt(0).toUpperCase() || "?"}
              </div>
              <div>
                <h4 className="font-medium">{contactName || "Contato"}</h4>
                {identityValue && <p className="text-xs text-zinc-500">{identityValue}</p>}
              </div>
            </div>

            {!showCreateDeal ? (
              <div className="text-center">
                <p className="mb-3 text-sm text-zinc-500">Nenhum deal vinculado</p>
                <button
                  onClick={() => { setShowCreateDeal(true); setNewDealTitle(contactName ? `Deal - ${contactName}` : "") }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 font-medium text-white hover:bg-blue-600"
                >
                  <Plus className="h-4 w-4" /> Criar Deal
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <h4 className="font-medium">Novo Deal</h4>
                <div>
                  <label className="mb-1 block text-xs font-medium">Título</label>
                  <input type="text" value={newDealTitle} onChange={(e) => setNewDealTitle(e.target.value)} placeholder="Nome do deal" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Valor (R$)</label>
                  <input type="number" value={newDealValue} onChange={(e) => setNewDealValue(e.target.value)} placeholder="0" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Pipeline</label>
                  <select value={selectedPipeline} onChange={(e) => setSelectedPipeline(e.target.value)} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800">
                    {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Etapa</label>
                  <select value={selectedStage} onChange={(e) => setSelectedStage(e.target.value)} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800">
                    {currentPipeline?.stages.sort((a, b) => a.position - b.position).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setShowCreateDeal(false)} className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-600">Cancelar</button>
                  <button onClick={handleCreateDeal} disabled={isCreatingDeal || !newDealTitle.trim()} className="flex-1 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50">
                    {isCreatingDeal ? "Criando..." : "Criar"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Estado: Tem deal */
          <div className="flex flex-col">
            {/* Status badge */}
            {isClosed && (
              <div className="border-b border-zinc-200 p-3 dark:border-zinc-800">
                {isWon ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700 dark:bg-green-900/50 dark:text-green-400">
                    <Trophy className="h-4 w-4" /> Ganho
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700 dark:bg-red-900/50 dark:text-red-400">
                    <XCircle className="h-4 w-4" /> Perdido
                  </span>
                )}
              </div>
            )}

            {/* Summary */}
            <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
              <h4 className="mb-3 text-lg font-semibold">{deal?.title}</h4>

              {/* Valor */}
              <div className="mb-3">
                <div className="flex items-center gap-1 text-xs text-zinc-500"><DollarSign className="h-3 w-3" /> Valor</div>
                {isEditingValue ? (
                  <div className="flex gap-2">
                    <input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} className="flex-1 rounded border border-blue-500 px-2 py-1 text-lg font-semibold" autoFocus />
                    <button onClick={() => { setIsEditingValue(false); handleSaveDeal() }} className="rounded bg-blue-500 px-2 text-white">OK</button>
                  </div>
                ) : (
                  <div className="cursor-pointer text-2xl font-bold text-green-600 hover:text-green-700" onClick={() => !isClosed && setIsEditingValue(true)}>
                    {formatCurrency(parseFloat(editValue) || 0)}
                  </div>
                )}
              </div>

              {/* Products link */}
              <button onClick={() => setActiveTab("products")} className="mb-3 flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700">
                <Plus className="h-3 w-3" /> Products {products.length > 0 && `(${products.length})`}
              </button>

              {/* Person */}
              <div className="mb-3">
                <div className="flex items-center gap-1 text-xs text-zinc-500"><User className="h-3 w-3" /> Person</div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-600">
                    {deal?.contact?.display_name?.charAt(0)?.toUpperCase() || contactName?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                  <span className="text-sm">{deal?.contact?.display_name || contactName}</span>
                </div>
              </div>

              {/* Tags */}
              <div className="mb-3">
                <div className="flex items-center gap-1 text-xs text-zinc-500"><Tag className="h-3 w-3" /> Tags</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {tags.map((tag) => (
                    <span key={tag.id} className="group inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-white" style={{ backgroundColor: tag.color }}>
                      {tag.name}
                      {!isClosed && <button onClick={() => handleRemoveTag(tag.id)} className="hidden group-hover:block"><X className="h-3 w-3" /></button>}
                    </span>
                  ))}
                  {!isClosed && (
                    <div className="relative">
                      <button onClick={() => setShowTagSelector(!showTagSelector)} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800">+ Tag</button>
                      {showTagSelector && (
                        <div className="absolute left-0 top-full z-10 mt-1 w-36 rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                          {allTags.filter((t) => !tags.some((tt) => tt.id === t.id)).map((tag) => (
                            <button key={tag.id} onClick={() => handleAddTag(tag.id)} className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-700">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
                              {tag.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Expected Close Date */}
              <div className="mb-3">
                <div className="flex items-center gap-1 text-xs text-zinc-500"><Calendar className="h-3 w-3" /> Data fechamento</div>
                <input type="date" value={expectedCloseDate} onChange={(e) => { setExpectedCloseDate(e.target.value); handleSaveDeal() }} disabled={isClosed}
                  className="mt-1 w-full rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 disabled:opacity-50" />
              </div>

              {/* Probabilidade */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>Probabilidade</span>
                  <span className="font-medium">{probability}%</span>
                </div>
                <input type="range" value={probability} onChange={(e) => setProbability(parseInt(e.target.value))} onMouseUp={handleSaveDeal} disabled={isClosed} min="0" max="100" step="5" className="mt-1 w-full" />
              </div>

              {/* Lost reason */}
              {!isClosed && (
                <div className="mb-3">
                  <div className="text-xs text-zinc-500">Motivo da perda (se aplicável)</div>
                  <input type="text" value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder="Ex: Preço, concorrência..."
                    className="mt-1 w-full rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
                </div>
              )}

              {/* Links */}
              <div className="flex gap-2">
                <Link href="/crm" className="flex flex-1 items-center justify-center gap-1 rounded border border-zinc-200 px-2 py-1.5 text-xs hover:bg-zinc-50 dark:border-zinc-700">
                  <ExternalLink className="h-3 w-3" /> CRM completo
                </Link>
                <button onClick={handleArchive} className="flex items-center gap-1 rounded border border-red-200 px-2 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:border-red-800">
                  <Trash2 className="h-3 w-3" /> Arquivar
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-zinc-200 dark:border-zinc-800">
              {[
                { id: "activity" as const, label: "Activity", icon: History },
                { id: "notes" as const, label: "Notes", icon: FileText },
                { id: "products" as const, label: "Products", icon: Package },
              ].map((tab) => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-1 items-center justify-center gap-1 py-2 text-xs font-medium ${activeTab === tab.id ? "border-b-2 border-blue-500 text-blue-600" : "text-zinc-500"}`}>
                  <tab.icon className="h-3 w-3" /> {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === "activity" && deal?.id && (
                <DealTimeline key={`activity-${timelineKey}`} dealId={deal.id} isClosed={isClosed} />
              )}

              {activeTab === "notes" && (
                <div>
                  <textarea value={noteContent} onChange={(e) => setNoteContent(e.target.value)} placeholder="Adicione uma nota..." rows={3} disabled={isClosed}
                    className="mb-2 w-full rounded-lg border border-zinc-200 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 disabled:opacity-50" />
                  <button onClick={handleSaveNote} disabled={isClosed || isSavingNote || !noteContent.trim()}
                    className="w-full rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50">
                    {isSavingNote ? "Salvando..." : "Salvar Nota"}
                  </button>
                  {deal?.id && <div className="mt-4"><DealTimeline key={`notes-${timelineKey}`} dealId={deal.id} isClosed={isClosed} filterType="note" /></div>}
                </div>
              )}

              {activeTab === "products" && (
                <div>
                  {!isClosed && !showProductSelector && !showManualProduct && (
                    <button onClick={() => setShowProductSelector(true)} className="mb-3 flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700">
                      <Plus className="h-4 w-4" /> Add product
                    </button>
                  )}

                  {showProductSelector && !isClosed && (
                    <div className="mb-3">
                      <ProductSelector onSelect={handleAddProduct} onCancel={() => setShowProductSelector(false)} onCreateManual={() => { setShowProductSelector(false); setShowManualProduct(true) }} />
                    </div>
                  )}

                  {showManualProduct && !isClosed && (
                    <div className="mb-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                      <div className="mb-2 flex gap-2">
                        <input type="text" value={newProductName} onChange={(e) => setNewProductName(e.target.value)} placeholder="Nome" className="flex-1 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800" />
                        <input type="number" value={newProductValue} onChange={(e) => setNewProductValue(e.target.value)} placeholder="Valor" className="w-24 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800" />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => { setShowManualProduct(false); setNewProductName(""); setNewProductValue("") }} className="rounded px-2 py-1 text-xs hover:bg-zinc-200">Cancelar</button>
                        <button onClick={handleAddManualProduct} disabled={isAddingProduct || !newProductName.trim()} className="rounded bg-blue-500 px-2 py-1 text-xs text-white disabled:opacity-50">
                          {isAddingProduct ? "..." : "Salvar"}
                        </button>
                      </div>
                    </div>
                  )}

                  {products.length === 0 ? (
                    <div className="py-6 text-center text-zinc-400">
                      <Package className="mx-auto mb-2 h-6 w-6" />
                      <p className="text-sm">Nenhum produto</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {products.map((p) => (
                        <div key={p.id} className="group flex items-center justify-between rounded border border-zinc-200 p-2 dark:border-zinc-700">
                          <span className="text-sm">{p.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-green-600">{formatCurrency(p.value)}</span>
                            {!isClosed && (
                              <button onClick={() => handleRemoveProduct(p.id, p.value)} className="hidden text-red-500 group-hover:block">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between border-t border-zinc-200 pt-2 dark:border-zinc-700">
                        <span className="font-medium">Total</span>
                        <span className="text-lg font-bold text-green-600">{formatCurrency(productsTotal)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal: Vincular Contato */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Vincular Contato</h3>
              <button onClick={() => setShowContactModal(false)} className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"><X className="h-5 w-5" /></button>
            </div>
            <div className="mb-4 flex gap-2">
              <button onClick={() => { setContactMode("create"); setLinkError(null) }} className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${contactMode === "create" ? "bg-blue-500 text-white" : "bg-zinc-100 dark:bg-zinc-800"}`}>
                <UserPlus className="mr-2 inline-block h-4 w-4" /> Criar Novo
              </button>
              <button onClick={() => { setContactMode("link"); setLinkError(null) }} className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${contactMode === "link" ? "bg-blue-500 text-white" : "bg-zinc-100 dark:bg-zinc-800"}`}>
                <Link2 className="mr-2 inline-block h-4 w-4" /> Vincular
              </button>
            </div>
            {linkError && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20">{linkError}</div>}
            {contactMode === "create" ? (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">Nome do Contato</label>
                  <input type="text" value={newContactName} onChange={(e) => setNewContactName(e.target.value)} placeholder="Ex: João Silva" className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800" />
                </div>
                <button onClick={handleCreateContact} disabled={!newContactName.trim() || isLinking} className="w-full rounded-md bg-blue-500 px-4 py-2 font-medium text-white hover:bg-blue-600 disabled:opacity-50">
                  {isLinking ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : "Criar Contato"}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar contatos..." className="w-full rounded-md border border-zinc-300 py-2 pl-10 pr-4 dark:border-zinc-700 dark:bg-zinc-800" />
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {contacts.length === 0 ? (
                    <p className="py-4 text-center text-sm text-zinc-500">Nenhum contato encontrado</p>
                  ) : (
                    <div className="space-y-2">
                      {contacts.map((contact) => (
                        <button key={contact.id} onClick={() => handleLinkContact(contact.id)} disabled={isLinking} className="w-full rounded-md border border-zinc-200 p-3 text-left hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700">
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
    </div>
  )
}
