import type { UserResponse } from '@ctws/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { homePath } from '../modules/registry'
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
      navigate(homePath(), { replace: true })
    },
    onError: (e: Error) => setError(e.message),
  })

  if (me.isLoading) return null
  if (me.data) return <Navigate to={homePath()} replace />

  return (
    // One plane, centred. An earlier pass stood the workbench's two surfaces on end here, which
    // only produced a pale column with a grey sliver down each side at 375 -- figure/ground needs
    // something to be the figure, and on a page with one block there is nothing. The design is
    // the type, the rhythm and the mark.
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[20rem]">
        {/* The identity mark is the app's own rail: the 3px bar that means "a project" on every
            other screen, here at the size of a wordmark. It is the only ornament on the page. */}
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="h-7 w-[3px] rounded-full bg-accent" />
          <h1 className="text-xl font-semibold">CTWS</h1>
        </div>
        <p className="mt-2 text-sm text-fg-muted">个人工作台账</p>

        {/* A real form, so Enter from either field signs in -- the thing a daily tool should not
            make you reach for the mouse to do. Register is a deliberate second press. */}
        <form
          className="mt-10 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!act.isPending) act.mutate('/auth/login')
          }}
        >
          <div>
            <label htmlFor="login-email" className="block text-xs text-fg-muted">
              邮箱
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              className="mt-1.5 h-10 w-full rounded-md border border-border-strong bg-surface-raised px-3 text-fg"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-xs text-fg-muted">
              密码
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              className="mt-1.5 h-10 w-full rounded-md border border-border-strong bg-surface-raised px-3 text-fg"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={act.isPending}
            className="mt-2 h-10 w-full rounded-md bg-accent font-semibold text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            登录
          </button>
          <div className="flex items-baseline gap-2 text-sm text-fg-muted">
            第一次用？
            <button
              type="button"
              disabled={act.isPending}
              className="-mx-1 rounded-md px-1 py-0.5 text-fg underline underline-offset-4 hover:text-accent disabled:opacity-50"
              onClick={() => act.mutate('/auth/register')}
            >
              注册
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}

function browserTimezone(): string {
  // Only a default for registration. All "today"/"this week" logic runs server-side
  // against users.timezone (spec section 8.4); the browser clock decides nothing.
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}
