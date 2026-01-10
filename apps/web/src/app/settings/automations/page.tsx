"use client"

import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { AutomationRulesList } from "@/components/settings/automation-rules-list"

export default function AutomationsSettingsPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-4">
          <Link
            href="/settings"
            className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-semibold">Automacoes</h1>
        </div>
      </div>

      <div className="mx-auto max-w-3xl p-6">
        <AutomationRulesList />
      </div>
    </div>
  )
}
