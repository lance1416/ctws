import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, type ReactNode } from 'react'
import { refreshAfterWrites } from '../platform/http/refresh'
import { retryOnce } from '../platform/http/retry'
import { RegistryProvider } from '../shell/registry'
import { registry } from './registry'

const queryClient: QueryClient = new QueryClient({
  // At most one retry: the default three hide a down server behind a spinner for seconds.
  defaultOptions: { queries: { retry: retryOnce } },
  mutationCache: refreshAfterWrites(() => queryClient, registry.staleFor),
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
