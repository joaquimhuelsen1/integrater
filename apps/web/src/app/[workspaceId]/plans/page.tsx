import { createServerSupabaseClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import { PlansView } from "@/components/plans/plans-view"

interface PageProps {
  params: Promise<{ workspaceId: string }>
}

export default async function PlansPage({ params }: PageProps) {
  const { workspaceId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  return <PlansView />
}
