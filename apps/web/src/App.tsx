import type { UserResponse } from '@ctws/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { apiFetch } from './api'

// Deliberately plain: this verifies the auth chain, not the UI.
export function App() {
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const me = useQuery<UserResponse | null>({
    queryKey: ['me'],
    queryFn: () => apiFetch<UserResponse>('/auth/me').catch(() => null),
    retry: false,
  })

  const act = useMutation({
    mutationFn: (path: '/auth/register' | '/auth/login') =>
      apiFetch<UserResponse>(path, {
        method: 'POST',
        body: JSON.stringify(
          path === '/auth/register'
            ? { email, password, timezone: browserTimezone() }
            : { email, password },
        ),
      }),
    onSuccess: () => {
      setError('')
      void qc.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (e: Error) => setError(e.message),
  })

  const logout = useMutation({
    mutationFn: () => apiFetch('/auth/logout', { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['me'] }),
  })

  if (me.isLoading) return <p>Loading…</p>

  if (me.data) {
    return (
      <main>
        <p data-testid="current-user">{me.data.email}</p>
        <p data-testid="workspace-id">{me.data.workspaceId}</p>
        <button onClick={() => logout.mutate()}>Log out</button>
      </main>
    )
  }

  return (
    <main>
      <input aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input
        aria-label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button onClick={() => act.mutate('/auth/register')}>Register</button>
      <button onClick={() => act.mutate('/auth/login')}>Log in</button>
      {error && <p role="alert">{error}</p>}
    </main>
  )
}

function browserTimezone(): string {
  // Only a default for registration. All "today"/"this week" logic runs server-side
  // against users.timezone (spec section 8.4); the browser clock decides nothing.
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}
