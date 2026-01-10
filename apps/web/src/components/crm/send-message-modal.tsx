"use client"

import { useState, useEffect, useMemo, useRef } from "react"
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

interface DealData {
  title: string
  value: number
  contact_name: string
  contact_email: string | null
  contact_phone: string | null
}

interface SendMessageModalProps {
  dealId: string
  contactId: string | null
  isOpen?: boolean
  onClose: () => void
  onSent: () => void
}

type ChannelType = "email" | "openphone_sms"

/**
 * Extrai telefone do campo info do deal
 * Formato esperado: "Label: Valor\n..."
 */
function extractPhoneFromInfo(info: string | null | undefined): string | null {
  if (!info) return null

  // Padrões de label para telefone
  const phoneLabels = ["telefone", "phone", "celular", "whatsapp", "tel", "mobile"]

  for (const line of info.split("\n")) {
    const [label, ...valueParts] = line.split(":")
    if (!label || valueParts.length === 0) continue

    const normalizedLabel = label.toLowerCase().trim()
    if (phoneLabels.some((pl) => normalizedLabel.includes(pl))) {
      const value = valueParts.join(":").trim()
      // Limpar e validar (apenas números, +, espaços, hífens, parênteses)
      const cleaned = value.replace(/[^\d+\s\-()]/g, "").trim()
      if (cleaned.length >= 8) return cleaned
    }
  }

  // Fallback: buscar padrão de telefone no texto todo
  const phoneRegex = /\+?\d{2,3}[\s\-]?\(?\d{2,3}\)?[\s\-]?\d{4,5}[\s\-]?\d{4}/
  const match = info.match(phoneRegex)
  return match ? match[0] : null
}

export function SendMessageModal({
  dealId,
  contactId,
  isOpen = true,
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

  // Inputs manuais para envio direto (sem identity previa)
  const [manualEmail, setManualEmail] = useState("")
  const [manualPhone, setManualPhone] = useState("")

  // Dados carregados
  const [templates, setTemplates] = useState<Template[]>([])
  const [integrationAccounts, setIntegrationAccounts] = useState<IntegrationAccount[]>([])
  const [identities, setIdentities] = useState<ContactIdentity[]>([])
  const [selectedIdentity, setSelectedIdentity] = useState<ContactIdentity | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Preview com placeholders
  const [showPreview, setShowPreview] = useState(false)
  const [dealData, setDealData] = useState<DealData | null>(null)
  const [fullDeal, setFullDeal] = useState<Record<string, unknown> | null>(null)

  // Ref para evitar re-execucao do carregamento
  const loadedRef = useRef(false)

  // Carregar todos os dados ao montar - APENAS dealId, contactId e isOpen como deps
  useEffect(() => {
    if (!isOpen) return
    if (loadedRef.current) return
    loadedRef.current = true

    const loadAll = async () => {
      setIsLoading(true)
      try {
        // 1. Deal data
        const dealRes = await apiFetch(`/deals/${dealId}`)
        let loadedDealData: DealData | null = null
        if (dealRes.ok) {
          const deal = await dealRes.json()
          setFullDeal(deal)  // Salvar deal completo para custom_fields

          // Buscar telefone de multiplas fontes
          let phone: string | null = null
          if (deal.contact?.identities) {
            const phoneIdentity = deal.contact.identities.find(
              (i: ContactIdentity) => i.type === "phone"
            )
            if (phoneIdentity) {
              phone = phoneIdentity.value
            }
          }
          if (!phone && deal.info) {
            phone = extractPhoneFromInfo(deal.info)
          }

          loadedDealData = {
            title: deal.title || "",
            value: deal.value || 0,
            contact_name: deal.contact?.display_name || "",
            contact_email: null,
            contact_phone: phone,
          }
        }

        // 2. Identities do contact
        if (contactId) {
          const identRes = await apiFetch(`/contacts/${contactId}`)
          if (identRes.ok) {
            const contact = await identRes.json()
            const loadedIdentities = contact.identities || []
            setIdentities(loadedIdentities)

            // Auto-preencher email/phone do dealData
            const emailId = loadedIdentities.find((i: ContactIdentity) => i.type === "email")
            const phoneId = loadedIdentities.find((i: ContactIdentity) => i.type === "phone")
            if (loadedDealData && (emailId || phoneId)) {
              loadedDealData = {
                ...loadedDealData,
                contact_email: emailId?.value || null,
                contact_phone: phoneId?.value || loadedDealData.contact_phone || null,
              }
            }
          }
        }

        if (loadedDealData) {
          setDealData(loadedDealData)
        }

        // 3. Templates
        const templatesRes = await apiFetch("/templates")
        if (templatesRes.ok) {
          setTemplates(await templatesRes.json())
        }

        // 4. Integration accounts (email + sms)
        const emailRes = await apiFetch("/integrations?type=email_imap_smtp")
        let allAccounts: IntegrationAccount[] = []
        if (emailRes.ok) {
          allAccounts = await emailRes.json()
        }

        const smsRes = await apiFetch("/integrations?type=openphone")
        if (smsRes.ok) {
          const smsAccounts = await smsRes.json()
          allAccounts = [...allAccounts, ...smsAccounts]
        }
        setIntegrationAccounts(allAccounts)
      } catch (error) {
        console.error("Erro ao carregar dados:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadAll()
  }, [dealId, contactId, isOpen])

  // Filtrar templates pelo canal selecionado - usar useMemo
  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      if (!t.channel_hint) return true
      if (channel === "email") return t.channel_hint === "email"
      if (channel === "openphone_sms") return t.channel_hint === "openphone_sms"
      return true
    })
  }, [templates, channel])

  // Filtrar contas pelo canal selecionado - usar useMemo
  const filteredAccounts = useMemo(() => {
    return integrationAccounts.filter((a) => {
      if (channel === "email") return a.type === "email_imap_smtp"
      if (channel === "openphone_sms") return a.type === "openphone"
      return false
    })
  }, [integrationAccounts, channel])

  // Filtrar identities pelo canal selecionado - usar useMemo
  const filteredIdentities = useMemo(() => {
    return identities.filter((i) => {
      if (channel === "email") return i.type === "email"
      if (channel === "openphone_sms") return i.type === "phone"
      return false
    })
  }, [identities, channel])

  // Reset quando canal muda
  useEffect(() => {
    setIntegrationAccountId("")
    setSelectedIdentity(null)
    setManualEmail("")
    setManualPhone("")
  }, [channel])

  // Pre-preencher inputs manuais com custom_fields quando nao tem identities
  useEffect(() => {
    if (filteredIdentities.length === 0 && fullDeal?.custom_fields) {
      const cf = fullDeal.custom_fields as Record<string, unknown>
      if (channel === "email" && cf.email_compra) {
        setManualEmail(String(cf.email_compra))
      }
      if (channel === "openphone_sms" && cf.telefone_contato) {
        setManualPhone(String(cf.telefone_contato))
      }
    }
  }, [channel, filteredIdentities.length, fullDeal])

  // Auto-selecionar primeira conta quando disponivel E nao tem selecao
  // Usar length para evitar loops
  useEffect(() => {
    const firstAccount = filteredAccounts[0]
    if (filteredAccounts.length > 0 && !integrationAccountId && firstAccount) {
      setIntegrationAccountId(firstAccount.id)
    }
  }, [filteredAccounts.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-selecionar primeira identity quando disponivel E nao tem selecao
  useEffect(() => {
    const firstIdentity = filteredIdentities[0]
    if (filteredIdentities.length > 0 && !selectedIdentity && firstIdentity) {
      setSelectedIdentity(firstIdentity)
    }
  }, [filteredIdentities.length]) // eslint-disable-line react-hooks/exhaustive-deps

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

    let result = text
      // Placeholders basicos existentes
      .replace(/\{nome\}/gi, dealData.contact_name || "[nome]")
      .replace(/\{email\}/gi, dealData.contact_email || "[email]")
      .replace(/\{valor\}/gi, formatCurrency(dealData.value))
      .replace(/\{deal\}/gi, dealData.title || "[deal]")

    // Placeholders de custom_fields
    if (fullDeal?.custom_fields && typeof fullDeal.custom_fields === "object") {
      const cf = fullDeal.custom_fields as Record<string, unknown>

      // Placeholders fixos de custom_fields
      result = result
        .replace(/\{email_compra\}/gi, cf.email_compra ? String(cf.email_compra) : "[email_compra]")
        .replace(/\{telefone_contato\}/gi, cf.telefone_contato ? String(cf.telefone_contato) : "[telefone_contato]")
        .replace(/\{nome_completo\}/gi, cf.nome_completo ? String(cf.nome_completo) : "[nome_completo]")

      // Placeholder dinamico: {cf:qualquer_campo}
      result = result.replace(/\{cf:(\w+)\}/gi, (_match, fieldName: string) => {
        const value = cf[fieldName]
        return value !== undefined && value !== null ? String(value) : `[${fieldName}]`
      })
    }

    return result
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val)
  }

  // Verifica se pode enviar (identity OU input manual)
  const canSend = useMemo(() => {
    if (!body.trim() || !integrationAccountId) return false
    // Tem identity selecionada
    if (selectedIdentity) return true
    // OU tem input manual valido
    if (channel === "email" && manualEmail.trim()) return true
    if (channel === "openphone_sms" && manualPhone.trim()) return true
    return false
  }, [body, integrationAccountId, selectedIdentity, channel, manualEmail, manualPhone])

  // Enviar mensagem
  const handleSend = async () => {
    if (!body.trim()) return
    if (!integrationAccountId) {
      alert("Selecione uma conta de envio")
      return
    }

    // Validar destinatario
    const hasIdentity = !!selectedIdentity
    const hasManualEmail = channel === "email" && manualEmail.trim()
    const hasManualPhone = channel === "openphone_sms" && manualPhone.trim()

    if (!hasIdentity && !hasManualEmail && !hasManualPhone) {
      alert("Informe o destinatario")
      return
    }

    setIsSending(true)
    try {
      // Montar payload com identity OU input manual
      const payload: Record<string, unknown> = {
        channel,
        integration_account_id: integrationAccountId,
        body: replacePlaceholders(body),
      }

      if (selectedIdentity) {
        payload.to_identity_id = selectedIdentity.id
      } else if (channel === "email" && manualEmail.trim()) {
        payload.to_email = manualEmail.trim()
      } else if (channel === "openphone_sms" && manualPhone.trim()) {
        payload.to_phone = manualPhone.trim()
      }

      if (channel === "email" && subject) {
        payload.subject = replacePlaceholders(subject)
      }

      if (templateId) {
        payload.template_id = templateId
      }

      const res = await apiFetch(`/deals/${dealId}/send-message`, {
        method: "POST",
        body: JSON.stringify(payload),
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

  if (!isOpen) return null

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
                  <div className="space-y-2">
                    {channel === "email" ? (
                      <div>
                        <input
                          type="email"
                          placeholder="email@exemplo.com"
                          value={manualEmail}
                          onChange={(e) => setManualEmail(e.target.value)}
                          className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                        />
                        <p className="text-xs text-zinc-500 mt-1">
                          Informe o email para envio direto
                        </p>
                      </div>
                    ) : (
                      <div>
                        <input
                          type="tel"
                          placeholder="+55 11 99999-9999"
                          value={manualPhone}
                          onChange={(e) => setManualPhone(e.target.value)}
                          className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                        />
                        <p className="text-xs text-zinc-500 mt-1">
                          Formato: +55 DDD NUMERO
                        </p>
                      </div>
                    )}
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
                  Placeholders: {"{nome}"}, {"{email}"}, {"{valor}"}, {"{deal}"}, {"{email_compra}"}, {"{telefone_contato}"}, {"{nome_completo}"}, {"{cf:campo}"}
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
            disabled={isSending || !canSend}
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
