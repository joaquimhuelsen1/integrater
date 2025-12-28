"use client"

import { useState } from "react"
import { X, Loader2, Phone, KeyRound, Lock } from "lucide-react"

interface TelegramAuthFlowProps {
  onComplete: (integrationId: string) => void
  onCancel: () => void
  workspaceId: string
}

type Step = "phone" | "code" | "2fa"

export function TelegramAuthFlow({ onComplete, onCancel, workspaceId }: TelegramAuthFlowProps) {
  const [step, setStep] = useState<Step>("phone")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [phoneNumber, setPhoneNumber] = useState("")
  const [phoneCodeHash, setPhoneCodeHash] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  const handleStartAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch(`${API_URL}/telegram/auth/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: phoneNumber, workspace_id: workspaceId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || "Erro ao enviar código")
      }

      const data = await res.json()
      setPhoneCodeHash(data.phone_code_hash)
      setStep("code")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch(`${API_URL}/telegram/auth/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: phoneNumber,
          phone_code_hash: phoneCodeHash,
          code,
          workspace_id: workspaceId,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || "Código inválido")
      }

      const data = await res.json()

      if (data.needs_2fa) {
        setStep("2fa")
      } else if (data.integration_id) {
        onComplete(data.integration_id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch(`${API_URL}/telegram/auth/verify-2fa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: phoneNumber,
          password,
          workspace_id: workspaceId,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || "Senha inválida")
      }

      const data = await res.json()
      if (data.integration_id) {
        onComplete(data.integration_id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setIsLoading(false)
    }
  }

  const stepConfig = {
    phone: {
      icon: Phone,
      title: "Número de Telefone",
      description: "Digite seu número com código do país (ex: +5511999999999)",
    },
    code: {
      icon: KeyRound,
      title: "Código de Verificação",
      description: "Digite o código enviado para seu Telegram ou SMS",
    },
    "2fa": {
      icon: Lock,
      title: "Senha 2FA",
      description: "Digite sua senha de verificação em duas etapas",
    },
  }

  const StepIcon = stepConfig[step].icon

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-blue-100 p-2 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <StepIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold">{stepConfig[step].title}</h2>
              <p className="text-sm text-zinc-500">{stepConfig[step].description}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Phone Step */}
        {step === "phone" && (
          <form onSubmit={handleStartAuth}>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+5511999999999"
              className="mb-4 w-full rounded-lg border border-zinc-300 px-4 py-3 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800"
              required
              autoFocus
            />
            <button
              type="submit"
              disabled={isLoading || !phoneNumber}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 py-3 font-medium text-white hover:bg-blue-600 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Enviar Código"
              )}
            </button>
          </form>
        )}

        {/* Code Step */}
        {step === "code" && (
          <form onSubmit={handleVerifyCode}>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="12345"
              maxLength={5}
              className="mb-4 w-full rounded-lg border border-zinc-300 px-4 py-3 text-center text-2xl tracking-widest focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800"
              required
              autoFocus
            />
            <button
              type="submit"
              disabled={isLoading || code.length < 5}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 py-3 font-medium text-white hover:bg-blue-600 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verificando...
                </>
              ) : (
                "Verificar Código"
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("phone")
                setCode("")
                setError(null)
              }}
              className="mt-3 w-full py-2 text-sm text-zinc-500 hover:text-zinc-700"
            >
              Voltar
            </button>
          </form>
        )}

        {/* 2FA Step */}
        {step === "2fa" && (
          <form onSubmit={handleVerify2FA}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Sua senha 2FA"
              className="mb-4 w-full rounded-lg border border-zinc-300 px-4 py-3 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800"
              required
              autoFocus
            />
            <button
              type="submit"
              disabled={isLoading || !password}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 py-3 font-medium text-white hover:bg-blue-600 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verificando...
                </>
              ) : (
                "Verificar Senha"
              )}
            </button>
          </form>
        )}

        {/* Progress */}
        <div className="mt-6 flex justify-center gap-2">
          {(["phone", "code", "2fa"] as Step[]).map((s, i) => (
            <div
              key={s}
              className={`h-2 w-8 rounded-full ${
                step === s
                  ? "bg-blue-500"
                  : i < ["phone", "code", "2fa"].indexOf(step)
                  ? "bg-blue-300"
                  : "bg-zinc-200 dark:bg-zinc-700"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
