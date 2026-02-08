"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, Trash2, Loader2, Save, Edit2, X, ScrollText, FileText, ChevronDown, ChevronUp } from "lucide-react"
import { apiFetch } from "@/lib/api"

interface InstructionConfig {
  id: string
  config_type: "system_prompt" | "knowledge_base"
  name: string
  content?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export function InstructionConfigSettings() {
  const [configs, setConfigs] = useState<InstructionConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // System prompt state
  const [systemPrompt, setSystemPrompt] = useState<InstructionConfig | null>(null)
  const [spContent, setSpContent] = useState("")
  const [spName, setSpName] = useState("")
  const [editingSP, setEditingSP] = useState(false)
  const [savingSP, setSavingSP] = useState(false)
  const [spExpanded, setSpExpanded] = useState(false)

  // Knowledge base state
  const [kbDocs, setKbDocs] = useState<InstructionConfig[]>([])
  const [showAddKB, setShowAddKB] = useState(false)
  const [newKBName, setNewKBName] = useState("")
  const [newKBContent, setNewKBContent] = useState("")
  const [addingKB, setAddingKB] = useState(false)
  const [editingKB, setEditingKB] = useState<string | null>(null)
  const [editKBName, setEditKBName] = useState("")
  const [editKBContent, setEditKBContent] = useState("")
  const [savingKB, setSavingKB] = useState(false)
  const [expandedKB, setExpandedKB] = useState<string | null>(null)
  const [loadingContent, setLoadingContent] = useState<string | null>(null)

  const loadConfigs = useCallback(async () => {
    try {
      const res = await apiFetch("/instructions/configs")
      if (res.ok) {
        const data = await res.json()
        const all: InstructionConfig[] = data.configs || []
        setConfigs(all)

        const sp = all.find((c: InstructionConfig) => c.config_type === "system_prompt" && c.is_active)
        setSystemPrompt(sp || null)

        const kb = all.filter((c: InstructionConfig) => c.config_type === "knowledge_base")
        setKbDocs(kb)
      }
    } catch {
      setError("Erro ao carregar configs")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfigs()
  }, [loadConfigs])

  // Load full content for a config
  const loadFullContent = async (configId: string): Promise<string> => {
    setLoadingContent(configId)
    try {
      const res = await apiFetch(`/instructions/configs/${configId}`)
      if (res.ok) {
        const data = await res.json()
        return data.config?.content || ""
      }
    } catch {
      // ignore
    } finally {
      setLoadingContent(null)
    }
    return ""
  }

  // === System Prompt ===
  const startEditingSP = async () => {
    if (systemPrompt) {
      const content = await loadFullContent(systemPrompt.id)
      setSpContent(content)
      setSpName(systemPrompt.name)
    } else {
      setSpContent("")
      setSpName("System Prompt v1")
    }
    setEditingSP(true)
  }

  const saveSP = async () => {
    if (!spContent.trim()) return
    setSavingSP(true)
    setError(null)
    try {
      if (systemPrompt) {
        // Update existing
        const res = await apiFetch(`/instructions/configs/${systemPrompt.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: spContent, name: spName || systemPrompt.name }),
        })
        if (!res.ok) throw new Error("Erro ao atualizar")
      } else {
        // Create new
        const res = await apiFetch("/instructions/configs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            config_type: "system_prompt",
            name: spName || "System Prompt v1",
            content: spContent,
          }),
        })
        if (!res.ok) throw new Error("Erro ao criar")
      }
      setEditingSP(false)
      loadConfigs()
    } catch {
      setError("Erro ao salvar system prompt")
    } finally {
      setSavingSP(false)
    }
  }

  const expandSP = async () => {
    if (!spExpanded && systemPrompt) {
      const content = await loadFullContent(systemPrompt.id)
      setSpContent(content)
    }
    setSpExpanded(!spExpanded)
  }

  // === Knowledge Base ===
  const addKBDoc = async () => {
    if (!newKBName.trim() || !newKBContent.trim()) return
    setAddingKB(true)
    setError(null)
    try {
      const res = await apiFetch("/instructions/configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config_type: "knowledge_base",
          name: newKBName,
          content: newKBContent,
        }),
      })
      if (!res.ok) throw new Error("Erro ao criar")
      setShowAddKB(false)
      setNewKBName("")
      setNewKBContent("")
      loadConfigs()
    } catch {
      setError("Erro ao adicionar documento")
    } finally {
      setAddingKB(false)
    }
  }

  const startEditingKB = async (doc: InstructionConfig) => {
    const content = await loadFullContent(doc.id)
    setEditingKB(doc.id)
    setEditKBName(doc.name)
    setEditKBContent(content)
  }

  const saveKB = async (docId: string) => {
    if (!editKBContent.trim()) return
    setSavingKB(true)
    setError(null)
    try {
      const res = await apiFetch(`/instructions/configs/${docId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editKBContent, name: editKBName }),
      })
      if (!res.ok) throw new Error("Erro ao atualizar")
      setEditingKB(null)
      loadConfigs()
    } catch {
      setError("Erro ao salvar documento")
    } finally {
      setSavingKB(false)
    }
  }

  const deleteConfig = async (configId: string, label: string) => {
    if (!confirm(`Deletar "${label}"?`)) return
    try {
      const res = await apiFetch(`/instructions/configs/${configId}`, { method: "DELETE" })
      if (res.ok) {
        loadConfigs()
      }
    } catch {
      setError("Erro ao deletar")
    }
  }

  const expandKB = async (docId: string) => {
    if (expandedKB === docId) {
      setExpandedKB(null)
      return
    }
    const content = await loadFullContent(docId)
    setEditKBContent(content)
    setExpandedKB(docId)
  }

  if (loading) {
    return (
      <section className="mt-6 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="p-4">
          <div className="py-8 text-center text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
            Carregando configs...
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="mt-6 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-amber-500" />
            Instrucoes IA (GLM)
          </h2>
          <p className="text-sm text-zinc-500">
            System prompt e base de conhecimento para gerar instrucoes personalizadas
          </p>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">Fechar</button>
          </div>
        )}

        {/* === System Prompt === */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-amber-500" />
              System Prompt
            </h3>
            <div className="flex items-center gap-2">
              {systemPrompt && !editingSP && (
                <button
                  onClick={expandSP}
                  className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  title={spExpanded ? "Recolher" : "Expandir"}
                >
                  {loadingContent === systemPrompt.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : spExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              )}
              {!editingSP && (
                <button
                  onClick={startEditingSP}
                  className="flex items-center gap-1 rounded-lg border border-amber-300 px-3 py-1.5 text-sm text-amber-600 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/20"
                >
                  {loadingContent && !editingSP ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Edit2 className="h-3.5 w-3.5" />
                  )}
                  {systemPrompt ? "Editar" : "Criar"}
                </button>
              )}
            </div>
          </div>

          {systemPrompt && !editingSP && (
            <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{systemPrompt.name}</p>
                  <p className="text-xs text-zinc-500">
                    Atualizado em {new Date(systemPrompt.updated_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  Ativo
                </span>
              </div>
              {spExpanded && spContent && (
                <pre className="mt-3 text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap font-mono bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded max-h-64 overflow-y-auto">
                  {spContent}
                </pre>
              )}
            </div>
          )}

          {!systemPrompt && !editingSP && (
            <div className="rounded-lg border border-dashed border-amber-300 p-4 text-center dark:border-amber-700">
              <p className="text-sm text-zinc-500">
                Nenhum system prompt configurado. Clique em "Criar" para adicionar.
              </p>
            </div>
          )}

          {editingSP && (
            <div className="rounded-lg border border-amber-200 p-4 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10">
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Nome</label>
                  <input
                    type="text"
                    value={spName}
                    onChange={(e) => setSpName(e.target.value)}
                    placeholder="Ex: Ethan Heyes v1"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Conteudo do Prompt</label>
                  <textarea
                    value={spContent}
                    onChange={(e) => setSpContent(e.target.value)}
                    className="w-full h-64 p-3 rounded-lg border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 text-sm font-mono resize-y"
                    placeholder="Cole aqui o system prompt completo..."
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    {spContent.length.toLocaleString()} caracteres
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditingSP(false)}
                    className="px-3 py-1.5 rounded text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <X className="h-4 w-4 inline mr-1" />
                    Cancelar
                  </button>
                  <button
                    onClick={saveSP}
                    disabled={savingSP || !spContent.trim()}
                    className="px-4 py-1.5 rounded text-sm bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                  >
                    {savingSP ? (
                      <Loader2 className="h-4 w-4 inline mr-1 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 inline mr-1" />
                    )}
                    Salvar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* === Knowledge Base === */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-amber-500" />
              Knowledge Base ({kbDocs.length} documento{kbDocs.length !== 1 ? "s" : ""})
            </h3>
            <button
              onClick={() => setShowAddKB(true)}
              className="flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600"
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar
            </button>
          </div>

          {kbDocs.length === 0 && !showAddKB && (
            <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-center dark:border-zinc-700">
              <p className="text-sm text-zinc-500">
                Nenhum documento na knowledge base. Adicione os 11 arquivos .docx convertidos para texto.
              </p>
            </div>
          )}

          {kbDocs.length > 0 && (
            <div className="space-y-2">
              {kbDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-700"
                >
                  {editingKB === doc.id ? (
                    // Edit mode
                    <div className="p-4 space-y-3">
                      <div>
                        <label className="block text-sm font-medium mb-1">Nome</label>
                        <input
                          type="text"
                          value={editKBName}
                          onChange={(e) => setEditKBName(e.target.value)}
                          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Conteudo</label>
                        <textarea
                          value={editKBContent}
                          onChange={(e) => setEditKBContent(e.target.value)}
                          className="w-full h-48 p-3 rounded-lg border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 text-sm font-mono resize-y"
                        />
                        <p className="text-xs text-zinc-500 mt-1">
                          {editKBContent.length.toLocaleString()} caracteres
                        </p>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setEditingKB(null)}
                          className="px-3 py-1.5 rounded text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => saveKB(doc.id)}
                          disabled={savingKB || !editKBContent.trim()}
                          className="px-3 py-1.5 rounded text-sm bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                        >
                          {savingKB ? <Loader2 className="h-4 w-4 inline mr-1 animate-spin" /> : <Save className="h-4 w-4 inline mr-1" />}
                          Salvar
                        </button>
                      </div>
                    </div>
                  ) : (
                    // View mode
                    <>
                      <div className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="h-4 w-4 text-amber-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{doc.name}</p>
                            <p className="text-xs text-zinc-500">
                              {new Date(doc.updated_at).toLocaleString("pt-BR")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => expandKB(doc.id)}
                            className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            title="Ver conteudo"
                          >
                            {loadingContent === doc.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : expandedKB === doc.id ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            onClick={() => startEditingKB(doc)}
                            className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            title="Editar"
                          >
                            {loadingContent === doc.id && editingKB !== doc.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Edit2 className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            onClick={() => deleteConfig(doc.id, doc.name)}
                            className="p-1.5 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                            title="Deletar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      {expandedKB === doc.id && editKBContent && (
                        <div className="px-3 pb-3">
                          <pre className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap font-mono bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded max-h-48 overflow-y-auto">
                            {editKBContent}
                          </pre>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add KB Doc Form */}
          {showAddKB && (
            <div className="mt-3 rounded-lg border border-amber-200 p-4 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10">
              <h4 className="font-medium text-sm mb-3">Adicionar Documento</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Nome do Documento</label>
                  <input
                    type="text"
                    value={newKBName}
                    onChange={(e) => setNewKBName(e.target.value)}
                    placeholder="Ex: Documento 1 - Perfil do Publico"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Conteudo</label>
                  <textarea
                    value={newKBContent}
                    onChange={(e) => setNewKBContent(e.target.value)}
                    className="w-full h-48 p-3 rounded-lg border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 text-sm font-mono resize-y"
                    placeholder="Cole aqui o conteudo do documento .docx convertido para texto..."
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    {newKBContent.length.toLocaleString()} caracteres
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setShowAddKB(false)
                      setNewKBName("")
                      setNewKBContent("")
                    }}
                    className="px-4 py-2 text-sm rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={addKBDoc}
                    disabled={addingKB || !newKBName.trim() || !newKBContent.trim()}
                    className="px-4 py-2 text-sm rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                  >
                    {addingKB ? (
                      <>
                        <Loader2 className="h-4 w-4 inline mr-1 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      "Adicionar"
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
