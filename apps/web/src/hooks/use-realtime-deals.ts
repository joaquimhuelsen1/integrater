"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import { createClient } from "@/lib/supabase"
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js"

/**
 * Hook para escutar mudanças em deals em tempo real via Supabase Realtime.
 *
 * Escuta a tabela `deals` filtrando por pipeline_id.
 * Útil para atualizar o CRM board quando deals são criados, movidos ou deletados.
 *
 * @param options - Opções de configuração do hook
 */

export interface RealtimeDeal {
  id: string
  pipeline_id: string
  stage_id: string
  contact_id: string | null
  owner_id: string
  title: string
  value: number | null
  currency: string
  priority: "low" | "medium" | "high" | "urgent"
  expected_close_date: string | null
  probability: number | null
  notes: string | null
  lost_reason: string | null
  won_at: string | null
  lost_at: string | null
  position: number
  created_at: string
  updated_at: string
}

interface UseRealtimeDealsOptions {
  pipelineId: string | null
  enabled?: boolean
  onInsert?: (deal: RealtimeDeal) => void
  onUpdate?: (deal: RealtimeDeal) => void
  onDelete?: (deal: RealtimeDeal) => void
  onConnectionChange?: (connected: boolean) => void
}

export function useRealtimeDeals({
  pipelineId,
  enabled = true,
  onInsert,
  onUpdate,
  onDelete,
  onConnectionChange,
}: UseRealtimeDealsOptions): { isConnected: boolean } {
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
    payload: RealtimePostgresChangesPayload<RealtimeDeal>
  ) => {
    const { eventType, new: newRecord, old: oldRecord } = payload
    const record = (newRecord || oldRecord) as RealtimeDeal | undefined

    console.log(`[Realtime Deals] ${eventType}:`, record?.id, record?.stage_id)

    switch (eventType) {
      case "INSERT":
        if (newRecord && 'id' in newRecord && onInsertRef.current) {
          onInsertRef.current(newRecord as RealtimeDeal)
        }
        break
      case "UPDATE":
        if (newRecord && 'id' in newRecord && onUpdateRef.current) {
          // Log especial quando stage_id muda (deal movido entre colunas)
          if (oldRecord && 'stage_id' in oldRecord) {
            const oldStageId = (oldRecord as RealtimeDeal).stage_id
            const newStageId = (newRecord as RealtimeDeal).stage_id
            if (oldStageId !== newStageId) {
              console.log(`[Realtime Deals] Deal movido de stage ${oldStageId} para ${newStageId}`)
            }
          }
          onUpdateRef.current(newRecord as RealtimeDeal)
        }
        break
      case "DELETE":
        if (oldRecord && 'id' in oldRecord && onDeleteRef.current) {
          onDeleteRef.current(oldRecord as RealtimeDeal)
        }
        break
    }
  }, [])

  // Setup subscription
  useEffect(() => {
    if (!enabled || !pipelineId) {
      // Cleanup se desabilitado ou sem pipeline
      if (channelRef.current) {
        console.log("[Realtime Deals] Removendo subscription (desabilitado ou sem pipeline)")
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
        setIsConnected(false)
        onConnectionChangeRef.current?.(false)
      }
      return
    }

    // Cria nome único para o canal
    const channelName = `deals:pipeline:${pipelineId}`

    console.log(`[Realtime Deals] Criando subscription para pipeline ${pipelineId}`)

    // Remove canal anterior se existir
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }

    // Cria novo canal sem filtro server-side (filtro no callback para evitar problemas com RLS)
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*", // INSERT, UPDATE, DELETE
          schema: "public",
          table: "deals",
        },
        (payload) => {
          // Filtrar no client-side para evitar problemas com Supabase Realtime + RLS
          const record = (payload.new || payload.old) as RealtimeDeal | undefined
          if (record && record.pipeline_id === pipelineId) {
            handleChange(payload as RealtimePostgresChangesPayload<RealtimeDeal>)
          } else {
            console.log(`[Realtime Deals] Ignorando deal de outro pipeline (${record?.pipeline_id})`)
          }
        }
      )
      .subscribe((status) => {
        console.log(`[Realtime Deals] Status: ${status}`)
        const connected = status === "SUBSCRIBED"
        setIsConnected(connected)
        onConnectionChangeRef.current?.(connected)
      })

    channelRef.current = channel

    // Cleanup
    return () => {
      console.log("[Realtime Deals] Cleanup - removendo subscription")
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [supabase, pipelineId, enabled, handleChange])

  return {
    isConnected,
  }
}
