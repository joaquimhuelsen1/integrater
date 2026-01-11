"use client"

import { useState } from "react"
import { ArrowLeft, Zap, History } from "lucide-react"
import Link from "next/link"
import { AutomationRulesList } from "./automation-rules-list"
import { AutomationLogs } from "./automation-logs"

interface AutomationsViewProps {
  workspaceId: string
}

export function AutomationsView({ workspaceId }: AutomationsViewProps) {
  const [activeTab, setActiveTab] = useState<"rules" | "logs">("rules")

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-4">
          <Link
            href={`/${workspaceId}/crm`}
            className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-semibold">Automacoes</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-3xl px-6">
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab("rules")}
              className={`flex items-center gap-2 border-b-2 py-3 text-sm font-medium transition-colors ${
                activeTab === "rules"
                  ? "border-violet-500 text-violet-600 dark:text-violet-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              <Zap className="h-4 w-4" />
              Regras
            </button>
            <button
              onClick={() => setActiveTab("logs")}
              className={`flex items-center gap-2 border-b-2 py-3 text-sm font-medium transition-colors ${
                activeTab === "logs"
                  ? "border-violet-500 text-violet-600 dark:text-violet-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              <History className="h-4 w-4" />
              Logs de Execucao
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl p-6">
        {activeTab === "rules" ? (
          <AutomationRulesList workspaceId={workspaceId} />
        ) : (
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold mb-4">Historico de Execucoes</h2>
            <p className="text-sm text-zinc-500 mb-4">
              Visualize o historico de execucoes das suas automacoes
            </p>
            <AutomationLogs limit={50} />
          </div>
        )}
      </div>
    </div>
  )
}
