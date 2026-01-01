import { createServerSupabaseClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import { InboxView } from "@/components/inbox-view"

interface PageProps {
  params: Promise<{ workspaceId: string }>
}

export default async function WorkspaceInboxPage({ params }: PageProps) {
  const { workspaceId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Passa workspaceId para o InboxView (para ler hash da URL)
  return <InboxView userEmail={user.email || ""} workspaceId={workspaceId} />
}
