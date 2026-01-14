"use client"

import { useState, useEffect } from "react"
import { MessageSquare, Loader2, RefreshCw, FileText, List, HelpCircle, AlertCircle, Send } from "lucide-react"
import { apiPost } from "@/lib/api"

type PlanStatusType = "draft" | "generating_structure" | "generating_intro" | "deepening_blocks" | "generating_summary" | "completed" | "error"

interface Plan {
  id: string
  form_data: Record<string, unknown>
  conversation_context: string | null
  status: PlanStatusType
  structure: Record<string, unknown> | null
  introduction: string | null
  deepened_blocks: Record<string, unknown>
  summary: string | null
  faq: unknown[]
  error_message: string | null
  created_at: string
}

interface PlanViewerProps {
  plan: Plan
  onRefresh: () => void
  onClose: () => void
}

type TabType = "intro" | "blocks" | "summary" | "faq"

interface ConversationMessage {
  id: string
  role: "user" | "assistant"
  content: string
  created_at: string
}

// Simple markdown renderer
function renderMarkdown(text: string): React.ReactNode {
  if (!text) return null

  const lines = text.split("\n")
  const elements: React.ReactNode[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""
    // Headers
    if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="mt-4 text-lg font-semibold">{line.slice(4)}</h3>)
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="mt-6 text-xl font-bold">{line.slice(3)}</h2>)
    } else if (line.startsWith("**")) {
      // Bold
      elements.push(<p key={i} className="font-semibold">{line.replace(/\*\*/g, "")}</p>)
    } else if (line.trim().startsWith("- ")) {
      // List items
      elements.push(<li key={i} className="ml-4">{line.trim().slice(2)}</li>)
    } else if (/^\d+\.\s/.test(line.trim())) {
      // Numbered list
      elements.push(<li key={i} className="ml-4">{line.trim().replace(/^\d+\.\s/, "")}</li>)
    } else if (line.trim() === "") {
      // Empty line
      elements.push(<br key={i} />)
    } else {
      // Regular paragraph
      elements.push(<p key={i} className="my-2">{line}</p>)
    }
  }

  return <>{elements}</>
}

export function PlanViewer({ plan, onRefresh, onClose }: PlanViewerProps) {
  const [activeTab, setActiveTab] = useState<TabType>("intro")
  const [continueMessage, setContinueMessage] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [conversation, setConversation] = useState<ConversationMessage[]>([])
  const [showConversation, setShowConversation] = useState(false)

  const isLoading = plan.status === "draft" ||
    plan.status === "generating_structure" ||
    plan.status === "generating_intro" ||
    plan.status === "deepening_blocks" ||
    plan.status === "generating_summary"

  const hasContent = (tab: TabType) => {
    switch (tab) {
      case "intro":
        return plan.introduction
      case "blocks":
        return Object.keys(plan.deepened_blocks || {}).length > 0
      case "summary":
        return plan.summary
      case "faq":
        return Array.isArray(plan.faq) && plan.faq.length > 0
    }
  }

  const loadConversation = async () => {
    if (!showConversation) {
      setShowConversation(true)
      try {
        const data = await apiPost<{ messages: ConversationMessage[]; total: number }>(
          `/plans/${plan.id}/conversation`,
          {}
        )
        setConversation(data.messages)
      } catch {
        console.error("Erro ao carregar conversa")
      }
    }
  }

  const handleContinue = async () => {
    if (!continueMessage.trim() || isSending) return

    setIsSending(true)
    try {
      const data = await apiPost<{ message: ConversationMessage; response: ConversationMessage }>(
        `/plans/${plan.id}/continue`,
        { message: continueMessage }
      )
      setConversation((prev) => [...prev, data.message, data.response])
      setContinueMessage("")
    } catch {
      console.error("Erro ao continuar conversa")
    } finally {
      setIsSending(false)
    }
  }

  // Auto-refresh when loading
  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(onRefresh, 3000)
      return () => clearInterval(interval)
    }
  }, [isLoading, onRefresh])

  return (
    <div className="space-y-6">
      {/* Plan Header */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-4">
          <h2 className="text-2xl font-bold">
            {plan.form_data?.situacao as string || "Plano de Relacionamento"}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Criado em {new Date(plan.created_at).toLocaleDateString("pt-BR")}
          </p>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2">
          {isLoading ? (
            <div className="flex items-center gap-2 text-blue-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Gerando plano...</span>
            </div>
          ) : plan.status === "completed" ? (
            <div className="flex items-center gap-2 text-green-500">
              <span className="rounded-full bg-green-500/10 px-2 py-1 text-xs font-medium">
                Concluído
              </span>
            </div>
          ) : plan.status === "error" ? (
            <div className="flex items-center gap-2 text-red-500">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">Erro na geração</span>
            </div>
          ) : null}
        </div>

        {/* Error Message */}
        {plan.error_message && (
          <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{String(plan.error_message)}</span>
            </div>
          </div>
        )}

        {/* Form Data Summary */}
        {plan.form_data?.objetivos != null && (
          <div className="mt-4 rounded-md bg-zinc-50 p-3 dark:bg-zinc-800">
            <p className="text-sm font-medium">Objetivos:</p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {String(plan.form_data.objetivos)}
            </p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        <button
          onClick={() => setActiveTab("intro")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "intro"
              ? "border-b-2 border-blue-500 text-blue-500"
              : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          <FileText className="h-4 w-4" />
          Introdução
          {!hasContent("intro") && !isLoading && "(vazio)"}
        </button>
        <button
          onClick={() => setActiveTab("blocks")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "blocks"
              ? "border-b-2 border-blue-500 text-blue-500"
              : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          <List className="h-4 w-4" />
          Blocos
          {!hasContent("blocks") && !isLoading && "(vazio)"}
        </button>
        <button
          onClick={() => setActiveTab("summary")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "summary"
              ? "border-b-2 border-blue-500 text-blue-500"
              : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          <FileText className="h-4 w-4" />
          Resumo
          {!hasContent("summary") && !isLoading && "(vazio)"}
        </button>
        <button
          onClick={() => setActiveTab("faq")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "faq"
              ? "border-b-2 border-blue-500 text-blue-500"
              : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          <HelpCircle className="h-4 w-4" />
          FAQ
          {!hasContent("faq") && !isLoading && "(vazio)"}
        </button>
      </div>

      {/* Tab Content */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-500" />
              <p className="mt-3 text-sm text-zinc-500">Gerando conteúdo do plano...</p>
            </div>
          </div>
        ) : (
          <>
            {activeTab === "intro" && (
              <div className="prose dark:prose-invert max-w-none">
                {plan.introduction ? (
                  <div>{renderMarkdown(plan.introduction)}</div>
                ) : (
                  <p className="text-zinc-500">Nenhuma introdução disponível.</p>
                )}
              </div>
            )}

            {activeTab === "blocks" && (
              <div className="space-y-6">
                {Object.keys(plan.deepened_blocks || {}).length > 0 ? (
                  Object.entries(plan.deepened_blocks).map(([key, block]: [string, unknown]) => {
                    const b = block as { phase?: { title?: string; description?: string }; details?: unknown }
                    const phase = b.phase
                    const title = String(phase?.title ?? key)
                    const description = String(phase?.description ?? "")

                    return (
                      <div key={key} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
                        <h3 className="text-lg font-semibold">{title}</h3>
                        {description && (
                          <p className="mt-1 text-sm text-zinc-500">{description}</p>
                        )}
                                        {b.details ? (
                          <div className="mt-3 text-sm dark:text-zinc-300">
                            {typeof b.details === "string"
                              ? renderMarkdown(String(b.details))
                              : renderMarkdown(JSON.stringify(b.details, null, 2))}
                          </div>
                        ) : null}
                      </div>
                    )
                  })
                ) : (
                  <p className="text-zinc-500">Nenhum bloco disponível.</p>
                )}
              </div>
            )}

            {activeTab === "summary" && (
              <div className="prose dark:prose-invert max-w-none">
                {plan.summary ? (
                  <div>{renderMarkdown(plan.summary)}</div>
                ) : (
                  <p className="text-zinc-500">Nenhum resumo disponível.</p>
                )}
              </div>
            )}

            {activeTab === "faq" && (
              <div className="space-y-4">
                {Array.isArray(plan.faq) && plan.faq.length > 0 ? (
                  plan.faq.map((item: unknown, i: number) => {
                    const faq = item as { question?: string; answer?: string }
                    return (
                      <div key={i} className="border-b border-zinc-200 pb-4 last:border-0 dark:border-zinc-700">
                        <p className="font-medium">
                          Q: {String(faq.question ?? "")}
                        </p>
                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                          A: {String(faq.answer ?? "")}
                        </p>
                      </div>
                    )
                  })
                ) : (
                  <p className="text-zinc-500">Nenhuma FAQ disponível.</p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Continue Conversation */}
      {plan.status === "completed" && (
        <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <button
            onClick={loadConversation}
            className="flex w-full items-center justify-between p-4 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-500" />
              <span className="font-medium">Continuar Conversa</span>
            </div>
            <RefreshCw className="h-4 w-4 text-zinc-400" />
          </button>

          {showConversation && (
            <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
              {/* Conversation History */}
              {conversation.length > 0 && (
                <div className="mb-4 max-h-60 space-y-3 overflow-y-auto">
                  {conversation.map((msg) => (
                    <div
                      key={msg.id}
                      className={`rounded-lg p-3 ${
                        msg.role === "user"
                          ? "bg-blue-50 dark:bg-blue-900/20"
                          : "bg-zinc-100 dark:bg-zinc-800"
                      }`}
                    >
                      <p className="text-xs font-medium uppercase text-zinc-500">
                        {msg.role === "user" ? "Você" : "Assistente"}
                      </p>
                      <p className="mt-1 text-sm">{msg.content}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* New Message */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={continueMessage}
                  onChange={(e) => setContinueMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !isSending && handleContinue()}
                  placeholder="Faça uma pergunta ou solicite uma alteração..."
                  className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
                <button
                  onClick={handleContinue}
                  disabled={!continueMessage.trim() || isSending}
                  className="rounded-md bg-blue-500 p-2 text-white hover:bg-blue-600 disabled:opacity-50"
                >
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
