import type { UserResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './api'

// The signed-in user, or null when there is no valid session. Shared by Layout (the single
// place that redirects to /login) and Login (which skips itself when already signed in).
export function useMe() {
  return useQuery<UserResponse | null>({
    queryKey: ['me'],
    queryFn: () => apiFetch<UserResponse>('/auth/me').catch(() => null),
    retry: false,
  })
}
