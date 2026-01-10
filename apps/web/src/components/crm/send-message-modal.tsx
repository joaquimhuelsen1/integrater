"use client"

import { useState, useEffect, useCallback } from "react"
import { X, Send, Mail, MessageSquare, FileText, Eye } from "lucide-react"
import { apiFetch } from "@/lib/api"

interface Template {
  id: string
  title: string
  content: string
  channel_hint: string | null
  shortcut: string | null
}

interface IntegrationAccount {
  id: string
  type: string
  account_name: string | null
  is_active: boolean
}

interface ContactIdentity {
  id: string
  type: string
  value: string
  label: string | null
}

interface SendMessageModalProps {
  dealId: string
  contactId: string | null
  onClose: () => void
  onSent: () => void
}

type ChannelType = "email" | "openphone_sms"

export function SendMessageModal({
  dealId,
  contactId,
  onClose,
  onSent,
}: SendMessageModalProps) {
  // Estado principal
  const [channel, setChannel] = useState<ChannelType>("email")
  const [integrationAccountId, setIntegrationAccountId] = useState<string>("")
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [isSending, setIsSending] = useState(false)

  // Dados carregados
  const [templates, setTemplates] = useState<Template[]>([])
  const [integrationAccounts, setIntegrationAccounts] = useState<IntegrationAccount[]>([])
  const [identities, setIdentities] = useState<ContactIdentity[]>([])
  const [selectedIdentity, setSelectedIdentity] = useState<ContactIdentity | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Preview com placeholders
  const [showPreview, setShowPreview] = useState(false)
  const [dealData, setDealData] = useState<{
    title: string
    value: number
    contact_name: string
    contact_email: string
  } | null>(null)

  // Carregar dados do deal para preview
  const loadDealData = useCallback(async () => {
    try {
      const res = await apiFetch(`/deals/${dealId}`)
      if (res.ok) {
        const data = await res.json()
        setDealData({
          title: data.title || "",
          value: data.value || 0,
          contact_name: data.contact?.display_name || "",
          contact_email: "",
        })
      }
    } catch (error) {
      console.error("Erro ao carregar deal:", error)
    }
  }, [dealId])

  // Carregar identities do contato
  const loadIdentities = useCallback(async () => {
    if (!contactId) return

    try {
      const res = await apiFetch(`/contacts/${contactId}`)
      if (res.ok) {
        const data = await res.json()
        if (data.identities) {
          setIdentities(data.identities)
          // Preencher email do deal
          const emailIdentity = data.identities.find(
            (i: ContactIdentity) => i.type === "email"
          )
          if (emailIdentity && dealData) {
            setDealData({ ...dealData, contact_email: emailIdentity.value })
          }
        }
      }
    } catch (error) {
      console.error("Erro ao carregar identities:", error)
    }
  }, [contactId, dealData])

  // Carregar templates
  const loadTemplates = useCallback(async () => {
    try {
      const res = await apiFetch(`/templates`)
      if (res.ok) {
        const data = await res.json()
        setTemplates(data)
      }
    } catch (error) {
      console.error("Erro ao carregar templates:", error)
    }
  }, [])

  // Carregar contas de integracao
  const loadIntegrationAccounts = useCallback(async () => {
    try {
      // Buscar contas de email IMAP/SMTP
      const emailRes = await apiFetch(`/integrations?type=email_imap_smtp`)
      if (emailRes.ok) {
        const emailAccounts = await emailRes.json()

        // Buscar contas OpenPhone
        const smsRes = await apiFetch(`/integrations?type=openphone`)
        let smsAccounts: IntegrationAccount[] = []
        if (smsRes.ok) {
          smsAccounts = await smsRes.json()
        }

        setIntegrationAccounts([...emailAccounts, ...smsAccounts])
      }
    } catch (error) {
      console.error("Erro ao carregar integration accounts:", error)
    }
  }, [])

  // Carregar todos os dados ao montar
  useEffect(() => {
    const loadAll = async () => {
      setIsLoading(true)
      await Promise.all([
        loadDealData(),
        loadIdentities(),
        loadTemplates(),
        loadIntegrationAccounts(),
      ])
      setIsLoading(false)
    }
    loadAll()
  }, [loadDealData, loadIdentities, loadTemplates, loadIntegrationAccounts])

  // Filtrar templates pelo canal selecionado
  const filteredTemplates = templates.filter((t) => {
    if (!t.channel_hint) return true
    if (channel === "email") return t.channel_hint === "email"
    if (channel === "openphone_sms") return t.channel_hint === "openphone_sms"
    return true
  })

  // Filtrar contas pelo canal selecionado
  const filteredAccounts = integrationAccounts.filter((a) => {
    if (channel === "email") return a.type === "email_imap_smtp"
    if (channel === "openphone_sms") return a.type === "openphone"
    return false
  })

  // Auto-selecionar primeira conta quando muda o canal
  useEffect(() => {
    const firstAccount = filteredAccounts[0]
    if (filteredAccounts.length > 0 && !integrationAccountId && firstAccount) {
      setIntegrationAccountId(firstAccount.id)
    } else if (filteredAccounts.length > 0 && firstAccount) {
      // Verificar se a conta selecionada ainda pertence ao canal
      const stillValid = filteredAccounts.some((a) => a.id === integrationAccountId)
      if (!stillValid) {
        setIntegrationAccountId(firstAccount.id)
      }
    } else {
      setIntegrationAccountId("")
    }
  }, [channel, filteredAccounts, integrationAccountId])

  // Filtrar identities pelo canal selecionado
  const filteredIdentities = identities.filter((i) => {
    if (channel === "email") return i.type === "email"
    if (channel === "openphone_sms") return i.type === "phone"
    return false
  })

  // Auto-selecionar primeira identity
  useEffect(() => {
    const firstIdentity = filteredIdentities[0]
    if (filteredIdentities.length > 0 && firstIdentity) {
      setSelectedIdentity(firstIdentity)
    } else {
      setSelectedIdentity(null)
    }
  }, [filteredIdentities])

  // Quando seleciona um template, preencher o body
  const handleTemplateSelect = (tplId: string) => {
    setTemplateId(tplId)
    const tpl = templates.find((t) => t.id === tplId)
    if (tpl) {
      setBody(tpl.content)
    }
  }

  // Substituir placeholders no preview
  const replacePlaceholders = (text: string): string => {
    if (!dealData) return text

    return text
      .replace(/\{nome\}/gi, dealData.contact_name || "[nome]")
      .replace(/\{email\}/gi, dealData.contact_email || "[email]")
      .replace(/\{valor\}/gi, formatCurrency(dealData.value))
      .replace(/\{deal\}/gi, dealData.title || "[deal]")
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val)
  }

  // Enviar mensagem
  const handleSend = async () => {
    if (!body.trim()) return
    if (!integrationAccountId) {
      alert("Selecione uma conta de envio")
      return
    }
    if (!selectedIdentity) {
      alert("Contato sem " + (channel === "email" ? "email" : "telefone") + " cadastrado")
      return
    }

    setIsSending(true)
    try {
      // TODO: Endpoint /deals/{id}/send-message ainda nao existe
      // Por enquanto, simular sucesso
      const res = await apiFetch(`/deals/${dealId}/send-message`, {
        method: "POST",
        body: JSON.stringify({
          channel,
          integration_account_id: integrationAccountId,
          to_identity_id: selectedIdentity.id,
          subject: channel === "email" ? subject : undefined,
          body: replacePlaceholders(body),
          template_id: templateId,
        }),
      })

      if (res.ok) {
        onSent()
      } else {
        const error = await res.json().catch(() => ({ detail: "Erro ao enviar" }))
        alert(error.detail || "Erro ao enviar mensagem")
      }
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error)
      alert("Erro ao enviar mensagem")
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50">
      <div className="w-full h-[90vh] md:h-auto md:max-h-[90vh] max-w-lg rounded-t-xl md:rounded-lg bg-white shadow-xl dark:bg-zinc-900 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-3 md:px-4 py-3 dark:border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Send className="h-5 w-5 text-blue-500" />
            <h2 className="text-lg font-semibold">Enviar Mensagem</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1.5 hover:bg-zinc-100 active:bg-zinc-200 dark:hover:bg-zinc-800 dark:active:bg-zinc-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-zinc-500">Carregando...</div>
            </div>
          ) : (
            <>
              {/* Canal */}
              <div>
                <label className="block text-sm font-medium mb-2">Canal</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setChannel("email")}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-lg border p-3 transition ${
                      channel === "email"
                        ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                        : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700"
                    }`}
                  >
                    <Mail className="h-5 w-5" />
                    <span className="font-medium">Email</span>
                  </button>
                  <button
                    onClick={() => setChannel("openphone_sms")}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-lg border p-3 transition ${
                      channel === "openphone_sms"
                        ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                        : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700"
                    }`}
                  >
                    <MessageSquare className="h-5 w-5" />
                    <span className="font-medium">SMS</span>
                  </button>
                </div>
              </div>

              {/* Conta de envio */}
              <div>
                <label className="block text-sm font-medium mb-2">Conta de Envio</label>
                {filteredAccounts.length === 0 ? (
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-700 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
                    Nenhuma conta de {channel === "email" ? "email" : "SMS"} configurada
                  </div>
                ) : (
                  <select
                    value={integrationAccountId}
                    onChange={(e) => setIntegrationAccountId(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    {filteredAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.account_name || acc.type}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Destinatario */}
              <div>
                <label className="block text-sm font-medium mb-2">Destinatario</label>
                {filteredIdentities.length === 0 ? (
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-700 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
                    {contactId
                      ? `Contato sem ${channel === "email" ? "email" : "telefone"} cadastrado`
                      : "Nenhum contato vinculado ao deal"}
                  </div>
                ) : (
                  <select
                    value={selectedIdentity?.id || ""}
                    onChange={(e) => {
                      const identity = filteredIdentities.find((i) => i.id === e.target.value)
                      setSelectedIdentity(identity || null)
                    }}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    {filteredIdentities.map((identity) => (
                      <option key={identity.id} value={identity.id}>
                        {identity.label ? `${identity.label}: ` : ""}
                        {identity.value}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Template */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  <FileText className="inline h-4 w-4 mr-1" />
                  Template (opcional)
                </label>
                <select
                  value={templateId || ""}
                  onChange={(e) => handleTemplateSelect(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                >
                  <option value="">Sem template</option>
                  {filteredTemplates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.title}
                      {tpl.shortcut ? ` (/${tpl.shortcut})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Subject (apenas email) */}
              {channel === "email" && (
                <div>
                  <label className="block text-sm font-medium mb-2">Assunto</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Assunto do email..."
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </div>
              )}

              {/* Body */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Mensagem</label>
                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${
                      showPreview
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <Eye className="h-3 w-3" />
                    Preview
                  </button>
                </div>
                {showPreview ? (
                  <div className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50 min-h-[120px] whitespace-pre-wrap">
                    {replacePlaceholders(body) || (
                      <span className="text-zinc-400">Mensagem vazia</span>
                    )}
                  </div>
                ) : (
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Digite sua mensagem... Use {nome}, {email}, {valor} para placeholders"
                    rows={5}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 resize-none"
                  />
                )}
                <p className="mt-1 text-xs text-zinc-500">
                  Placeholders: {"{nome}"}, {"{email}"}, {"{valor}"}, {"{deal}"}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-zinc-200 px-3 md:px-4 py-3 dark:border-zinc-800 flex-shrink-0 bg-white dark:bg-zinc-900">
          <button
            onClick={onClose}
            className="rounded-lg bg-zinc-100 px-4 py-2.5 md:py-2 text-sm font-medium hover:bg-zinc-200 active:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:active:bg-zinc-600"
          >
            Cancelar
          </button>
          <button
            onClick={handleSend}
            disabled={isSending || !body.trim() || !integrationAccountId || !selectedIdentity}
            className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2.5 md:py-2 text-sm font-medium text-white hover:bg-blue-600 active:bg-blue-700 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {isSending ? "Enviando..." : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  )
}
