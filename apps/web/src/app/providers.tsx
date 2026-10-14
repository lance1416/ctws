import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, type ReactNode } from 'react'
import { RegistryProvider } from '../shell/registry'
import { registry } from './registry'

// One retry: the default three hide a down server behind a spinner for seconds.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } })

export function Providers({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RegistryProvider value={registry}>{children}</RegistryProvider>
      </QueryClientProvider>
    </StrictMode>
  )
}
