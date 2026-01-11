import { redirect } from "next/navigation"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { CRMAnalyticsDashboard } from "@/components/crm/crm-analytics-dashboard"

interface PageProps {
  params: Promise<{ workspaceId: string }>
}

export default async function CRMDashboardPage({ params }: PageProps) {
  const { workspaceId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  return <CRMAnalyticsDashboard />
}
