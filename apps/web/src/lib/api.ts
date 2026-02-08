import { getCachedSession } from "./supabase"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

/**
 * Fetch autenticado para API.
 * Usa session cacheada para evitar queries extras ao Supabase.
 * O cache é atualizado automaticamente via onAuthStateChange.
 */
export async function apiFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  // Usa session cacheada (sem query ao Supabase)
  const session = await getCachedSession()

  // Monta headers com token
  // Se body for FormData, nao setar Content-Type (browser seta automaticamente com boundary)
  const isFormData = options.body instanceof FormData
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string>),
  }

  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`
  }

  // Faz requisição
  const url = endpoint.startsWith("http") ? endpoint : `${API_URL}${endpoint}`

  return fetch(url, {
    ...options,
    headers,
  })
}

/**
 * GET autenticado
 */
export async function apiGet<T>(endpoint: string): Promise<T> {
  const res = await apiFetch(endpoint)
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Erro desconhecido" }))
    throw new Error(error.detail || `Erro ${res.status}`)
  }
  return res.json()
}

/**
 * POST autenticado
 */
export async function apiPost<T>(endpoint: string, data?: unknown): Promise<T> {
  const res = await apiFetch(endpoint, {
    method: "POST",
    body: data ? JSON.stringify(data) : undefined,
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Erro desconhecido" }))
    throw new Error(error.detail || `Erro ${res.status}`)
  }
  return res.json()
}

/**
 * PATCH autenticado
 */
export async function apiPatch<T>(endpoint: string, data: unknown): Promise<T> {
  const res = await apiFetch(endpoint, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Erro desconhecido" }))
    throw new Error(error.detail || `Erro ${res.status}`)
  }
  return res.json()
}

/**
 * DELETE autenticado
 */
export async function apiDelete(endpoint: string): Promise<void> {
  const res = await apiFetch(endpoint, { method: "DELETE" })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Erro desconhecido" }))
    throw new Error(error.detail || `Erro ${res.status}`)
  }
}
