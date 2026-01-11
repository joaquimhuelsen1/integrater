import { redirect } from "next/navigation"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { AutomationsView } from "@/components/crm/automations-view"

interface PageProps {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ pipeline_id?: string }>
}

export default async function CRMAutomationsPage({ params, searchParams }: PageProps) {
  const { workspaceId } = await params
  const { pipeline_id } = await searchParams
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  return <AutomationsView workspaceId={workspaceId} pipelineId={pipeline_id} />
}
