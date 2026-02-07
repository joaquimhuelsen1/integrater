import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient, Session } from '@supabase/supabase-js'

// Singleton do cliente Supabase (evita criar novo cliente a cada chamada)
let supabaseClient: SupabaseClient | null = null

// Cache de session em memória
let cachedSession: Session | null = null
let sessionInitialized = false

export function createClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient
  }

  supabaseClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Configura listener para manter cache atualizado
  // onAuthStateChange dispara em: login, logout, token refresh, tab sync
  supabaseClient.auth.onAuthStateChange((event, session) => {
    cachedSession = session
    sessionInitialized = true
  })

  // Inicializa session no primeiro acesso
  supabaseClient.auth.getSession().then(({ data: { session } }) => {
    cachedSession = session
    sessionInitialized = true
  })

  return supabaseClient
}

/**
 * Retorna session cacheada (sem query ao Supabase)
 * Fallback para getSession() apenas se cache não inicializado
 */
export async function getCachedSession(): Promise<Session | null> {
  const client = createClient()

  // Se cache já inicializado, retorna direto (sem query)
  if (sessionInitialized) {
    return cachedSession
  }

  // Fallback: primeira vez, busca do Supabase
  const { data: { session } } = await client.auth.getSession()
  cachedSession = session
  sessionInitialized = true
  return session
}

/**
 * Invalida cache de session (chamar em logout manual se necessário)
 */
export function invalidateSessionCache(): void {
  cachedSession = null
  sessionInitialized = false
}
