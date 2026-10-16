import { api } from '@ctws/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { WORKBENCH_PATH } from '../registry'
import { call, problemText } from '../../platform/http/api'
import { browserZone } from '../../platform/time/dates'
import { meKey, useMe } from './useMe'
import { LINK } from '../../platform/ui/buttonStyles'
import { Button } from '../../platform/ui/Button'
import { textbox } from '../../platform/ui/formStyles'

export function Login() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  /** The page a session ended on, which signing in again goes back to. */
  const from = (location.state as { from?: string } | null)?.from ?? WORKBENCH_PATH
  const me = useMe()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const act = useMutation({
    mutationFn: (how: 'register' | 'login') =>
      how === 'register'
        ? call(api.auth.register, { body: { email, password, timezone: browserZone() } })
        : call(api.auth.login, { body: { email, password } }),
    // The session is new; `me` is set below.
    meta: { refresh: false, ownsError: true },
    onSuccess: (user) => {
      setError('')
      // A session that ended under an open page left that account's reads in the cache, and
      // this may be someone else.
      qc.clear()
      // Seed the cache before navigating: Layout reads it and would bounce back to /login
      // if it still saw the stale null.
      qc.setQueryData(meKey, user)
      navigate(from, { replace: true })
    },
    onError: (e: Error) => setError(problemText(e) ?? ''),
  })

  if (me.isLoading) return null
  if (me.data) return <Navigate to={from} replace />

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[20rem]">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="h-7 w-thread rounded-full bg-ink" />
          <h1 className="text-xl font-semibold">CTWS</h1>
        </div>
        <p className="mt-2 text-sm text-ink-muted">Your personal workbench</p>

        <form
          className="mt-10 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!act.isPending) act.mutate('login')
          }}
        >
          <div>
            <label htmlFor="login-email" className="block text-xs text-ink-muted">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              className={`mt-1.5 w-full bg-sheet ${textbox}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-xs text-ink-muted">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              className={`mt-1.5 w-full bg-sheet ${textbox}`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button look="primary" type="submit" disabled={act.isPending} className="mt-2 w-full">
            Sign in
          </Button>
          <div className="flex items-baseline gap-2 text-sm text-ink-muted">
            First time?
            <button
              type="button"
              disabled={act.isPending}
              className={`-mx-1 rounded-md px-1 py-0.5 ${LINK} disabled:opacity-50`}
              onClick={() => act.mutate('register')}
            >
              Create an account
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
