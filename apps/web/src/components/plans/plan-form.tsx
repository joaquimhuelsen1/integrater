"use client"

import { useState } from "react"
import { X, Loader2, Sparkles } from "lucide-react"

interface PlanFormProps {
  onSubmit: (formData: Record<string, unknown>, conversationContext: string) => Promise<unknown>
  onCancel: () => void
}

interface FormData {
  formulario: string
}

export function PlanForm({ onSubmit, onCancel }: PlanFormProps) {
  const [formData, setFormData] = useState<FormData>({
    formulario: "",
  })
  const [conversationContext, setConversationContext] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const data: Record<string, unknown> = {
      formulario: formData.formulario,
    }

    setIsSubmitting(true)
    try {
      await onSubmit(data, conversationContext)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2 className="text-lg font-semibold">Novo Plano de Relacionamento</h2>
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded p-1 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[70vh] overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            {/* Formulário */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Formulário do Aluno <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formData.formulario}
                onChange={(e) => setFormData({ formulario: e.target.value })}
                placeholder="Cole aqui as respostas do formulário preenchido pelo aluno..."
                required
                rows={8}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>

            {/* Conversa */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Conversa <span className="text-red-500">*</span>
              </label>
              <textarea
                value={conversationContext}
                onChange={(e) => setConversationContext(e.target.value)}
                placeholder="Cole aqui a conversa com o aluno..."
                required
                rows={8}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
          </div>
        </form>

        <div className="flex justify-end gap-2 border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-md px-4 py-2 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
          >
            Cancelar
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={isSubmitting || !formData.formulario || !conversationContext}
            className="flex items-center gap-2 rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Gerar Plano
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
