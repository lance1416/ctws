import type { UserResponse } from '@ctws/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { apiFetch } from '../api'
import { useMe } from '../useMe'

export function Login() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const me = useMe()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

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
    onSuccess: (user) => {
      setError('')
      // Seed the cache before navigating: Layout reads it and would bounce back to /login
      // if it still saw the stale null.
      qc.setQueryData(['me'], user)
      navigate('/', { replace: true })
    },
    onError: (e: Error) => setError(e.message),
  })

  if (me.isLoading) return null
  if (me.data) return <Navigate to="/" replace />

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-3 p-6">
      <input
        aria-label="Email"
        className="rounded border border-border-strong bg-surface-raised px-3 py-2"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        aria-label="Password"
        type="password"
        className="rounded border border-border-strong bg-surface-raised px-3 py-2"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          className="rounded bg-accent px-3 py-2 text-accent-fg"
          onClick={() => act.mutate('/auth/register')}
        >
          Register
        </button>
        <button
          className="rounded border border-border-strong px-3 py-2"
          onClick={() => act.mutate('/auth/login')}
        >
          Log in
        </button>
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </main>
  )
}

function browserTimezone(): string {
  // Only a default for registration. All "today"/"this week" logic runs server-side
  // against users.timezone (spec section 8.4); the browser clock decides nothing.
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}
