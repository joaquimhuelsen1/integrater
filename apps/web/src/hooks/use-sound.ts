"use client"

import { useCallback, useEffect, useRef, useState } from "react"

// Storage key para preferência de som
const SOUND_ENABLED_KEY = "inbox-sound-enabled"

/**
 * Gera um som curto usando Web Audio API
 * Estilo Telegram: send = "pop" agudo, receive = "ding" mais grave
 */
function createSoundGenerator() {
  let audioContext: AudioContext | null = null

  const getContext = () => {
    if (!audioContext && typeof window !== "undefined") {
      audioContext = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    }
    return audioContext
  }

  // Som de envio: "pop" curto e agudo (estilo Telegram)
  const playSend = () => {
    const ctx = getContext()
    if (!ctx) return

    if (ctx.state === "suspended") ctx.resume()

    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    // Som agudo tipo "pop"
    oscillator.frequency.setValueAtTime(880, ctx.currentTime) // A5
    oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.05)
    oscillator.type = "sine"

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08)

    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + 0.08)
  }

  // Som de recebimento: "ding" mais longo e melodioso
  const playReceive = () => {
    const ctx = getContext()
    if (!ctx) return

    if (ctx.state === "suspended") ctx.resume()

    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    // Som melodioso tipo "ding"
    oscillator.frequency.setValueAtTime(587.33, ctx.currentTime) // D5
    oscillator.frequency.setValueAtTime(783.99, ctx.currentTime + 0.05) // G5
    oscillator.type = "sine"

    gainNode.gain.setValueAtTime(0.25, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15)

    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + 0.15)
  }

  return { playSend, playReceive }
}

// Singleton do gerador de sons
let soundGenerator: ReturnType<typeof createSoundGenerator> | null = null

function getSoundGenerator() {
  if (!soundGenerator) {
    soundGenerator = createSoundGenerator()
  }
  return soundGenerator
}

export function useSound() {
  const [isEnabled, setIsEnabled] = useState(true)

  // Carrega preferência do localStorage
  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = localStorage.getItem(SOUND_ENABLED_KEY)
    if (stored !== null) {
      setIsEnabled(stored === "true")
    }
  }, [])

  // Toggle som
  const toggleSound = useCallback(() => {
    setIsEnabled((prev) => {
      const next = !prev
      localStorage.setItem(SOUND_ENABLED_KEY, String(next))
      return next
    })
  }, [])

  // Seta valor direto
  const setSoundEnabled = useCallback((enabled: boolean) => {
    setIsEnabled(enabled)
    localStorage.setItem(SOUND_ENABLED_KEY, String(enabled))
  }, [])

  // Toca um som
  const playSound = useCallback(
    (type: "send" | "receive") => {
      if (!isEnabled) return
      if (typeof window === "undefined") return

      try {
        const generator = getSoundGenerator()
        if (type === "send") {
          generator.playSend()
        } else {
          generator.playReceive()
        }
      } catch (err) {
        console.warn("Erro ao tocar som:", err)
      }
    },
    [isEnabled]
  )

  return {
    isEnabled,
    toggleSound,
    setSoundEnabled,
    playSound,
  }
}
