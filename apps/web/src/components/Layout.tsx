import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate, NavLink, Outlet } from 'react-router-dom'
import { apiFetch } from '../api'
import { useMe } from '../useMe'
import { QuickCapture } from './QuickCapture'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm ${
    isActive ? 'bg-surface-raised font-semibold text-fg' : 'text-fg-muted hover:text-fg'
  }`

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
    <div className="min-h-screen">
      {/* Top bar instead of a sidebar: two destinations do not earn a permanent column.
          Phone width: nav and account on the first line, capture full width on the second. */}
      <header className="sticky top-0 z-10 border-b border-border-subtle bg-surface-sunken">
        <div className="flex min-h-[52px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 sm:px-8 lg:grid lg:grid-cols-[1fr_min(68ch,100%)_1fr]">
          <nav aria-label="主导航" className="order-1 flex gap-1 lg:col-start-1 lg:row-start-1">
            <NavLink to="/" end className={linkClass}>
              今天
            </NavLink>
            <NavLink to="/projects" className={linkClass}>
              项目
            </NavLink>
          </nav>
          <QuickCapture />
          <div className="order-2 ml-auto flex items-center gap-3 text-sm sm:order-3 lg:col-start-3 lg:row-start-1 lg:justify-self-end">
            <span
              data-testid="current-user"
              className="max-w-[16ch] truncate text-fg-muted max-xl:sr-only"
            >
              {me.data.email}
            </span>
            {/* A debugging leftover, not something to show; kept in the DOM for the e2e. */}
            <span data-testid="workspace-id" className="sr-only">
              {me.data.workspaceId}
            </span>
            <button
              className="whitespace-nowrap rounded-md px-2 py-1.5 text-fg-muted hover:text-fg"
              onClick={() => logout.mutate()}
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-[68ch]">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
