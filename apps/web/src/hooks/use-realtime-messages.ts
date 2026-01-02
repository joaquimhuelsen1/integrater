"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import { createClient } from "@/lib/supabase"
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js"

/**
 * Hook para escutar mensagens em tempo real via Supabase Realtime.
 * 
 * Substitui o polling de 3s por WebSocket - mais eficiente e sem duplicatas.
 * 
 * @param conversationIds - IDs das conversas para escutar (pode ser 1 ou várias)
 * @param onInsert - Callback quando nova mensagem é inserida
 * @param onUpdate - Callback quando mensagem é atualizada (edit)
 * @param onDelete - Callback quando mensagem é deletada
 */

export interface RealtimeMessage {
  id: string
  conversation_id: string
  direction: "inbound" | "outbound"
  text: string | null
  subject: string | null
  channel: "telegram" | "email" | "openphone_sms"
  sent_at: string
  edited_at?: string | null
  deleted_at?: string | null
  message_type?: string
  external_message_id?: string
  // Campos adicionais do banco
  owner_id: string
  identity_id: string
  integration_account_id?: string | null
}

interface UseRealtimeMessagesOptions {
  conversationIds: string[]
  enabled?: boolean
  onInsert?: (message: RealtimeMessage) => void
  onUpdate?: (message: RealtimeMessage) => void
  onDelete?: (message: RealtimeMessage) => void
  onConnectionChange?: (connected: boolean) => void
}

export function useRealtimeMessages({
  conversationIds,
  enabled = true,
  onInsert,
  onUpdate,
  onDelete,
  onConnectionChange,
}: UseRealtimeMessagesOptions) {
  const supabase = createClient()
  const channelRef = useRef<RealtimeChannel | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  
  // Refs para callbacks (evita re-subscribe quando callbacks mudam)
  const onInsertRef = useRef(onInsert)
  const onUpdateRef = useRef(onUpdate)
  const onDeleteRef = useRef(onDelete)
  const onConnectionChangeRef = useRef(onConnectionChange)
  
  // Atualiza refs quando callbacks mudam
  useEffect(() => { onInsertRef.current = onInsert }, [onInsert])
  useEffect(() => { onUpdateRef.current = onUpdate }, [onUpdate])
  useEffect(() => { onDeleteRef.current = onDelete }, [onDelete])
  useEffect(() => { onConnectionChangeRef.current = onConnectionChange }, [onConnectionChange])

  // Handler para mudanças
  const handleChange = useCallback((
    payload: RealtimePostgresChangesPayload<RealtimeMessage>
  ) => {
    const { eventType, new: newRecord, old: oldRecord } = payload
    const record = (newRecord || oldRecord) as RealtimeMessage | undefined
    
    console.log(`[Realtime] ${eventType}:`, record?.id)
    
    switch (eventType) {
      case "INSERT":
        if (newRecord && 'id' in newRecord && onInsertRef.current) {
          onInsertRef.current(newRecord as RealtimeMessage)
        }
        break
      case "UPDATE":
        if (newRecord && 'id' in newRecord && onUpdateRef.current) {
          onUpdateRef.current(newRecord as RealtimeMessage)
        }
        break
      case "DELETE":
        if (oldRecord && 'id' in oldRecord && onDeleteRef.current) {
          onDeleteRef.current(oldRecord as RealtimeMessage)
        }
        break
    }
  }, [])

  // Setup subscription
  useEffect(() => {
    if (!enabled || conversationIds.length === 0) {
      // Cleanup se desabilitado ou sem conversas
      if (channelRef.current) {
        console.log("[Realtime] Removendo subscription (desabilitado ou sem conversas)")
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
        setIsConnected(false)
        onConnectionChangeRef.current?.(false)
      }
      return
    }

    // Cria nome único para o canal
    const channelName = `messages:${conversationIds.sort().join(",").slice(0, 50)}`
    
    console.log(`[Realtime] Criando subscription para ${conversationIds.length} conversa(s)`)

    // Remove canal anterior se existir
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }

    // Cria novo canal
    // Nota: Supabase Realtime não suporta filter com IN(), então escutamos todas
    // e filtramos no callback
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*", // INSERT, UPDATE, DELETE
          schema: "public",
          table: "messages",
        },
        (payload) => {
          // Filtra por conversation_id no cliente
          const record = (payload.new || payload.old) as RealtimeMessage | undefined
          if (record && conversationIds.includes(record.conversation_id)) {
            handleChange(payload as RealtimePostgresChangesPayload<RealtimeMessage>)
          }
        }
      )
      .subscribe((status) => {
        console.log(`[Realtime] Status: ${status}`)
        const connected = status === "SUBSCRIBED"
        setIsConnected(connected)
        onConnectionChangeRef.current?.(connected)
      })

    channelRef.current = channel

    // Cleanup
    return () => {
      console.log("[Realtime] Cleanup - removendo subscription")
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [supabase, conversationIds.join(","), enabled, handleChange])

  return {
    isConnected,
  }
}
