export type GroupedItem<T> =
  | { type: "date_divider"; date: Date; dateKey: string }
  | { type: "message"; message: T }

/**
 * Agrupa mensagens por data, inserindo divisores de data entre os grupos.
 * Retorna um array com mensagens e divisores intercalados.
 */
export function groupMessagesByDate<T extends { id: string; sent_at: string }>(
  messages: T[]
): GroupedItem<T>[] {
  if (messages.length === 0) return []

  const result: GroupedItem<T>[] = []
  let currentDateKey: string | null = null

  for (const message of messages) {
    const messageDate = new Date(message.sent_at)
    const dateKey = getDateKey(messageDate)

    // Se mudou o dia, adiciona divisor
    if (dateKey !== currentDateKey) {
      result.push({
        type: "date_divider",
        date: messageDate,
        dateKey,
      })
      currentDateKey = dateKey
    }

    result.push({
      type: "message",
      message,
    })
  }

  return result
}

/**
 * Gera uma chave única para a data (ignora hora/minuto/segundo)
 */
function getDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}
