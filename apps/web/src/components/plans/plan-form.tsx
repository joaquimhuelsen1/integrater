"use client"

import { useState } from "react"
import { X, Loader2, Sparkles } from "lucide-react"

interface PlanFormProps {
  onSubmit: (formData: Record<string, unknown>, conversationContext: string) => Promise<unknown>
  onCancel: () => void
}

interface FormData {
  situacao: string
  objetivos: string
  publico: string
  recursos: string
}

export function PlanForm({ onSubmit, onCancel }: PlanFormProps) {
  const [formData, setFormData] = useState<FormData>({
    situacao: "",
    objetivos: "",
    publico: "",
    recursos: "",
  })
  const [conversationContext, setConversationContext] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const data: Record<string, unknown> = {
      situacao: formData.situacao,
      objetivos: formData.objetivos,
      publico: formData.publico,
      recursos: formData.recursos,
    }

    setIsSubmitting(true)
    try {
      await onSubmit(data, conversationContext)
    } finally {
      setIsSubmitting(false)
    }
  }

  const updateField = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
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
            {/* Situação */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Situação Atual <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formData.situacao}
                onChange={(e) => updateField("situacao", e.target.value)}
                placeholder="Descreva a situação atual do relacionamento ou negócio..."
                required
                rows={3}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>

            {/* Objetivos */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Objetivos <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formData.objetivos}
                onChange={(e) => updateField("objetivos", e.target.value)}
                placeholder="Quais são os objetivos que você deseja alcançar?"
                required
                rows={3}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>

            {/* Público */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Público-Alvo
              </label>
              <textarea
                value={formData.publico}
                onChange={(e) => updateField("publico", e.target.value)}
                placeholder="Quem é o público-alvo deste plano?"
                rows={2}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>

            {/* Recursos */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Recursos Disponíveis
              </label>
              <textarea
                value={formData.recursos}
                onChange={(e) => updateField("recursos", e.target.value)}
                placeholder="Quais recursos você tem disponíveis (tempo, orçamento, equipe, etc)?"
                rows={2}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>

            {/* Contexto Adicional */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Contexto Adicional (opcional)
              </label>
              <textarea
                value={conversationContext}
                onChange={(e) => setConversationContext(e.target.value)}
                placeholder="Adicione qualquer contexto adicional que possa ajudar na criação do plano..."
                rows={3}
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
            disabled={isSubmitting || !formData.situacao || !formData.objetivos}
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
