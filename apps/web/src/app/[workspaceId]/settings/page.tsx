import { createServerSupabaseClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import { SettingsView } from "@/components/settings-view"

interface PageProps {
  params: Promise<{ workspaceId: string }>
}

export default async function SettingsPage({ params }: PageProps) {
  const { workspaceId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  return <SettingsView userEmail={user.email || ""} />
}
