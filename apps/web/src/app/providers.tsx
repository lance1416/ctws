import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, type ReactNode } from 'react'
import { refreshAfterWrites } from '../platform/http/refresh'
import { RegistryProvider } from '../shell/registry'
import { registry } from './registry'

const queryClient: QueryClient = new QueryClient({
  // One retry: the default three hide a down server behind a spinner for seconds.
  defaultOptions: { queries: { retry: 1 } },
  mutationCache: refreshAfterWrites(() => queryClient),
})

export function Providers({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RegistryProvider value={registry}>{children}</RegistryProvider>
      </QueryClientProvider>
    </StrictMode>
  )
}
