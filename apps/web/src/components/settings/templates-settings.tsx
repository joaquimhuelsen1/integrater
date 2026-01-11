"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, Edit2, Trash2, Loader2, Save, X, FileText, Mail, MessageSquare, Send } from "lucide-react"
import { apiFetch } from "@/lib/api"

// Tipos
type ChannelHint = "email" | "openphone_sms" | "telegram"

interface Template {
  id: string
  title: string
  content: string
  channel_hint: ChannelHint | null
  shortcut: string | null
  subject: string | null
  created_at: string
  updated_at: string
}

interface NewTemplate {
  title: string
  content: string
  shortcut: string
  subject: string
}

// Canais disponiveis
const CHANNELS: { id: ChannelHint; label: string; icon: React.ReactNode; color: string }[] = [
  {
    id: "email",
    label: "Email",
    icon: <Mail className="h-4 w-4" />,
    color: "bg-orange-500"
  },
  {
    id: "openphone_sms",
    label: "SMS",
    icon: <MessageSquare className="h-4 w-4" />,
    color: "bg-green-500"
  },
  {
    id: "telegram",
    label: "Telegram",
    icon: <Send className="h-4 w-4" />,
    color: "bg-blue-500"
  },
]

// Placeholders disponiveis
const PLACEHOLDERS = [
  { key: "{nome}", desc: "Nome completo do contato" },
  { key: "{email}", desc: "Email do contato" },
  { key: "{valor}", desc: "Valor do deal" },
  { key: "{deal}", desc: "Nome do deal" },
  { key: "{email_compra}", desc: "Email de compra" },
  { key: "{telefone_contato}", desc: "Telefone do contato" },
  { key: "{nome_completo}", desc: "Nome completo" },
]

export function TemplatesSettings() {
  // Estado principal
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Estado de UI
  const [selectedChannel, setSelectedChannel] = useState<ChannelHint>("email")
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Estado do form de criacao
  const [newTemplate, setNewTemplate] = useState<NewTemplate>({
    title: "",
    content: "",
    shortcut: "",
    subject: "",
  })
  const [saving, setSaving] = useState(false)

  // Estado do form de edicao
  const [editForm, setEditForm] = useState<NewTemplate>({
    title: "",
    content: "",
    shortcut: "",
    subject: "",
  })

  // Carregar templates
  const loadTemplates = useCallback(async () => {
    try {
      setError(null)
      const res = await apiFetch("/templates")
      if (res.ok) {
        const data = await res.json()
        setTemplates(data)
      } else {
        setError("Erro ao carregar templates")
      }
    } catch {
      setError("Erro ao carregar templates")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  // Filtrar templates pelo canal selecionado
  const filteredTemplates = templates.filter(t => t.channel_hint === selectedChannel)

  // Criar template
  const createTemplate = async () => {
    if (!newTemplate.title.trim() || !newTemplate.content.trim()) return

    setSaving(true)
    setError(null)

    try {
      const res = await apiFetch("/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTemplate.title.trim(),
          content: newTemplate.content.trim(),
          channel_hint: selectedChannel,
          shortcut: newTemplate.shortcut.trim() || null,
          subject: selectedChannel === "email" ? (newTemplate.subject.trim() || null) : null,
        }),
      })

      if (res.ok) {
        await loadTemplates()
        setShowAddForm(false)
        setNewTemplate({ title: "", content: "", shortcut: "", subject: "" })
      } else {
        const data = await res.json()
        setError(data.detail || "Erro ao criar template")
      }
    } catch {
      setError("Erro ao criar template")
    } finally {
      setSaving(false)
    }
  }

  // Atualizar template
  const updateTemplate = async (templateId: string) => {
    if (!editForm.title.trim() || !editForm.content.trim()) return

    setSaving(true)
    setError(null)

    try {
      const res = await apiFetch(`/templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.title.trim(),
          content: editForm.content.trim(),
          shortcut: editForm.shortcut.trim() || null,
          subject: selectedChannel === "email" ? (editForm.subject.trim() || null) : null,
        }),
      })

      if (res.ok) {
        await loadTemplates()
        setEditingId(null)
      } else {
        const data = await res.json()
        setError(data.detail || "Erro ao atualizar template")
      }
    } catch {
      setError("Erro ao atualizar template")
    } finally {
      setSaving(false)
    }
  }

  // Excluir template
  const deleteTemplate = async (templateId: string) => {
    if (!confirm("Tem certeza que deseja excluir este template?")) return

    setError(null)

    try {
      const res = await apiFetch(`/templates/${templateId}`, {
        method: "DELETE",
      })

      if (res.ok) {
        setTemplates(prev => prev.filter(t => t.id !== templateId))
      } else {
        const data = await res.json()
        setError(data.detail || "Erro ao excluir template")
      }
    } catch {
      setError("Erro ao excluir template")
    }
  }

  // Iniciar edicao
  const startEdit = (template: Template) => {
    setEditingId(template.id)
    setEditForm({
      title: template.title,
      content: template.content,
      shortcut: template.shortcut || "",
      subject: template.subject || "",
    })
  }

  // Cancelar edicao
  const cancelEdit = () => {
    setEditingId(null)
    setEditForm({ title: "", content: "", shortcut: "", subject: "" })
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5 text-violet-500" />
            Templates de Mensagem
          </h2>
          <p className="text-sm text-zinc-500">
            Respostas rapidas organizadas por canal
          </p>
        </div>
        <button
          onClick={() => {
            setShowAddForm(true)
            setNewTemplate({ title: "", content: "", shortcut: "", subject: "" })
          }}
          className="flex items-center gap-2 rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600"
        >
          <Plus className="h-4 w-4" />
          Novo Template
        </button>
      </div>

      {/* Erro */}
      {error && (
        <div className="mx-4 mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Abas de canal */}
      <div className="flex gap-2 overflow-x-auto border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        {CHANNELS.map((channel) => {
          const isSelected = selectedChannel === channel.id
          const count = templates.filter(t => t.channel_hint === channel.id).length

          return (
            <button
              key={channel.id}
              onClick={() => setSelectedChannel(channel.id)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                isSelected
                  ? `${channel.color} text-white`
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              {channel.icon}
              {channel.label}
              {count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                  isSelected
                    ? "bg-white/20"
                    : "bg-zinc-200 dark:bg-zinc-700"
                }`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Conteudo */}
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          </div>
        ) : (
          <>
            {/* Form de criacao */}
            {showAddForm && (
              <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50 p-4 dark:border-violet-800 dark:bg-violet-900/20">
                <h3 className="mb-3 text-sm font-medium">
                  Novo Template - {CHANNELS.find(c => c.id === selectedChannel)?.label}
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Titulo *</label>
                    <input
                      type="text"
                      value={newTemplate.title}
                      onChange={(e) => setNewTemplate(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Ex: Boas-vindas, Follow-up..."
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                    />
                  </div>

                  {/* Subject - apenas para Email */}
                  {selectedChannel === "email" && (
                    <div>
                      <label className="mb-1 block text-sm font-medium">Assunto do Email</label>
                      <input
                        type="text"
                        value={newTemplate.subject}
                        onChange={(e) => setNewTemplate(prev => ({ ...prev, subject: e.target.value }))}
                        placeholder="Ex: Sua proposta comercial - {deal}"
                        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                      />
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block text-sm font-medium">Conteudo *</label>
                    <textarea
                      value={newTemplate.content}
                      onChange={(e) => setNewTemplate(prev => ({ ...prev, content: e.target.value }))}
                      placeholder="Ola {nome}, obrigado pelo contato..."
                      rows={4}
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium">Atalho (opcional)</label>
                    <input
                      type="text"
                      value={newTemplate.shortcut}
                      onChange={(e) => setNewTemplate(prev => ({ ...prev, shortcut: e.target.value }))}
                      placeholder="Ex: ola, preco, obrigado"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                    />
                    <p className="mt-1 text-xs text-zinc-500">
                      Digite /{newTemplate.shortcut || "atalho"} para inserir rapidamente
                    </p>
                  </div>

                  {/* Placeholders */}
                  <div className="rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800">
                    <p className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Placeholders disponiveis:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {PLACEHOLDERS.map(p => (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => setNewTemplate(prev => ({
                            ...prev,
                            content: prev.content + p.key
                          }))}
                          className="rounded bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                          title={p.desc}
                        >
                          {p.key}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setShowAddForm(false)
                        setNewTemplate({ title: "", content: "", shortcut: "", subject: "" })
                      }}
                      className="rounded-lg px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={createTemplate}
                      disabled={saving || !newTemplate.title.trim() || !newTemplate.content.trim()}
                      className="flex items-center gap-2 rounded-lg bg-violet-500 px-3 py-1.5 text-sm text-white hover:bg-violet-600 disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      Criar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Lista de templates */}
            {filteredTemplates.length === 0 ? (
              <div className="py-8 text-center text-zinc-500">
                Nenhum template para {CHANNELS.find(c => c.id === selectedChannel)?.label}.
                {!showAddForm && (
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="mt-2 block mx-auto text-violet-500 hover:underline"
                  >
                    Criar primeiro template
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredTemplates.map(template => (
                  <div
                    key={template.id}
                    className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700"
                  >
                    {editingId === template.id ? (
                      /* Modo edicao */
                      <div className="space-y-3">
                        <div>
                          <label className="mb-1 block text-sm font-medium">Titulo *</label>
                          <input
                            type="text"
                            value={editForm.title}
                            onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                          />
                        </div>

                        {/* Subject - apenas para Email */}
                        {selectedChannel === "email" && (
                          <div>
                            <label className="mb-1 block text-sm font-medium">Assunto do Email</label>
                            <input
                              type="text"
                              value={editForm.subject}
                              onChange={(e) => setEditForm(prev => ({ ...prev, subject: e.target.value }))}
                              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                            />
                          </div>
                        )}

                        <div>
                          <label className="mb-1 block text-sm font-medium">Conteudo *</label>
                          <textarea
                            value={editForm.content}
                            onChange={(e) => setEditForm(prev => ({ ...prev, content: e.target.value }))}
                            rows={4}
                            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-medium">Atalho</label>
                          <input
                            type="text"
                            value={editForm.shortcut}
                            onChange={(e) => setEditForm(prev => ({ ...prev, shortcut: e.target.value }))}
                            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                          />
                        </div>

                        <div className="flex justify-end gap-2">
                          <button
                            onClick={cancelEdit}
                            className="rounded-lg px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          >
                            <X className="mr-1 inline h-4 w-4" />
                            Cancelar
                          </button>
                          <button
                            onClick={() => updateTemplate(template.id)}
                            disabled={saving || !editForm.title.trim() || !editForm.content.trim()}
                            className="flex items-center gap-2 rounded-lg bg-violet-500 px-3 py-1.5 text-sm text-white hover:bg-violet-600 disabled:opacity-50"
                          >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Salvar
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Modo visualizacao */
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium">{template.title}</p>
                            {template.shortcut && (
                              <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                                /{template.shortcut}
                              </span>
                            )}
                          </div>

                          {/* Assunto (apenas email) */}
                          {template.subject && selectedChannel === "email" && (
                            <p className="mt-1 text-sm text-zinc-500">
                              <span className="font-medium">Assunto:</span> {template.subject}
                            </p>
                          )}

                          {/* Preview do conteudo */}
                          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap line-clamp-3">
                            {template.content}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => startEdit(template)}
                            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            title="Editar"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => deleteTemplate(template.id)}
                            className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
