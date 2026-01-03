"use client"

import { useState, useEffect, useCallback } from "react"
import {
  MessageSquare,
  CheckSquare,
  Square,
  ArrowRight,
  Edit3,
  Trash2,
  Plus,
  Clock,
  Trophy,
  XCircle,
  Sparkles,
  Send,
} from "lucide-react"
import { apiFetch } from "@/lib/api"

interface Activity {
  id: string
  activity_type: string
  content: string | null
  is_completed: boolean
  due_date: string | null
  from_stage?: { id: string; name: string; color: string } | null
  to_stage?: { id: string; name: string; color: string } | null
  field_name: string | null
  old_value: string | null
  new_value: string | null
  created_at: string
}

interface DealTimelineProps {
  dealId: string
  isClosed: boolean
  filterType?: string // "note", "task", etc. para filtrar atividades
}

export function DealTimeline({ dealId, isClosed, filterType }: DealTimelineProps) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddNote, setShowAddNote] = useState(false)
  const [showAddTask, setShowAddTask] = useState(false)
  const [noteContent, setNoteContent] = useState("")
  const [taskContent, setTaskContent] = useState("")
  const [taskDueDate, setTaskDueDate] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const loadActivities = useCallback(async () => {
    try {
      const res = await apiFetch(`/deals/${dealId}/activities`)
      if (res.ok) {
        const data = await res.json()
        setActivities(data)
      }
    } catch (error) {
      console.error("Erro ao carregar atividades:", error)
    } finally {
      setIsLoading(false)
    }
  }, [dealId])

  useEffect(() => {
    loadActivities()
  }, [loadActivities])

  const handleAddNote = async () => {
    if (!noteContent.trim()) return

    setIsSaving(true)
    try {
      const res = await apiFetch(`/deals/${dealId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activity_type: "note",
          content: noteContent.trim(),
        }),
      })

      if (res.ok) {
        const newActivity = await res.json()
        setActivities((prev) => [newActivity, ...prev])
        setNoteContent("")
        setShowAddNote(false)
      }
    } catch (error) {
      console.error("Erro ao adicionar nota:", error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddTask = async () => {
    if (!taskContent.trim()) return

    setIsSaving(true)
    try {
      const res = await apiFetch(`/deals/${dealId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activity_type: "task",
          content: taskContent.trim(),
          due_date: taskDueDate || null,
        }),
      })

      if (res.ok) {
        const newActivity = await res.json()
        setActivities((prev) => [newActivity, ...prev])
        setTaskContent("")
        setTaskDueDate("")
        setShowAddTask(false)
      }
    } catch (error) {
      console.error("Erro ao adicionar tarefa:", error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleTask = async (activity: Activity) => {
    try {
      const res = await apiFetch(
        `/deals/${dealId}/activities/${activity.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ is_completed: !activity.is_completed }),
        }
      )

      if (res.ok) {
        setActivities((prev) =>
          prev.map((a) =>
            a.id === activity.id ? { ...a, is_completed: !a.is_completed } : a
          )
        )
      }
    } catch (error) {
      console.error("Erro ao atualizar tarefa:", error)
    }
  }

  const handleDeleteActivity = async (activityId: string) => {
    try {
      const res = await fetch(
        `${API_URL}/deals/${dealId}/activities/${activityId}`,
        { method: "DELETE" }
      )

      if (res.ok) {
        setActivities((prev) => prev.filter((a) => a.id !== activityId))
      }
    } catch (error) {
      console.error("Erro ao deletar atividade:", error)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "Agora"
    if (diffMins < 60) return `${diffMins}min atrás`
    if (diffHours < 24) return `${diffHours}h atrás`
    if (diffDays < 7) return `${diffDays}d atrás`

    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    })
  }

  const formatDueDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dueDate = new Date(dateStr)
    dueDate.setHours(0, 0, 0, 0)

    const diffDays = Math.ceil(
      (dueDate.getTime() - today.getTime()) / 86400000
    )

    if (diffDays < 0) return { text: "Atrasada", color: "text-red-500" }
    if (diffDays === 0) return { text: "Hoje", color: "text-orange-500" }
    if (diffDays === 1) return { text: "Amanhã", color: "text-yellow-600" }

    return {
      text: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      color: "text-zinc-500",
    }
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "note":
        return <MessageSquare className="h-4 w-4 text-blue-500" />
      case "task":
        return <CheckSquare className="h-4 w-4 text-purple-500" />
      case "stage_change":
        return <ArrowRight className="h-4 w-4 text-green-500" />
      case "field_change":
        return <Edit3 className="h-4 w-4 text-orange-500" />
      case "created":
        return <Sparkles className="h-4 w-4 text-yellow-500" />
      case "won":
        return <Trophy className="h-4 w-4 text-green-500" />
      case "lost":
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <Clock className="h-4 w-4 text-zinc-400" />
    }
  }

  const renderActivityContent = (activity: Activity) => {
    switch (activity.activity_type) {
      case "note":
        return (
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            {activity.content}
          </p>
        )

      case "task":
        return (
          <div className="flex items-start gap-2">
            <button
              onClick={() => handleToggleTask(activity)}
              disabled={isClosed}
              className="mt-0.5 flex-shrink-0"
            >
              {activity.is_completed ? (
                <CheckSquare className="h-4 w-4 text-green-500" />
              ) : (
                <Square className="h-4 w-4 text-zinc-400 hover:text-zinc-600" />
              )}
            </button>
            <div className="flex-1">
              <p
                className={`text-sm ${
                  activity.is_completed
                    ? "text-zinc-400 line-through"
                    : "text-zinc-700 dark:text-zinc-300"
                }`}
              >
                {activity.content}
              </p>
              {activity.due_date && !activity.is_completed && (
                <span
                  className={`text-xs ${formatDueDate(activity.due_date).color}`}
                >
                  {formatDueDate(activity.due_date).text}
                </span>
              )}
            </div>
          </div>
        )

      case "stage_change":
        if (!activity.from_stage && !activity.to_stage) {
          return (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Etapa alterada
            </p>
          )
        }
        return (
          <div className="flex items-center gap-2 text-sm">
            {activity.from_stage ? (
              <span
                className="rounded px-1.5 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: `${activity.from_stage.color}20`,
                  color: activity.from_stage.color,
                }}
              >
                {activity.from_stage.name}
              </span>
            ) : (
              <span className="text-xs text-zinc-400">Início</span>
            )}
            <ArrowRight className="h-3 w-3 text-zinc-400" />
            {activity.to_stage ? (
              <span
                className="rounded px-1.5 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: `${activity.to_stage.color}20`,
                  color: activity.to_stage.color,
                }}
              >
                {activity.to_stage.name}
              </span>
            ) : (
              <span className="text-xs text-zinc-400">Removido</span>
            )}
          </div>
        )

      case "field_change":
        return (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            <span className="font-medium">{activity.field_name}</span>:{" "}
            <span className="text-zinc-400 line-through">{activity.old_value}</span>{" "}
            <ArrowRight className="inline h-3 w-3" />{" "}
            <span>{activity.new_value}</span>
          </p>
        )

      default:
        return (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {activity.content}
          </p>
        )
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <h4 className="flex items-center gap-1.5 text-sm font-medium">
          <Clock className="h-4 w-4 text-zinc-500" />
          Atividades
        </h4>
        {!isClosed && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setShowAddNote(!showAddNote)
                setShowAddTask(false)
              }}
              className={`rounded px-2 py-1 text-xs ${
                showAddNote
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50"
                  : "text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <MessageSquare className="inline h-3 w-3 mr-1" />
              Nota
            </button>
            <button
              onClick={() => {
                setShowAddTask(!showAddTask)
                setShowAddNote(false)
              }}
              className={`rounded px-2 py-1 text-xs ${
                showAddTask
                  ? "bg-purple-100 text-purple-700 dark:bg-purple-900/50"
                  : "text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <CheckSquare className="inline h-3 w-3 mr-1" />
              Tarefa
            </button>
          </div>
        )}
      </div>

      {/* Add Note Form */}
      {showAddNote && (
        <div className="border-b border-zinc-200 bg-blue-50/50 p-3 dark:border-zinc-800 dark:bg-blue-950/20">
          <textarea
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            placeholder="Escreva uma nota..."
            rows={2}
            className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => {
                setShowAddNote(false)
                setNoteContent("")
              }}
              className="rounded px-2 py-1 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700"
            >
              Cancelar
            </button>
            <button
              onClick={handleAddNote}
              disabled={isSaving || !noteContent.trim()}
              className="flex items-center gap-1 rounded bg-blue-500 px-2 py-1 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
            >
              <Send className="h-3 w-3" />
              {isSaving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      )}

      {/* Add Task Form */}
      {showAddTask && (
        <div className="border-b border-zinc-200 bg-purple-50/50 p-3 dark:border-zinc-800 dark:bg-purple-950/20">
          <div className="flex gap-2">
            <input
              type="text"
              value={taskContent}
              onChange={(e) => setTaskContent(e.target.value)}
              placeholder="Descrição da tarefa..."
              className="flex-1 rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800"
            />
            <input
              type="date"
              value={taskDueDate}
              onChange={(e) => setTaskDueDate(e.target.value)}
              className="w-36 rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800"
            />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => {
                setShowAddTask(false)
                setTaskContent("")
                setTaskDueDate("")
              }}
              className="rounded px-2 py-1 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700"
            >
              Cancelar
            </button>
            <button
              onClick={handleAddTask}
              disabled={isSaving || !taskContent.trim()}
              className="flex items-center gap-1 rounded bg-purple-500 px-2 py-1 text-xs font-medium text-white hover:bg-purple-600 disabled:opacity-50"
            >
              <Plus className="h-3 w-3" />
              {isSaving ? "Salvando..." : "Criar Tarefa"}
            </button>
          </div>
        </div>
      )}

      {/* Activities List */}
      <div className="max-h-64 overflow-y-auto">
        {isLoading ? (
          <div className="py-8 text-center text-sm text-zinc-400">
            Carregando...
          </div>
        ) : activities.length === 0 ? (
          <div className="py-8 text-center text-sm text-zinc-400">
            Nenhuma atividade registrada
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {activities
              .filter((a) => !filterType || a.activity_type === filterType)
              .map((activity) => (
              <div
                key={activity.id}
                className="group flex gap-3 px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              >
                <div className="flex-shrink-0 pt-0.5">
                  {getActivityIcon(activity.activity_type)}
                </div>
                <div className="flex-1 min-w-0">
                  {renderActivityContent(activity)}
                  <p className="mt-1 text-xs text-zinc-400">
                    {formatDate(activity.created_at)}
                  </p>
                </div>
                {!isClosed &&
                  (activity.activity_type === "note" ||
                    activity.activity_type === "task") && (
                    <button
                      onClick={() => handleDeleteActivity(activity.id)}
                      className="hidden flex-shrink-0 rounded p-1 text-red-500 hover:bg-red-50 group-hover:block dark:hover:bg-red-950/30"
                      title="Remover"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
