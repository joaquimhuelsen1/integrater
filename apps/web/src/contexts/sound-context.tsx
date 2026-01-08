"use client"

import { createContext, useContext, ReactNode } from "react"
import { useSound } from "@/hooks/use-sound"

interface SoundContextType {
  isEnabled: boolean
  toggleSound: () => void
  setSoundEnabled: (enabled: boolean) => void
  playSound: (type: "send" | "receive") => void
}

const SoundContext = createContext<SoundContextType | null>(null)

export function SoundProvider({ children }: { children: ReactNode }) {
  const sound = useSound()

  return (
    <SoundContext.Provider value={sound}>
      {children}
    </SoundContext.Provider>
  )
}

export function useSoundContext() {
  const context = useContext(SoundContext)
  if (!context) {
    throw new Error("useSoundContext must be used within a SoundProvider")
  }
  return context
}
