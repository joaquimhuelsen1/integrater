"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { X, Bug, ExternalLink, ImagePlus, Trash2, Loader2, Upload, ExternalLinkIcon } from "lucide-react"
import { createClient } from "@/lib/supabase"

interface BugReportModalProps {
  isOpen: boolean
  onClose: () => void
  currentUrl: string
  workspaceId?: string | null
}

// Preview local de imagem antes de upload
interface ImagePreview {
  id: string
  file: File
  previewUrl: string
}

export function BugReportModal({ isOpen, onClose, currentUrl, workspaceId }: BugReportModalProps) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [openBugsCount, setOpenBugsCount] = useState(0)
  
  // Estado para imagens
  const [imagePreviews, setImagePreviews] = useState<ImagePreview[]>([])
  const [expandedImage, setExpandedImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Estado para drag & drop
  const [isDragging, setIsDragging] = useState(false)
  const dragCounterRef = useRef(0)

  const supabase = createClient()

  // Carrega contagem de bugs abertos ao abrir modal
  useEffect(() => {
    if (!isOpen) return
    
    const loadOpenCount = async () => {
      const { count } = await supabase
        .from("bug_reports")
        .select("*", { count: "exact", head: true })
        .eq("status", "open")
      
      setOpenBugsCount(count || 0)
    }
    loadOpenCount()
  }, [isOpen, supabase])

  // Reset form ao fechar
  useEffect(() => {
    if (!isOpen) {
      setTitle("")
      setDescription("")
      // Limpa previews e revoga URLs
      imagePreviews.forEach(p => URL.revokeObjectURL(p.previewUrl))
      setImagePreviews([])
    }
  }, [isOpen])

  // Handler para adicionar imagens (file input ou drop)
  const addImageFiles = useCallback((files: File[]) => {
    // Filtra apenas imagens
    const imageFiles = files.filter(f => f.type.startsWith("image/"))
    if (imageFiles.length === 0) return

    const newPreviews: ImagePreview[] = imageFiles.map(file => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file)
    }))

    setImagePreviews(prev => [...prev, ...newPreviews])
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    addImageFiles(files)
    
    // Reset input para permitir selecionar mesmos arquivos
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  // Drag & drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    dragCounterRef.current = 0

    const files = Array.from(e.dataTransfer.files)
    addImageFiles(files)
  }, [addImageFiles])

  // Remove preview de imagem
  const removeImage = (id: string) => {
    setImagePreviews(prev => {
      const toRemove = prev.find(p => p.id === id)
      if (toRemove) {
        URL.revokeObjectURL(toRemove.previewUrl)
      }
      return prev.filter(p => p.id !== id)
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    setIsSubmitting(true)
    try {
      // 1. Cria o bug report
      const { data: bugData, error: bugError } = await supabase
        .from("bug_reports")
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          url: currentUrl,
          workspace_id: workspaceId || null,
          status: "open",
        })
        .select("id")
        .single()

      if (bugError) throw bugError

      const bugId = bugData.id

      // 2. Upload das imagens (se houver)
      if (imagePreviews.length > 0) {
        const { data: userData } = await supabase.auth.getUser()
        const userId = userData?.user?.id

        for (const preview of imagePreviews) {
          // Upload para storage
          const ext = preview.file.name.split(".").pop() || "png"
          const storagePath = `${userId}/${bugId}/${preview.id}.${ext}`

          const { error: uploadError } = await supabase.storage
            .from("bug-reports")
            .upload(storagePath, preview.file, {
              contentType: preview.file.type,
              upsert: false
            })

          if (uploadError) {
            console.error("Erro ao fazer upload:", uploadError)
            continue
          }

          // Salva referência no banco
          await supabase.from("bug_report_images").insert({
            bug_report_id: bugId,
            owner_id: userId,
            storage_path: storagePath,
            file_name: preview.file.name,
            mime_type: preview.file.type,
            file_size: preview.file.size,
          })
        }
      }

      // 3. Limpa form e fecha modal
      setTitle("")
      setDescription("")
      imagePreviews.forEach(p => URL.revokeObjectURL(p.previewUrl))
      setImagePreviews([])
      setOpenBugsCount(prev => prev + 1)
      onClose()
    } catch (err) {
      console.error("Erro ao salvar bug:", err)
      alert("Erro ao salvar bug. Tente novamente.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
            <div className="flex items-center gap-2">
              <Bug className="h-5 w-5 text-red-500" />
              <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">Reportar Bug</h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <X className="h-5 w-5 text-zinc-500" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-zinc-200 dark:border-zinc-700">
            <div className="flex-1 border-b-2 border-red-500 px-4 py-2.5 text-center text-sm font-medium text-red-600 dark:text-red-400">
              Reportar
            </div>
            <button
              onClick={() => window.open("/bugs", "_blank")}
              className="flex flex-1 items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              Meus Bugs {openBugsCount > 0 && `(${openBugsCount})`}
              <ExternalLinkIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Titulo */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Título *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex: Botão de enviar não funciona"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-red-500 focus:ring-1 focus:ring-red-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                    required
                    autoFocus
                  />
                </div>

                {/* Descricao */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Descrição
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Descreva o problema em detalhes..."
                    rows={3}
                    className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-red-500 focus:ring-1 focus:ring-red-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>

                {/* Upload de Imagens com Drag & Drop */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Screenshots
                  </label>
                  
                  {/* Grid de previews */}
                  {imagePreviews.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {imagePreviews.map((preview) => (
                        <div
                          key={preview.id}
                          className="group relative h-20 w-20 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700"
                        >
                          <img
                            src={preview.previewUrl}
                            alt={preview.file.name}
                            className="h-full w-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(preview.id)}
                            className="absolute right-1 top-1 rounded-full bg-red-500 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Área de drag & drop / botão de adicionar */}
                  <div
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-sm transition-all ${
                      isDragging
                        ? "border-red-500 bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400"
                        : "border-zinc-300 bg-zinc-50 text-zinc-600 hover:border-red-400 hover:bg-red-50 hover:text-red-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                    }`}
                  >
                    {isDragging ? (
                      <>
                        <Upload className="h-8 w-8" />
                        <span className="font-medium">Solte as imagens aqui</span>
                      </>
                    ) : (
                      <>
                        <ImagePlus className="h-6 w-6" />
                        <span>Arraste imagens ou clique para selecionar</span>
                        <span className="text-xs text-zinc-400 dark:text-zinc-500">
                          PNG, JPG, GIF - quantas quiser
                        </span>
                      </>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>

                {/* URL (automatico) */}
                <div className="flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  <ExternalLink className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{currentUrl}</span>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isSubmitting || !title.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>Enviar Bug {imagePreviews.length > 0 && `(${imagePreviews.length} img)`}</>
                  )}
                </button>
              </form>
          </div>
        </div>
      </div>
  )
}
