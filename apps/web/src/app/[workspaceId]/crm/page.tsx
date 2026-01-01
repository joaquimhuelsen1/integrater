import { redirect } from "next/navigation"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { CRMView } from "@/components/crm/crm-view"

interface PageProps {
  params: Promise<{ workspaceId: string }>
}

export default async function CRMPage({ params }: PageProps) {
  const { workspaceId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  return <CRMView />
}
