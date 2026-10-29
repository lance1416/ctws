import { api } from '@ctws/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { WORKBENCH_PATH } from '../registry'
import { ApiError, call, problemText } from '../../platform/http/api'
import { browserZone } from '../../platform/time/dates'
import { meKey, useMe } from './useMe'
import { LINK } from '../../platform/ui/buttonStyles'
import { Button } from '../../platform/ui/Button'
import { textbox } from '../../platform/ui/formStyles'

/** Something, an @, something, a dot, something: enough to catch a slip, as the server's is the rule. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
  // A field's own problem, said under it (FR-032); `error` is the answer's, under both.
  const [wrong, setWrong] = useState<{ email?: string; password?: string }>({})

  const act = useMutation({
    mutationFn: (how: 'register' | 'login') =>
      how === 'register'
        ? call(api.auth.register, { body: { email, password, timezone: browserZone() } })
        : call(api.auth.login, { body: { email, password } }),
    // The session is new; `me` is set below.
    meta: { refresh: false, ownsError: true },
    onSuccess: (user) => {
      setError('')
      setWrong({})
      // A session that ended under an open page left that account's reads in the cache, and
      // this may be someone else.
      qc.clear()
      // Seed the cache before navigating: Layout reads it and would bounce back to /login
      // if it still saw the stale null.
      qc.setQueryData(meKey, user)
      navigate(from, { replace: true })
    },
    // A form the server could not read is said as the person would put it, never the
    // validator's own words ("body/password Too small…").
    onError: (e: Error) =>
      setError(
        e instanceof ApiError && e.status === 400
          ? 'Check your email and password.'
          : (problemText(e) ?? ''),
      ),
  })
  /** Asks only once both read right; what does not is said under its box, and nothing is sent. */
  const ask = (how: 'register' | 'login') => {
    if (act.isPending) return
    const typed = email.trim()
    const next = {
      ...(typed === ''
        ? { email: 'Enter your email.' }
        : !EMAIL.test(typed)
          ? { email: 'That doesn’t look like an email address.' }
          : {}),
      ...(password === ''
        ? { password: 'Enter your password.' }
        : // The account's rule, said before asking: a new password is twelve or more.
          how === 'register' && password.length < 12
          ? { password: 'Use a password of at least 12 characters.' }
          : {}),
    }
    setWrong(next)
    setError('')
    if (next.email || next.password) return
    act.mutate(how)
  }

  if (me.isLoading) return null
  if (me.data) return <Navigate to={from} replace />

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[20rem]">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="h-7 w-[3px] rounded-full bg-ink" />
          <h1 className="text-title">CTWS</h1>
        </div>
        <p className="mt-2 text-ui text-muted">Your personal workbench</p>

        {/* `noValidate`: the page says what is wrong, under the box, in its own words (FR-032). */}
        <form
          noValidate
          className="mt-10 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            ask('login')
          }}
        >
          <div>
            <label htmlFor="login-email" className="block text-meta text-muted">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              className={`mt-1.5 w-full bg-panel ${textbox}`}
              value={email}
              aria-invalid={wrong.email ? true : undefined}
              aria-describedby={wrong.email ? 'login-email-wrong' : undefined}
              onChange={(e) => setEmail(e.target.value)}
            />
            {wrong.email && (
              <p id="login-email-wrong" role="alert" className="mt-1.5 text-ui text-stop-t">
                {wrong.email}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="login-password" className="block text-meta text-muted">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              className={`mt-1.5 w-full bg-panel ${textbox}`}
              value={password}
              aria-invalid={wrong.password ? true : undefined}
              aria-describedby={wrong.password ? 'login-password-wrong' : undefined}
              onChange={(e) => setPassword(e.target.value)}
            />
            {wrong.password && (
              <p id="login-password-wrong" role="alert" className="mt-1.5 text-ui text-stop-t">
                {wrong.password}
              </p>
            )}
          </div>
          {error && (
            <p role="alert" className="text-ui text-stop-t">
              {error}
            </p>
          )}
          <Button look="primary" type="submit" disabled={act.isPending} className="mt-2 w-full">
            Sign in
          </Button>
          <div className="flex items-baseline gap-2 text-ui text-muted">
            First time?
            <button
              type="button"
              disabled={act.isPending}
              className={`-mx-1 rounded-control px-1 py-0.5 ${LINK} disabled:opacity-50`}
              onClick={() => ask('register')}
            >
              Create an account
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
