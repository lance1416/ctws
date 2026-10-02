import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate, NavLink, Outlet } from 'react-router-dom'
import { apiFetch } from '../api'
import { useMe } from '../useMe'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded px-3 py-2 ${isActive ? 'bg-surface-raised text-fg' : 'text-fg-muted'}`

// The only place that redirects an unauthenticated visitor to /login; routes below it can
// assume a signed-in user.
export function Layout() {
  const qc = useQueryClient()
  const me = useMe()

  const logout = useMutation({
    mutationFn: () => apiFetch('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      // Drop every cache, not just the session: the next sign-in may be a different user and
      // must never be shown the previous user's cached projects or tasks.
      qc.clear()
      qc.setQueryData(['me'], null)
    },
  })

  if (me.isLoading) return <div className="min-h-screen bg-surface" />
  if (!me.data) return <Navigate to="/login" replace />

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <nav className="flex flex-row gap-1 border-b border-border-subtle bg-surface-sunken p-3 md:w-56 md:flex-col md:border-r md:border-b-0">
        <NavLink to="/" end className={linkClass}>
          今天
        </NavLink>
        <NavLink to="/projects" className={linkClass}>
          项目
        </NavLink>
        <div className="ml-auto flex flex-col gap-1 text-sm text-fg-subtle md:mt-auto md:ml-0">
          <p data-testid="current-user">{me.data.email}</p>
          <p data-testid="workspace-id" className="truncate">
            {me.data.workspaceId}
          </p>
          <button className="text-left text-fg-muted" onClick={() => logout.mutate()}>
            Log out
          </button>
        </div>
      </nav>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}
