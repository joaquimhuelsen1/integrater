import { createServerSupabaseClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export default async function RootPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Busca workspaces do usuário
  try {
    const res = await fetch(`${API_URL}/workspaces`, {
      cache: "no-store",
    })

    if (res.ok) {
      const workspaces = await res.json()
      if (workspaces && workspaces.length > 0) {
        // Redireciona para o default ou primeiro workspace
        const defaultWs = workspaces.find((ws: { is_default: boolean }) => ws.is_default) ?? workspaces[0]
        redirect(`/${defaultWs.id}`)
      }
    }
  } catch (e) {
    console.error("Erro ao buscar workspaces:", e)
  }

  // Fallback: mostra mensagem se não tem workspaces
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">Nenhum workspace encontrado</h1>
        <p className="text-muted-foreground">
          Crie um workspace para começar.
        </p>
      </div>
    </div>
  )
}
