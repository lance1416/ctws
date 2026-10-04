import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { apiFetch } from '../api'
import { useMe } from '../useMe'
import { DetailPaneContext, useWidePane } from './detailPane'
import { LeaveGuardContext, type LeaveGuard } from './leaveGuard'
import { QuickCapture } from './QuickCapture'
import { Shortcuts } from './Shortcuts'
import { SideRail } from './SideRail'

// The only place that redirects an unauthenticated visitor to /login; routes below it can
// assume a signed-in user.
export function Layout() {
  const qc = useQueryClient()
  const me = useMe()
  const leaveGuard: LeaveGuard = useRef(null)
  // Set by the detail panel while it is mounted, so the grid can hold a column open for it
  // instead of letting it cover the list it was opened from.
  const [paneOpen, setPaneOpen] = useState(false)
  const wide = useWidePane()

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
      {/* 48px of chrome, and it holds exactly one thing the user does from every page: capture.
          The destinations moved out of here and into the left rail, where they can carry counts. */}
      <header className="sticky top-0 z-30 border-b border-border-subtle bg-surface-sunken">
        <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5">
          <QuickCapture />
          <div className="order-2 ml-auto flex items-center gap-1 text-sm">
            <Shortcuts />
            <span
              data-testid="current-user"
              className="ml-2 max-w-[16ch] truncate text-fg-muted max-xl:sr-only"
            >
              {me.data.email}
            </span>
            {/* A debugging leftover, not something to show; kept in the DOM for the e2e. */}
            <span data-testid="workspace-id" className="sr-only">
              {me.data.workspaceId}
            </span>
            <button
              className="rounded-md px-2 py-1 whitespace-nowrap text-fg-muted hover:text-fg"
              onClick={() => {
                // An open panel with unsaved edits asks first; it runs the logout if they let go.
                if (!leaveGuard.current?.(() => logout.mutate())) logout.mutate()
              }}
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      {/* The workbench: destinations, the work itself, and the detail beside it rather than on
          top of it. `minmax(0,1fr)` and not `1fr`: a grid track sized `1fr` takes its minimum
          from its content, so one long untruncated title would push the centre column wider than
          the viewport and bring back the horizontal scrollbar at 375px. */}
      <div
        className={`lg:grid lg:items-start ${
          paneOpen && wide
            ? 'lg:grid-cols-[13rem_minmax(0,1fr)_22.5rem]'
            : 'lg:grid-cols-[13rem_minmax(0,1fr)]'
        }`}
      >
        <SideRail />
        <main className="min-w-0 bg-surface px-4 pt-5 pb-16 sm:px-6">
          {/* A working measure, not a reading measure, and not the full viewport either: it is
              set so the centre column is the SAME width whether or not the detail pane is open.
              A list that reflowed every time a task was opened would make the pane feel like a
              modal with extra steps. Beyond it, a right-hand date column would end up a thousand
              pixels from the title it belongs to -- which is what the fluid version actually
              looked like. */}
          <div className="max-w-[51rem] min-w-0">
            <DetailPaneContext.Provider value={setPaneOpen}>
              <LeaveGuardContext.Provider value={leaveGuard}>
                <Outlet />
              </LeaveGuardContext.Provider>
            </DetailPaneContext.Provider>
          </div>
        </main>
        {/* The pane's own box is position-fixed (it has to stay put while the centre column
            scrolls), so this placeholder is what actually takes the width out of the grid. */}
        {paneOpen && wide && <div aria-hidden="true" />}
      </div>
    </div>
  )
}
