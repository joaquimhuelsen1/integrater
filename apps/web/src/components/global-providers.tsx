"use client"

import { ThemeProvider } from "@/contexts/theme-context"
import { WorkspaceProvider } from "@/contexts/workspace-context"
import { SoundProvider } from "@/contexts/sound-context"
import { BugReportButton } from "@/components/bug-report-button"

interface GlobalProvidersProps {
  children: React.ReactNode
}

/**
 * Providers globais da aplicacao (client-side)
 * Inclui: Theme, Workspace, Sound, BugReportButton
 */
export function GlobalProviders({ children }: GlobalProvidersProps) {
  return (
    <ThemeProvider>
      <WorkspaceProvider>
        <SoundProvider>
          {children}
          <BugReportButton />
        </SoundProvider>
      </WorkspaceProvider>
    </ThemeProvider>
  )
}
