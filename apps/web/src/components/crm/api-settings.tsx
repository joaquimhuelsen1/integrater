"use client"

import { useState, useEffect } from "react"
import { Copy, RefreshCw, Plus, Trash2, Check, X } from "lucide-react"
import { apiFetch } from "@/lib/api"

interface ApiKey {
  id: string
  pipeline_id: string
  api_key: string
  created_at: string
  updated_at: string
}

interface Tag {
  id: string
  name: string
  color: string
}

interface ApiSettingsProps {
  pipelineId: string
  pipelineName: string
}

const TAG_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e"
]

export function ApiSettings({ pipelineId, pipelineName }: ApiSettingsProps) {
  const [apiKey, setApiKey] = useState<ApiKey | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  
  // Tags state
  const [tags, setTags] = useState<Tag[]>([])
  const [isLoadingTags, setIsLoadingTags] = useState(true)
  const [newTagName, setNewTagName] = useState("")
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0])
  const [isCreatingTag, setIsCreatingTag] = useState(false)
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [editingTagName, setEditingTagName] = useState("")

  // Load API key
  useEffect(() => {
    const loadApiKey = async () => {
      try {
        const res = await apiFetch(`/pipelines/${pipelineId}/api-key`)
        if (res.ok) {
          const data = await res.json()
          setApiKey(data)
        }
      } catch (error) {
        console.error("Erro ao carregar API key:", error)
      } finally {
        setIsLoading(false)
      }
    }
    loadApiKey()
  }, [pipelineId])

  // Load tags
  useEffect(() => {
    const loadTags = async () => {
      try {
        const res = await apiFetch("/deal-tags")
        if (res.ok) {
          const data = await res.json()
          setTags(data)
        }
      } catch (error) {
        console.error("Erro ao carregar tags:", error)
      } finally {
        setIsLoadingTags(false)
      }
    }
    loadTags()
  }, [])

  const handleGenerateKey = async () => {
    setIsGenerating(true)
    try {
      const res = await apiFetch(`/pipelines/${pipelineId}/api-key`, {
        method: "POST"
      })
      if (res.ok) {
        const data = await res.json()
        setApiKey(data)
      }
    } catch (error) {
      console.error("Erro ao gerar API key:", error)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCopyKey = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey.api_key)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return
    
    setIsCreatingTag(true)
    try {
      const res = await apiFetch("/deal-tags", {
        method: "POST",
        body: JSON.stringify({
          name: newTagName.trim(),
          color: newTagColor
        })
      })
      if (res.ok) {
        const data = await res.json()
        setTags([...tags, data])
        setNewTagName("")
        setNewTagColor(TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)])
      }
    } catch (error) {
      console.error("Erro ao criar tag:", error)
    } finally {
      setIsCreatingTag(false)
    }
  }

  const handleUpdateTag = async (tagId: string) => {
    if (!editingTagName.trim()) return
    
    try {
      const res = await apiFetch(`/deal-tags/${tagId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editingTagName.trim() })
      })
      if (res.ok) {
        setTags(tags.map(t => t.id === tagId ? { ...t, name: editingTagName.trim() } : t))
        setEditingTagId(null)
        setEditingTagName("")
      }
    } catch (error) {
      console.error("Erro ao atualizar tag:", error)
    }
  }

  const handleDeleteTag = async (tagId: string) => {
    if (!confirm("Tem certeza que deseja excluir esta tag?")) return
    
    try {
      const res = await apiFetch(`/deal-tags/${tagId}`, {
        method: "DELETE"
      })
      if (res.ok || res.status === 204) {
        setTags(tags.filter(t => t.id !== tagId))
      }
    } catch (error) {
      console.error("Erro ao excluir tag:", error)
    }
  }

  const apiUrl = typeof window !== "undefined" 
    ? `${window.location.origin.replace('integrater.vercel.app', 'api.thereconquestmap.com')}/webhooks/deals`
    : "https://api.thereconquestmap.com/webhooks/deals"

  const examplePayload = `{
  "title": "Nome do Lead",
  "value": 0,
  "info": "Email: exemplo@email.com\\nTelefone: +55 11 99999-9999\\nFonte: Google Forms",
  "tags": ["Google Forms", "WhatsApp"]
}`

  const exampleCurl = apiKey 
    ? `curl -X POST "${apiUrl}" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${apiKey.api_key}" \\
  -d '${examplePayload}'`
    : "Gere uma API key primeiro"

  return (
    <div className="space-y-8">
      {/* API Key Section */}
      <div>
        <h3 className="text-lg font-semibold mb-4">API Key</h3>
        <p className="text-sm text-zinc-500 mb-4">
          Use esta API key para criar deals via webhook no pipeline "{pipelineName}".
        </p>

        {isLoading ? (
          <div className="text-zinc-500">Carregando...</div>
        ) : apiKey ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-zinc-100 px-4 py-3 font-mono text-sm dark:bg-zinc-800 break-all">
                {apiKey.api_key}
              </code>
              <button
                onClick={handleCopyKey}
                className="rounded-lg border border-zinc-300 p-3 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                title="Copiar"
              >
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </button>
              <button
                onClick={handleGenerateKey}
                disabled={isGenerating}
                className="rounded-lg border border-zinc-300 p-3 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                title="Regenerar"
              >
                <RefreshCw className={`h-4 w-4 ${isGenerating ? "animate-spin" : ""}`} />
              </button>
            </div>
            <p className="text-xs text-zinc-400">
              Criada em: {new Date(apiKey.created_at).toLocaleString("pt-BR")}
            </p>
          </div>
        ) : (
          <button
            onClick={handleGenerateKey}
            disabled={isGenerating}
            className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {isGenerating ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Gerar API Key
          </button>
        )}
      </div>

      {/* Endpoint Info */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Endpoint</h3>
        <div className="rounded-lg bg-zinc-100 px-4 py-3 font-mono text-sm dark:bg-zinc-800">
          POST {apiUrl}
        </div>
      </div>

      {/* Headers */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Headers</h3>
        <div className="rounded-lg bg-zinc-100 px-4 py-3 font-mono text-sm dark:bg-zinc-800 space-y-1">
          <div>Content-Type: application/json</div>
          <div>X-API-Key: {apiKey?.api_key || "<sua-api-key>"}</div>
        </div>
      </div>

      {/* Payload Example */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Exemplo de Payload</h3>
        <pre className="rounded-lg bg-zinc-100 px-4 py-3 font-mono text-sm dark:bg-zinc-800 overflow-x-auto">
          {examplePayload}
        </pre>
        <div className="mt-2 text-sm text-zinc-500">
          <strong>Campos:</strong>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li><code>title</code> (obrigatório): Nome do deal</li>
            <li><code>value</code> (opcional): Valor do deal (default: 0)</li>
            <li><code>info</code> (opcional): Informações formatadas (usa \n para quebra de linha)</li>
            <li><code>tags</code> (opcional): Lista de nomes de tags (cria automaticamente se não existir)</li>
            <li><code>stage_id</code> (opcional): ID do stage (default: primeiro stage)</li>
            <li><code>contact_id</code> (opcional): ID do contato para vincular</li>
          </ul>
        </div>
      </div>

      {/* cURL Example */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Exemplo cURL</h3>
        <pre className="rounded-lg bg-zinc-900 px-4 py-3 font-mono text-sm text-green-400 overflow-x-auto whitespace-pre-wrap">
          {exampleCurl}
        </pre>
      </div>

      {/* Tags Management */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 pt-8">
        <h3 className="text-lg font-semibold mb-4">Gerenciar Tags</h3>
        <p className="text-sm text-zinc-500 mb-4">
          Tags podem ser enviadas pelo webhook. Se a tag não existir, será criada automaticamente.
        </p>

        {/* Create new tag */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex gap-1">
            {TAG_COLORS.slice(0, 8).map((color) => (
              <button
                key={color}
                onClick={() => setNewTagColor(color)}
                className={`h-6 w-6 rounded-full ${newTagColor === color ? "ring-2 ring-offset-2 ring-blue-500" : ""}`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <input
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="Nome da tag..."
            className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
          />
          <button
            onClick={handleCreateTag}
            disabled={!newTagName.trim() || isCreatingTag}
            className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Criar
          </button>
        </div>

        {/* Tags list */}
        {isLoadingTags ? (
          <div className="text-zinc-500">Carregando tags...</div>
        ) : tags.length === 0 ? (
          <div className="text-zinc-500 text-sm">Nenhuma tag criada ainda.</div>
        ) : (
          <div className="space-y-2">
            {tags.map((tag) => (
              <div
                key={tag.id}
                className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div
                  className="h-4 w-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: tag.color }}
                />
                
                {editingTagId === tag.id ? (
                  <>
                    <input
                      type="text"
                      value={editingTagName}
                      onChange={(e) => setEditingTagName(e.target.value)}
                      className="flex-1 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleUpdateTag(tag.id)
                        if (e.key === "Escape") {
                          setEditingTagId(null)
                          setEditingTagName("")
                        }
                      }}
                    />
                    <button
                      onClick={() => handleUpdateTag(tag.id)}
                      className="text-green-500 hover:text-green-600"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        setEditingTagId(null)
                        setEditingTagName("")
                      }}
                      className="text-zinc-400 hover:text-zinc-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm">{tag.name}</span>
                    <button
                      onClick={() => {
                        setEditingTagId(tag.id)
                        setEditingTagName(tag.name)
                      }}
                      className="text-zinc-400 hover:text-zinc-600 text-xs"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDeleteTag(tag.id)}
                      className="text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
