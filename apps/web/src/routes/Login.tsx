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
    <main className="mx-auto max-w-sm px-4 pt-[14vh] pb-8">
      <h1 className="text-2xl font-semibold">CTWS</h1>
      <p className="mt-1 text-fg-muted">个人工作台账</p>
      <div className="mt-8 flex flex-col gap-4">
        <div>
          <label htmlFor="login-email" className="text-sm text-fg-muted">
            Email
          </label>
          <input
            id="login-email"
            className="mt-1 h-10 w-full rounded-md border border-border-strong bg-surface-raised px-3 text-fg placeholder:text-fg-muted"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="login-password" className="text-sm text-fg-muted">
            Password
          </label>
          <input
            id="login-password"
            type="password"
            className="mt-1 h-10 w-full rounded-md border border-border-strong bg-surface-raised px-3 text-fg placeholder:text-fg-muted"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button
            className="h-10 rounded-md border border-border-strong px-4 text-fg hover:bg-surface-sunken"
            onClick={() => act.mutate('/auth/register')}
          >
            Register
          </button>
          <button
            className="h-10 rounded-md bg-accent px-4 font-medium text-accent-fg hover:opacity-90"
            onClick={() => act.mutate('/auth/login')}
          >
            Log in
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </main>
  )
}

function browserTimezone(): string {
  // Only a default for registration. All "today"/"this week" logic runs server-side
  // against users.timezone (spec section 8.4); the browser clock decides nothing.
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}
