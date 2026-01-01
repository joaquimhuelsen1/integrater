import { createServerSupabaseClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"

export default async function RootPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Busca workspaces direto do Supabase (mais confiável no server-side)
  const { data: workspaces } = await supabase
    .from("workspaces")
    .select("id, is_default")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })

  if (workspaces && workspaces.length > 0) {
    // Redireciona para o default ou primeiro workspace
    const defaultWs = workspaces.find((ws) => ws.is_default) ?? workspaces[0]
    redirect(`/${defaultWs.id}`)
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
