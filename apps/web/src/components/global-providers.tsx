"use client"

import { ThemeProvider } from "@/contexts/theme-context"
import { WorkspaceProvider } from "@/contexts/workspace-context"
import { BugReportButton } from "@/components/bug-report-button"

interface GlobalProvidersProps {
  children: React.ReactNode
}

/**
 * Providers globais da aplicacao (client-side)
 * Inclui: Theme, Workspace, BugReportButton
 */
export function GlobalProviders({ children }: GlobalProvidersProps) {
  return (
    <ThemeProvider>
      <WorkspaceProvider>
        {children}
        <BugReportButton />
      </WorkspaceProvider>
    </ThemeProvider>
  )
}
