"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "@/contexts/theme-context"

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      onClick={toggleTheme}
      className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors hover:bg-sidebar-accent"
      title={theme === "light" ? "Modo escuro" : "Modo claro"}
    >
      {theme === "light" ? (
        <Moon className="h-5 w-5 text-sidebar-foreground" />
      ) : (
        <Sun className="h-5 w-5 text-sidebar-foreground" />
      )}
    </button>
  )
}
