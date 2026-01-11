"use client"

import { useState, useEffect, useCallback } from "react"
import { ArrowLeft, Plus, Trash2, Wifi, WifiOff, Sparkles, Edit2, RotateCcw, Play, Save, X, ChevronDown, ChevronUp, MessageSquare, Mail, AlertCircle, CheckCircle, Loader2, Cpu, Settings2, RefreshCw, Clock, Users, Volume2, VolumeX, Zap, Briefcase, ChevronRight } from "lucide-react"
import Link from "next/link"
import { TelegramAuthFlow } from "./telegram-auth-flow"
import { WorkspaceSelector } from "./workspace-selector"
import { ThemeToggle } from "./theme-toggle"
import { useWorkspace } from "@/contexts/workspace-context"
import { useSoundContext } from "@/contexts/sound-context"
import { createClient } from "@/lib/supabase"
import { apiFetch } from "@/lib/api"
import { TemplatesSettings } from "./settings/templates-settings"

interface SettingsViewProps {
  userEmail: string
}

interface TelegramAccount {
  id: string
  label: string
  config: {
    phone_number: string
    telegram_user_id: number
    username?: string
  }
  is_active: boolean
  last_sync_at: string | null
  last_error: string | null
  created_at: string
  status?: string
}

interface Prompt {
  id: string
  name: string
  description: string | null
  prompt_type: string
  content: string
  is_active: boolean
  version: number
  created_at: string
  updated_at: string
}

interface PromptVersion {
  id: string
  prompt_id: string
  version: number
  content: string
  created_at: string
}

interface OpenPhoneAccount {
  id: string
  label: string
  phone_number: string
  is_active: boolean
  created_at: string
}

interface EmailAccount {
  id: string
  label: string
  email: string
  imap_host: string
  smtp_host: string
  is_active: boolean
  created_at: string
  last_error: string | null
}

interface AIModel {
  id: string
  provider: string
  model_id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
}

interface AIFunctionConfig {
  function_key: string
  function_name: string
  function_description: string
  model_id: string | null
  model_name: string | null
}

export function SettingsView({ userEmail }: SettingsViewProps) {
  const [accounts, setAccounts] = useState<TelegramAccount[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAuthFlow, setShowAuthFlow] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Prompts state
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [promptsLoading, setPromptsLoading] = useState(true)
  const [editingPrompt, setEditingPrompt] = useState<string | null>(null)
  const [editContent, setEditContent] = useState("")
  const [testingPrompt, setTestingPrompt] = useState<string | null>(null)
  const [testConversation, setTestConversation] = useState("")
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testLoading, setTestLoading] = useState(false)
  const [versions, setVersions] = useState<Record<string, PromptVersion[]>>({})
  const [showVersions, setShowVersions] = useState<string | null>(null)

  // OpenPhone state
  const [openPhoneAccounts, setOpenPhoneAccounts] = useState<OpenPhoneAccount[]>([])
  const [openPhoneLoading, setOpenPhoneLoading] = useState(true)
  const [showAddOpenPhone, setShowAddOpenPhone] = useState(false)
  const [newOpenPhone, setNewOpenPhone] = useState({ label: "", phone_number: "", api_key: "" })
  const [addingOpenPhone, setAddingOpenPhone] = useState(false)
  const [syncingOpenPhoneContacts, setSyncingOpenPhoneContacts] = useState<string | null>(null)
  const [openPhoneSyncResult, setOpenPhoneSyncResult] = useState<{ synced: number; skipped: number; errors: number } | null>(null)

  // Email state
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([])
  const [emailLoading, setEmailLoading] = useState(true)
  const [showAddEmail, setShowAddEmail] = useState(false)
  const [newEmail, setNewEmail] = useState({
    label: "",
    email: "",
    password: "",
    imap_host: "imap.gmail.com",
    imap_port: 993,
    smtp_host: "smtp.gmail.com",
    smtp_port: 587
  })
  const [addingEmail, setAddingEmail] = useState(false)
  const [testingEmail, setTestingEmail] = useState<string | null>(null)
  const [syncingEmail, setSyncingEmail] = useState<string | null>(null)
  const [emailSyncResult, setEmailSyncResult] = useState<{ found: number; synced: number; success: boolean } | null>(null)
  const [emailSyncPeriod, setEmailSyncPeriod] = useState<string>("1d")

  // AI Models state
  const [aiModels, setAiModels] = useState<AIModel[]>([])
  const [aiModelsLoading, setAiModelsLoading] = useState(true)
  const [aiConfig, setAiConfig] = useState<AIFunctionConfig[]>([])
  const [showAddModel, setShowAddModel] = useState(false)
  const [newModel, setNewModel] = useState({ model_id: "", name: "", description: "" })
  const [addingModel, setAddingModel] = useState(false)
  const [updatingConfig, setUpdatingConfig] = useState<string | null>(null)

  // Sync History state
  const [syncingAccount, setSyncingAccount] = useState<string | null>(null)
  const [syncPeriod, setSyncPeriod] = useState<string>("1d")
  const [syncResult, setSyncResult] = useState<{ jobs: number; success: boolean } | null>(null)


  const { currentWorkspace } = useWorkspace()
  const { isEnabled: isSoundEnabled, toggleSound, playSound } = useSoundContext()

  const loadAccounts = useCallback(async () => {
    if (!currentWorkspace) return
    try {
      const res = await apiFetch(`/telegram/accounts?workspace_id=${currentWorkspace.id}`)
      if (res.ok) {
        const data = await res.json()
        setAccounts(data)
      }
    } catch {
      setError("Erro ao carregar contas")
    } finally {
      setIsLoading(false)
    }
  }, [currentWorkspace])

  const loadWorkerStatus = async () => {
    try {
      const res = await apiFetch(`/telegram/workers/status`)
      if (res.ok) {
        const data = await res.json()
        // Merge worker status with accounts
        setAccounts(prev => prev.map(acc => {
          const worker = data.telegram?.find((w: { account_id: string }) => w.account_id === acc.id)
          return { ...acc, status: worker?.status || "offline" }
        }))
      }
    } catch {
      // Silently fail
    }
  }

  const deleteAccount = async (accountId: string) => {
    if (!confirm("Remover esta conta Telegram?")) return

    try {
      const res = await apiFetch(`/telegram/accounts/${accountId}`, {
        method: "DELETE",
      })
      if (res.ok) {
        setAccounts(prev => prev.filter(a => a.id !== accountId))
      }
    } catch {
      setError("Erro ao remover conta")
    }
  }

  const handleAuthComplete = (integrationId: string) => {
    setShowAuthFlow(false)
    loadAccounts()
  }

  const syncHistory = async (accountId: string, period: string) => {
    if (!currentWorkspace) return
    setSyncingAccount(accountId)
    setSyncResult(null)
    try {
      const res = await apiFetch(`/telegram/sync-history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, period, workspace_id: currentWorkspace.id }),
      })
      if (res.ok) {
        const data = await res.json()
        setSyncResult({ jobs: data.jobs_created, success: true })
      } else {
        setSyncResult({ jobs: 0, success: false })
      }
    } catch {
      setSyncResult({ jobs: 0, success: false })
    } finally {
      setSyncingAccount(null)
    }
  }

  // Prompts functions
  const loadPrompts = useCallback(async () => {
    try {
      const res = await apiFetch(`/prompts/`)
      if (res.ok) {
        const data = await res.json()
        setPrompts(data)
      }
    } catch {
      // Silently fail
    } finally {
      setPromptsLoading(false)
    }
  }, [])

  const loadVersions = async (promptId: string) => {
    try {
      const res = await apiFetch(`/prompts/${promptId}/versions`)
      if (res.ok) {
        const data = await res.json()
        setVersions(prev => ({ ...prev, [promptId]: data }))
      }
    } catch {
      // Silently fail
    }
  }

  const startEditing = (prompt: Prompt) => {
    setEditingPrompt(prompt.id)
    setEditContent(prompt.content)
  }

  const cancelEditing = () => {
    setEditingPrompt(null)
    setEditContent("")
  }

  const savePrompt = async (promptId: string) => {
    try {
      const res = await apiFetch(`/prompts/${promptId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      })
      if (res.ok) {
        loadPrompts()
        setEditingPrompt(null)
        setEditContent("")
      }
    } catch {
      setError("Erro ao salvar prompt")
    }
  }

  const revertVersion = async (promptId: string, version: number) => {
    if (!confirm(`Reverter para versão ${version}?`)) return
    try {
      const res = await apiFetch(`/prompts/${promptId}/revert/${version}`, {
        method: "POST",
      })
      if (res.ok) {
        loadPrompts()
        loadVersions(promptId)
      }
    } catch {
      setError("Erro ao reverter versão")
    }
  }

  const testPrompt = async (promptId: string) => {
    if (!testConversation.trim()) return
    setTestLoading(true)
    setTestResult(null)
    try {
      const res = await apiFetch(`/prompts/${promptId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_text: testConversation }),
      })
      if (res.ok) {
        const data = await res.json()
        setTestResult(data.result)
      }
    } catch {
      setError("Erro ao testar prompt")
    } finally {
      setTestLoading(false)
    }
  }

  const toggleVersions = (promptId: string) => {
    if (showVersions === promptId) {
      setShowVersions(null)
    } else {
      setShowVersions(promptId)
      if (!versions[promptId]) {
        loadVersions(promptId)
      }
    }
  }

  // OpenPhone functions
  const loadOpenPhoneAccounts = useCallback(async () => {
    if (!currentWorkspace) return
    try {
      const res = await apiFetch(`/openphone/accounts?workspace_id=${currentWorkspace.id}`)
      if (res.ok) {
        const data = await res.json()
        setOpenPhoneAccounts(data)
      }
    } catch {
      // Silently fail
    } finally {
      setOpenPhoneLoading(false)
    }
  }, [currentWorkspace])

  const addOpenPhoneAccount = async () => {
    if (!newOpenPhone.label || !newOpenPhone.phone_number || !newOpenPhone.api_key) return
    setAddingOpenPhone(true)
    try {
      const res = await apiFetch(`/openphone/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newOpenPhone),
      })
      if (res.ok) {
        loadOpenPhoneAccounts()
        setShowAddOpenPhone(false)
        setNewOpenPhone({ label: "", phone_number: "", api_key: "" })
      } else {
        setError("Erro ao adicionar conta OpenPhone")
      }
    } catch {
      setError("Erro ao adicionar conta OpenPhone")
    } finally {
      setAddingOpenPhone(false)
    }
  }

  const deleteOpenPhoneAccount = async (accountId: string) => {
    if (!confirm("Remover esta conta OpenPhone?")) return
    try {
      const res = await apiFetch(`/openphone/accounts/${accountId}`, {
        method: "DELETE",
      })
      if (res.ok) {
        setOpenPhoneAccounts(prev => prev.filter(a => a.id !== accountId))
      }
    } catch {
      setError("Erro ao remover conta")
    }
  }

  const syncOpenPhoneContacts = async (accountId: string) => {
    if (!currentWorkspace) return
    setSyncingOpenPhoneContacts(accountId)
    setOpenPhoneSyncResult(null)
    try {
      const res = await apiFetch(`/openphone/contacts/sync?account_id=${accountId}&workspace_id=${currentWorkspace.id}`, {
        method: "POST",
      })
      if (res.ok) {
        const data = await res.json()
        setOpenPhoneSyncResult({ synced: data.synced, skipped: data.skipped, errors: data.errors })
      } else {
        const err = await res.json()
        setError(err.detail || "Erro ao sincronizar contatos")
      }
    } catch {
      setError("Erro ao sincronizar contatos")
    } finally {
      setSyncingOpenPhoneContacts(null)
    }
  }

  // Email functions
  const loadEmailAccounts = useCallback(async () => {
    if (!currentWorkspace) return
    try {
      const res = await apiFetch(`/email/accounts?workspace_id=${currentWorkspace.id}`)
      if (res.ok) {
        const data = await res.json()
        setEmailAccounts(data)
      }
    } catch {
      // Silently fail
    } finally {
      setEmailLoading(false)
    }
  }, [currentWorkspace])

  const addEmailAccount = async () => {
    if (!newEmail.label || !newEmail.email || !newEmail.password || !currentWorkspace) return
    setAddingEmail(true)
    try {
      const res = await apiFetch(`/email/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newEmail, workspace_id: currentWorkspace.id }),
      })
      if (res.ok) {
        loadEmailAccounts()
        setShowAddEmail(false)
        setNewEmail({
          label: "",
          email: "",
          password: "",
          imap_host: "imap.gmail.com",
          imap_port: 993,
          smtp_host: "smtp.gmail.com",
          smtp_port: 587
        })
      } else {
        setError("Erro ao adicionar conta Email")
      }
    } catch {
      setError("Erro ao adicionar conta Email")
    } finally {
      setAddingEmail(false)
    }
  }

  const deleteEmailAccount = async (accountId: string) => {
    if (!confirm("Remover esta conta Email?")) return
    try {
      const res = await apiFetch(`/email/accounts/${accountId}`, {
        method: "DELETE",
      })
      if (res.ok) {
        setEmailAccounts(prev => prev.filter(a => a.id !== accountId))
      }
    } catch {
      setError("Erro ao remover conta")
    }
  }

  const testEmailAccount = async (accountId: string) => {
    setTestingEmail(accountId)
    try {
      const res = await apiFetch(`/email/accounts/${accountId}/test`, {
        method: "POST",
      })
      if (res.ok) {
        setError(null)
        loadEmailAccounts()
      } else {
        const data = await res.json()
        setError(data.detail || "Erro ao testar conexao")
      }
    } catch {
      setError("Erro ao testar conexao")
    } finally {
      setTestingEmail(null)
    }
  }

  const syncEmailHistory = async (accountId: string, period: string) => {
    if (!currentWorkspace) return
    setSyncingEmail(accountId)
    setEmailSyncResult(null)
    try {
      const supabase = createClient()
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token

      const res = await apiFetch(`/email/sync-history`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ account_id: accountId, period, workspace_id: currentWorkspace.id }),
      })
      if (res.ok) {
        const data = await res.json()
        setEmailSyncResult({ found: data.emails_found, synced: data.emails_synced, success: true })
      } else {
        const err = await res.json()
        setError(err.detail || "Erro ao sincronizar emails")
        setEmailSyncResult({ found: 0, synced: 0, success: false })
      }
    } catch {
      setError("Erro ao sincronizar emails")
      setEmailSyncResult({ found: 0, synced: 0, success: false })
    } finally {
      setSyncingEmail(null)
    }
  }

  // AI Models functions
  const loadAiModels = useCallback(async () => {
    try {
      const [modelsRes, configRes] = await Promise.all([
        apiFetch(`/ai-config/models`),
        apiFetch(`/ai-config/config`),
      ])
      if (modelsRes.ok) {
        setAiModels(await modelsRes.json())
      }
      if (configRes.ok) {
        setAiConfig(await configRes.json())
      }
    } catch {
      // Silently fail
    } finally {
      setAiModelsLoading(false)
    }
  }, [])

  const addAiModel = async () => {
    if (!newModel.model_id || !newModel.name) return
    setAddingModel(true)
    try {
      const res = await apiFetch(`/ai-config/models`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newModel),
      })
      if (res.ok) {
        loadAiModels()
        setShowAddModel(false)
        setNewModel({ model_id: "", name: "", description: "" })
      } else {
        const data = await res.json()
        setError(data.detail || "Erro ao adicionar modelo")
      }
    } catch {
      setError("Erro ao adicionar modelo")
    } finally {
      setAddingModel(false)
    }
  }

  const deleteAiModel = async (modelUuid: string) => {
    if (!confirm("Remover este modelo?")) return
    try {
      const res = await apiFetch(`/ai-config/models/${modelUuid}`, {
        method: "DELETE",
      })
      if (res.ok) {
        setAiModels(prev => prev.filter(m => m.id !== modelUuid))
      }
    } catch {
      setError("Erro ao remover modelo")
    }
  }

  const updateFunctionConfig = async (functionKey: string, modelId: string) => {
    setUpdatingConfig(functionKey)
    try {
      const res = await apiFetch(`/ai-config/config/${functionKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_id: modelId }),
      })
      if (res.ok) {
        loadAiModels()
      }
    } catch {
      setError("Erro ao atualizar configuração")
    } finally {
      setUpdatingConfig(null)
    }
  }

  useEffect(() => {
    if (currentWorkspace) {
      loadAccounts()
      loadOpenPhoneAccounts()
      loadEmailAccounts()
    }
    loadPrompts()
    loadAiModels()
  }, [currentWorkspace, loadAccounts, loadPrompts, loadOpenPhoneAccounts, loadEmailAccounts, loadAiModels])

  // Realtime para worker status (substitui polling de 30s)
  useEffect(() => {
    if (accounts.length === 0) return

    const supabase = createClient()

    // Busca inicial
    loadWorkerStatus()

    // Realtime: escuta mudanças em worker_heartbeats
    const channel = supabase
      .channel("worker-status")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "worker_heartbeats",
        },
        () => {
          loadWorkerStatus()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [accounts.length])

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-4">
          <Link
            href="/"
            className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-semibold">Configurações</h1>
          <WorkspaceSelector />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8">
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Links para subpaginas */}
        <section className="mb-8 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            <Link
              href="/settings/workspaces"
              className="flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-blue-100 p-2 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                  <Briefcase className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">Gerenciar Workspaces</p>
                  <p className="text-sm text-zinc-500">Editar, excluir e definir workspace padrao</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-zinc-400" />
            </Link>
            <Link
              href="/settings/automations"
              className="flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-violet-100 p-2 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">Automacoes</p>
                  <p className="text-sm text-zinc-500">Regras automaticas para conversas</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-zinc-400" />
            </Link>
          </div>
        </section>

        {/* Som Section */}
        <section className="mb-8 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className={`rounded-full p-2 ${
                isSoundEnabled
                  ? "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400"
                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
              }`}>
                {isSoundEnabled ? (
                  <Volume2 className="h-5 w-5" />
                ) : (
                  <VolumeX className="h-5 w-5" />
                )}
              </div>
              <div>
                <h2 className="font-semibold">Sons de notificação</h2>
                <p className="text-sm text-zinc-500">
                  Tocar som ao enviar e receber mensagens
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Botão de teste */}
              <button
                onClick={() => playSound("receive")}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Testar
              </button>
              {/* Toggle */}
              <button
                onClick={toggleSound}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  isSoundEnabled ? "bg-violet-500" : "bg-zinc-300 dark:bg-zinc-600"
                }`}
              >
                <span
                  className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    isSoundEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Templates Section - Componente separado com abas por canal */}
        <TemplatesSettings />

        {/* Telegram Section */}
        <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-800">
            <div>
              <h2 className="font-semibold">Contas Telegram</h2>
              <p className="text-sm text-zinc-500">
                Conecte suas contas Telegram para receber e enviar mensagens
              </p>
            </div>
            <button
              onClick={() => setShowAuthFlow(true)}
              className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
            >
              <Plus className="h-4 w-4" />
              Adicionar
            </button>
          </div>

          <div className="p-4">
            {isLoading ? (
              <div className="py-8 text-center text-zinc-500">Carregando...</div>
            ) : accounts.length === 0 ? (
              <div className="py-8 text-center text-zinc-500">
                Nenhuma conta Telegram conectada
              </div>
            ) : (
              <div className="space-y-3">
                {accounts.map(account => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between rounded-lg border border-zinc-200 p-4 dark:border-zinc-700"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`rounded-full p-2 ${
                        account.status === "online"
                          ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
                      }`}>
                        {account.status === "online" ? (
                          <Wifi className="h-5 w-5" />
                        ) : (
                          <WifiOff className="h-5 w-5" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{account.label}</p>
                        <p className="text-sm text-zinc-500">
                          {account.config.phone_number}
                          {account.config.username && ` (@${account.config.username})`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-xs ${
                        account.status === "online"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}>
                        {account.status === "online" ? "Online" : "Offline"}
                      </span>
                      <button
                        onClick={() => deleteAccount(account.id)}
                        className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Sync History */}
            {accounts.length > 0 && (
              <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700">
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Sincronizar Histórico
                </h3>
                <p className="text-xs text-zinc-500 mb-3">
                  Puxar mensagens antigas do Telegram (útil se o worker ficou offline)
                </p>
                <div className="flex flex-wrap gap-3">
                  {accounts.map(account => (
                    <div key={account.id} className="flex items-center gap-2 rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
                      <span className="text-sm">{account.label}</span>
                      <select
                        value={syncPeriod}
                        onChange={(e) => setSyncPeriod(e.target.value)}
                        className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-800"
                        disabled={syncingAccount === account.id}
                      >
                        <option value="1d">1 dia</option>
                        <option value="3d">3 dias</option>
                        <option value="7d">7 dias</option>
                      </select>
                      <button
                        onClick={() => syncHistory(account.id, syncPeriod)}
                        disabled={syncingAccount !== null}
                        className="flex items-center gap-1 rounded bg-blue-500 px-2 py-1 text-xs text-white hover:bg-blue-600 disabled:opacity-50"
                      >
                        {syncingAccount === account.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Clock className="h-3 w-3" />
                        )}
                        Sync
                      </button>
                    </div>
                  ))}
                </div>
                {syncResult && (
                  <div className={`mt-3 text-xs ${syncResult.success ? "text-green-600" : "text-red-600"}`}>
                    {syncResult.success
                      ? `${syncResult.jobs} job(s) de sync criado(s). O worker irá processar em breve.`
                      : "Erro ao iniciar sync"}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* OpenPhone SMS Section */}
        <section className="mt-6 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-800">
            <div>
              <h2 className="font-semibold flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-green-500" />
                Contas OpenPhone SMS
              </h2>
              <p className="text-sm text-zinc-500">
                Conecte seus números OpenPhone para enviar e receber SMS
              </p>
            </div>
            <button
              onClick={() => setShowAddOpenPhone(true)}
              className="flex items-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600"
            >
              <Plus className="h-4 w-4" />
              Adicionar
            </button>
          </div>

          <div className="p-4">
            {openPhoneLoading ? (
              <div className="py-8 text-center text-zinc-500">Carregando...</div>
            ) : openPhoneAccounts.length === 0 && !showAddOpenPhone ? (
              <div className="py-8 text-center text-zinc-500">
                Nenhuma conta OpenPhone conectada
              </div>
            ) : (
              <div className="space-y-3">
                {openPhoneAccounts.map(account => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between rounded-lg border border-zinc-200 p-4 dark:border-zinc-700"
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-full p-2 bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                        <MessageSquare className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">{account.label}</p>
                        <p className="text-sm text-zinc-500">{account.phone_number}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => syncOpenPhoneContacts(account.id)}
                        disabled={syncingOpenPhoneContacts !== null}
                        className="flex items-center gap-1 rounded bg-blue-500 px-2 py-1 text-xs text-white hover:bg-blue-600 disabled:opacity-50"
                        title="Sincronizar nomes dos contatos do OpenPhone"
                      >
                        {syncingOpenPhoneContacts === account.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Users className="h-3 w-3" />
                        )}
                        Sync Contatos
                      </button>
                      <button
                        onClick={() => deleteOpenPhoneAccount(account.id)}
                        className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {openPhoneSyncResult && (
                  <div className={`mt-2 p-2 rounded text-sm ${openPhoneSyncResult.errors === 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
                    Sync: {openPhoneSyncResult.synced} atualizados, {openPhoneSyncResult.skipped} ignorados
                    {openPhoneSyncResult.errors > 0 && `, ${openPhoneSyncResult.errors} erros`}
                  </div>
                )}
              </div>
            )}

            {/* Add OpenPhone Form */}
            {showAddOpenPhone && (
              <div className="mt-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
                <h3 className="font-medium mb-3">Adicionar Conta OpenPhone</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Nome/Label</label>
                    <input
                      type="text"
                      value={newOpenPhone.label}
                      onChange={(e) => setNewOpenPhone(prev => ({ ...prev, label: e.target.value }))}
                      placeholder="Ex: Vendas, Suporte..."
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Número de Telefone (E.164)</label>
                    <input
                      type="text"
                      value={newOpenPhone.phone_number}
                      onChange={(e) => setNewOpenPhone(prev => ({ ...prev, phone_number: e.target.value }))}
                      placeholder="+14155550123"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">API Key</label>
                    <input
                      type="password"
                      value={newOpenPhone.api_key}
                      onChange={(e) => setNewOpenPhone(prev => ({ ...prev, api_key: e.target.value }))}
                      placeholder="Sua API key do OpenPhone"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    />
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <button
                      onClick={() => {
                        setShowAddOpenPhone(false)
                        setNewOpenPhone({ label: "", phone_number: "", api_key: "" })
                      }}
                      className="px-4 py-2 text-sm rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={addOpenPhoneAccount}
                      disabled={addingOpenPhone || !newOpenPhone.label || !newOpenPhone.phone_number || !newOpenPhone.api_key}
                      className="px-4 py-2 text-sm rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-50"
                    >
                      {addingOpenPhone ? "Adicionando..." : "Adicionar"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Email IMAP/SMTP Section */}
        <section className="mt-6 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-800">
            <div>
              <h2 className="font-semibold flex items-center gap-2">
                <Mail className="h-5 w-5 text-orange-500" />
                Contas Email IMAP/SMTP
              </h2>
              <p className="text-sm text-zinc-500">
                Conecte contas de email para receber e enviar mensagens
              </p>
            </div>
            <button
              onClick={() => setShowAddEmail(true)}
              className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
            >
              <Plus className="h-4 w-4" />
              Adicionar
            </button>
          </div>

          <div className="p-4">
            {emailLoading ? (
              <div className="py-8 text-center text-zinc-500">Carregando...</div>
            ) : emailAccounts.length === 0 && !showAddEmail ? (
              <div className="py-8 text-center text-zinc-500">
                Nenhuma conta Email conectada
              </div>
            ) : (
              <div className="space-y-3">
                {emailAccounts.map(account => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between rounded-lg border border-zinc-200 p-4 dark:border-zinc-700"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`rounded-full p-2 ${
                        account.last_error
                          ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                          : "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
                      }`}>
                        {account.last_error ? (
                          <AlertCircle className="h-5 w-5" />
                        ) : (
                          <Mail className="h-5 w-5" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{account.label}</p>
                        <p className="text-sm text-zinc-500">{account.email}</p>
                        {account.last_error && (
                          <p className="text-xs text-red-500 mt-1">{account.last_error}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={emailSyncPeriod}
                        onChange={(e) => setEmailSyncPeriod(e.target.value)}
                        className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-800"
                        disabled={syncingEmail === account.id}
                      >
                        <option value="1d">1 dia</option>
                        <option value="3d">3 dias</option>
                        <option value="7d">7 dias</option>
                      </select>
                      <button
                        onClick={() => syncEmailHistory(account.id, emailSyncPeriod)}
                        disabled={syncingEmail !== null}
                        className="flex items-center gap-1 rounded bg-blue-500 px-2 py-1 text-xs text-white hover:bg-blue-600 disabled:opacity-50"
                      >
                        {syncingEmail === account.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Clock className="h-3 w-3" />
                        )}
                        Sync
                      </button>
                      <button
                        onClick={() => testEmailAccount(account.id)}
                        disabled={testingEmail === account.id}
                        className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                        title="Testar conexao"
                      >
                        {testingEmail === account.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => deleteEmailAccount(account.id)}
                        className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {emailSyncResult && (
                  <div className={`mt-2 p-2 rounded text-sm ${emailSyncResult.success ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                    {emailSyncResult.success
                      ? `Sync concluido: ${emailSyncResult.synced}/${emailSyncResult.found} emails sincronizados`
                      : 'Erro ao sincronizar'}
                  </div>
                )}
              </div>
            )}

            {/* Add Email Form */}
            {showAddEmail && (
              <div className="mt-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
                <h3 className="font-medium mb-3">Adicionar Conta Email</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Nome/Label</label>
                    <input
                      type="text"
                      value={newEmail.label}
                      onChange={(e) => setNewEmail(prev => ({ ...prev, label: e.target.value }))}
                      placeholder="Ex: Comercial, Suporte..."
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Email</label>
                    <input
                      type="email"
                      value={newEmail.email}
                      onChange={(e) => setNewEmail(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="seuemail@gmail.com"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Senha/App Password</label>
                    <input
                      type="password"
                      value={newEmail.password}
                      onChange={(e) => setNewEmail(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="Senha ou App Password do Gmail"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    />
                    <p className="text-xs text-zinc-500 mt-1">
                      Para Gmail, use uma App Password (2FA necessario)
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">IMAP Host</label>
                      <input
                        type="text"
                        value={newEmail.imap_host}
                        onChange={(e) => setNewEmail(prev => ({ ...prev, imap_host: e.target.value }))}
                        placeholder="imap.gmail.com"
                        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">IMAP Port</label>
                      <input
                        type="number"
                        value={newEmail.imap_port}
                        onChange={(e) => setNewEmail(prev => ({ ...prev, imap_port: parseInt(e.target.value) || 993 }))}
                        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">SMTP Host</label>
                      <input
                        type="text"
                        value={newEmail.smtp_host}
                        onChange={(e) => setNewEmail(prev => ({ ...prev, smtp_host: e.target.value }))}
                        placeholder="smtp.gmail.com"
                        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">SMTP Port</label>
                      <input
                        type="number"
                        value={newEmail.smtp_port}
                        onChange={(e) => setNewEmail(prev => ({ ...prev, smtp_port: parseInt(e.target.value) || 587 }))}
                        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <button
                      onClick={() => {
                        setShowAddEmail(false)
                        setNewEmail({
                          label: "",
                          email: "",
                          password: "",
                          imap_host: "imap.gmail.com",
                          imap_port: 993,
                          smtp_host: "smtp.gmail.com",
                          smtp_port: 587
                        })
                      }}
                      className="px-4 py-2 text-sm rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={addEmailAccount}
                      disabled={addingEmail || !newEmail.label || !newEmail.email || !newEmail.password}
                      className="px-4 py-2 text-sm rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
                    >
                      {addingEmail ? "Adicionando..." : "Adicionar"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* AI Models Section */}
        <section className="mt-6 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-800">
            <div>
              <h2 className="font-semibold flex items-center gap-2">
                <Cpu className="h-5 w-5 text-cyan-500" />
                Modelos de IA
              </h2>
              <p className="text-sm text-zinc-500">
                Configure quais modelos usar em cada função
              </p>
            </div>
            <button
              onClick={() => setShowAddModel(true)}
              className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-600"
            >
              <Plus className="h-4 w-4" />
              Adicionar Modelo
            </button>
          </div>

          <div className="p-4">
            {aiModelsLoading ? (
              <div className="py-8 text-center text-zinc-500">Carregando...</div>
            ) : (
              <div className="space-y-6">
                {/* Configuração por Função */}
                <div>
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    Modelo por Função
                  </h3>
                  <div className="space-y-2">
                    {aiConfig.map(config => (
                      <div
                        key={config.function_key}
                        className="flex items-center justify-between rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"
                      >
                        <div>
                          <p className="font-medium text-sm">{config.function_name}</p>
                          <p className="text-xs text-zinc-500">{config.function_description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={config.model_id || (aiModels[0]?.model_id || "")}
                            onChange={(e) => updateFunctionConfig(config.function_key, e.target.value)}
                            disabled={updatingConfig === config.function_key || aiModels.length === 0}
                            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 min-w-[200px]"
                          >
                            {aiModels.map(m => (
                              <option key={m.id} value={m.model_id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                          {updatingConfig === config.function_key && (
                            <Loader2 className="h-4 w-4 animate-spin text-cyan-500" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Lista de Modelos */}
                <div>
                  <h3 className="text-sm font-medium mb-3">Modelos Disponíveis</h3>
                  {aiModels.length === 0 ? (
                    <p className="text-sm text-zinc-500">Nenhum modelo configurado</p>
                  ) : (
                    <div className="space-y-2">
                      {aiModels.map(model => (
                        <div
                          key={model.id}
                          className="flex items-center justify-between rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"
                        >
                          <div className="flex items-center gap-3">
                            <div className="rounded-full p-2 bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400">
                              <Cpu className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{model.name}</p>
                              <p className="text-xs text-zinc-500 font-mono">{model.model_id}</p>
                              {model.description && (
                                <p className="text-xs text-zinc-400 mt-0.5">{model.description}</p>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => deleteAiModel(model.id)}
                            className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add Model Form */}
                {showAddModel && (
                  <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
                    <h3 className="font-medium mb-3">Adicionar Modelo</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium mb-1">ID do Modelo (Gemini)</label>
                        <input
                          type="text"
                          value={newModel.model_id}
                          onChange={(e) => setNewModel(prev => ({ ...prev, model_id: e.target.value }))}
                          placeholder="gemini-2.5-pro-preview-05-06"
                          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Nome</label>
                        <input
                          type="text"
                          value={newModel.name}
                          onChange={(e) => setNewModel(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="Gemini 2.5 Pro"
                          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Descrição (opcional)</label>
                        <input
                          type="text"
                          value={newModel.description}
                          onChange={(e) => setNewModel(prev => ({ ...prev, description: e.target.value }))}
                          placeholder="Modelo mais inteligente para tarefas complexas"
                          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                        />
                      </div>
                      <div className="flex justify-end gap-2 mt-4">
                        <button
                          onClick={() => {
                            setShowAddModel(false)
                            setNewModel({ model_id: "", name: "", description: "" })
                          }}
                          className="px-4 py-2 text-sm rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={addAiModel}
                          disabled={addingModel || !newModel.model_id || !newModel.name}
                          className="px-4 py-2 text-sm rounded-lg bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50"
                        >
                          {addingModel ? "Adicionando..." : "Adicionar"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Prompts Section */}
        <section className="mt-6 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-800">
            <div>
              <h2 className="font-semibold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
                Prompts de IA
              </h2>
              <p className="text-sm text-zinc-500">
                Edite os prompts usados para sugestões e resumos
              </p>
            </div>
          </div>

          <div className="p-4">
            {promptsLoading ? (
              <div className="py-8 text-center text-zinc-500">Carregando...</div>
            ) : prompts.length === 0 ? (
              <div className="py-8 text-center text-zinc-500">
                Nenhum prompt configurado
              </div>
            ) : (
              <div className="space-y-4">
                {prompts.map(prompt => (
                  <div
                    key={prompt.id}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-700"
                  >
                    {/* Prompt Header */}
                    <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-700">
                      <div>
                        <p className="font-medium">{prompt.name}</p>
                        <p className="text-sm text-zinc-500">{prompt.description}</p>
                        <p className="text-xs text-zinc-400 mt-1">
                          Versão {prompt.version} • {prompt.prompt_type}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {editingPrompt !== prompt.id && (
                          <>
                            <button
                              onClick={() => startEditing(prompt)}
                              className="p-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                              title="Editar"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => {
                                setTestingPrompt(testingPrompt === prompt.id ? null : prompt.id)
                                setTestResult(null)
                              }}
                              className={`p-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                testingPrompt === prompt.id ? "bg-purple-100 dark:bg-purple-900/30" : ""
                              }`}
                              title="Testar"
                            >
                              <Play className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => toggleVersions(prompt.id)}
                              className="p-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                              title="Histórico"
                            >
                              {showVersions === prompt.id ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Edit Mode */}
                    {editingPrompt === prompt.id && (
                      <div className="p-4 space-y-3">
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full h-48 p-3 rounded-lg border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 text-sm font-mono resize-none"
                          placeholder="Conteúdo do prompt..."
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={cancelEditing}
                            className="px-3 py-1.5 rounded text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          >
                            <X className="h-4 w-4 inline mr-1" />
                            Cancelar
                          </button>
                          <button
                            onClick={() => savePrompt(prompt.id)}
                            className="px-3 py-1.5 rounded text-sm bg-blue-500 text-white hover:bg-blue-600"
                          >
                            <Save className="h-4 w-4 inline mr-1" />
                            Salvar
                          </button>
                        </div>
                      </div>
                    )}

                    {/* View Mode */}
                    {editingPrompt !== prompt.id && (
                      <div className="p-4">
                        <pre className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap font-mono bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded max-h-32 overflow-y-auto">
                          {prompt.content}
                        </pre>
                      </div>
                    )}

                    {/* Test Mode */}
                    {testingPrompt === prompt.id && (
                      <div className="p-4 border-t border-zinc-200 dark:border-zinc-700 bg-purple-50 dark:bg-purple-900/10">
                        <p className="text-sm font-medium mb-2">Testar Prompt</p>
                        <textarea
                          value={testConversation}
                          onChange={(e) => setTestConversation(e.target.value)}
                          className="w-full h-24 p-3 rounded-lg border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 text-sm resize-none mb-2"
                          placeholder="Cole aqui uma conversa de exemplo para testar..."
                        />
                        <button
                          onClick={() => testPrompt(prompt.id)}
                          disabled={testLoading || !testConversation.trim()}
                          className="px-3 py-1.5 rounded text-sm bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50"
                        >
                          {testLoading ? "Testando..." : "Executar Teste"}
                        </button>
                        {testResult && (
                          <div className="mt-3 p-3 rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                            <p className="text-xs font-medium text-zinc-500 mb-1">Resultado:</p>
                            <p className="text-sm whitespace-pre-wrap">{testResult}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Versions */}
                    {showVersions === prompt.id && versions[prompt.id] && (
                      <div className="p-4 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
                        <p className="text-sm font-medium mb-2">Histórico de Versões</p>
                        {(versions[prompt.id]?.length ?? 0) === 0 ? (
                          <p className="text-sm text-zinc-500">Nenhuma versão anterior</p>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {versions[prompt.id]?.map(v => (
                              <div
                                key={v.id}
                                className="flex items-center justify-between p-2 rounded bg-white dark:bg-zinc-800 text-sm"
                              >
                                <div>
                                  <span className="font-medium">v{v.version}</span>
                                  <span className="text-zinc-500 ml-2">
                                    {new Date(v.created_at).toLocaleString("pt-BR")}
                                  </span>
                                </div>
                                <button
                                  onClick={() => revertVersion(prompt.id, v.version)}
                                  className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700"
                                  title="Reverter para esta versão"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* User Info */}
        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500">Logado como: {userEmail}</p>
        </section>
      </div>

      {/* Auth Flow Modal */}
      {showAuthFlow && currentWorkspace && (
        <TelegramAuthFlow
          onComplete={handleAuthComplete}
          onCancel={() => setShowAuthFlow(false)}
          workspaceId={currentWorkspace.id}
        />
      )}
    </div>
  )
}
