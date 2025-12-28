"use client"

import { useState, useEffect } from "react"
import { MessageSquare, Check, Loader2 } from "lucide-react"
import type { Message } from "./chat-view"

interface ServiceMessageProps {
  message: Message
  onOpenChat?: (telegramUserId: number, userName: string) => void
  onSendWelcome?: (telegramUserId: number, userName: string) => Promise<boolean>
}

export function ServiceMessage({ message, onOpenChat, onSendWelcome }: ServiceMessageProps) {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  // Verifica se já foi enviado (localStorage)
  useEffect(() => {
    const userId = message.raw_payload?.action_user_id
    if (userId) {
      const sentKey = `welcome_sent_${userId}`
      const wasSent = localStorage.getItem(sentKey)
      if (wasSent) setSent(true)
    }
  }, [message.raw_payload?.action_user_id])

  const userId = message.raw_payload?.action_user_id
  const userName = message.raw_payload?.action_user_name || "Usuário"

  // Parse o texto para separar nome da ação
  const text = message.text || ""
  const parts = text.split(userName)
  const actionText = parts.length > 1 && parts[1] ? parts[1].trim() : text

  const handleSendWelcome = async () => {
    if (!userId || sending || sent) return

    setSending(true)
    try {
      const success = await onSendWelcome?.(userId, userName)
      if (success) {
        setSent(true)
        localStorage.setItem(`welcome_sent_${userId}`, "true")
      }
    } finally {
      setSending(false)
    }
  }

  const handleNameClick = () => {
    if (userId) {
      onOpenChat?.(userId, userName)
    }
  }

  // Se não tem userId, renderiza simples
  if (!userId) {
    return (
      <div className="flex justify-center py-1">
        <span className="rounded-full bg-zinc-800/60 px-3 py-1 text-xs text-zinc-400">
          {text}
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center gap-2 py-1">
      <span className="rounded-full bg-zinc-800/60 px-3 py-1 text-xs text-zinc-400">
        <button
          onClick={handleNameClick}
          className="font-medium text-violet-400 underline decoration-transparent transition-all hover:text-violet-300 hover:decoration-violet-300 cursor-pointer"
          title={`Abrir chat com ${userName}`}
        >
          {userName}
        </button>
        {" "}{actionText}
      </span>

      {/* Botão de enviar mensagem */}
      {message.message_type === "service_join" || message.message_type === "service_add" ? (
        sent ? (
          <span className="flex items-center gap-1 rounded-full bg-green-900/50 px-2 py-1 text-xs text-green-400" title="Mensagem já enviada">
            <Check className="h-3 w-3" />
          </span>
        ) : (
          <button
            onClick={handleSendWelcome}
            disabled={sending}
            className="flex items-center gap-1 rounded-full bg-violet-600 px-2 py-1 text-xs text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
            title={`Enviar mensagem para ${userName}`}
          >
            {sending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <MessageSquare className="h-3 w-3" />
            )}
          </button>
        )
      ) : null}
    </div>
  )
}
