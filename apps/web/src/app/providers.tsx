import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, type ReactNode } from 'react'
import { RegistryProvider } from '../shell/registry'
import { UndoProvider } from '../platform/ui/undo'
import { queryClient } from './queryClient'
import { registry } from './registry'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RegistryProvider value={registry}>
          <UndoProvider>{children}</UndoProvider>
        </RegistryProvider>
      </QueryClientProvider>
    </StrictMode>
  )
}
