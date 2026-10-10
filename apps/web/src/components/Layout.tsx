import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { apiFetch } from '../api'
import { useMe } from '../useMe'
import { DetailPaneContext, useWidePane } from './paneLayout'
import { LeaveGuardContext, type LeaveGuard } from './leaveGuard'
import { Shortcuts } from './Shortcuts'
import { SideRail } from './SideRail'
import { UserMenu } from './UserMenu'

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
  // A SERVER THAT IS DOWN IS NOT A SIGNED-OUT VISITOR. Redirecting here would land the reader on
  // a login page that cannot reach the server either, which reads as "my password stopped
  // working" rather than "the server is down".
  if (me.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-6">
        <p role="alert" className="max-w-prose text-sm text-danger">
          Can't reach the server. Your session is fine -- try again once it is back.
        </p>
      </div>
    )
  }
  if (!me.data) return <Navigate to="/login" replace />

  return (
    <div className="min-h-screen">
      {/* THE BAR SAYS WHERE YOU ARE AND WHO YOU ARE. It used to be half-filled by the capture
          box -- one MODULE's action, spread across the whole shell's chrome, which is the shape
          of a product that thinks it is a task tracker. Capture moved to the rail, next to the
          other way of making something (a project), and the bar got its own job back: the
          workspace's name on one side, the person's account on the other, with the two things
          that work from every page in between.
          Nothing here knows what a task is, which is the test a shell has to pass. */}
      <header className="sticky top-0 z-30 border-b border-border-subtle bg-surface-sunken">
        <div className="flex min-h-13 items-center gap-x-3 px-4 py-2">
          <span className="font-semibold tracking-tight text-fg">CTWS</span>
          <div className="ml-auto flex items-center gap-1 text-sm">
            <Shortcuts />
            <span className="ml-1">
              <UserMenu
                email={me.data.email}
                onLogout={() => {
                  // An open panel with unsaved edits asks first; it runs the logout if they let go.
                  if (!leaveGuard.current?.(() => logout.mutate())) logout.mutate()
                }}
              />
            </span>
          </div>
        </div>
      </header>
      {/* The workbench: destinations, the work itself, and the detail beside it rather than on
          top of it. The rail is 256px (workbench spec §2): it has to hold a project name at 15px
          without truncating every one of them. `minmax(0,1fr)` and not `1fr`: a grid track sized
          `1fr` takes its minimum from its content, so one long untruncated title would push the
          centre column wider than the viewport and bring back the horizontal scrollbar at 375px. */}
      <div
        className={`lg:grid lg:items-start ${
          // 24rem for the detail: at 1440 that leaves the work 800px against the detail's 384,
          // so the content area really is three columns with the work spanning two of them
          // (workbench spec §2). The pane's own box is 22rem inside it, with a 16px gutter on
          // either side so it reads as a PANEL in that column rather than a slab bolted to the
          // edge of the window. TaskDetail holds the matching numbers; they are two places and
          // must agree.
          paneOpen && wide
            ? 'lg:grid-cols-[16rem_minmax(0,1fr)_24rem]'
            : 'lg:grid-cols-[16rem_minmax(0,1fr)]'
        }`}
      >
        <SideRail />
        <main className="min-w-0 bg-surface px-4 pt-4 pb-16 sm:px-6">
          {/* NO WIDTH CAP. The capped 51rem centre column is what put one clump of rows left of
              centre at 1440 with half the screen empty beside it. The width is now carried by the
              PANEL GRID the page lays out inside it, and each list keeps its own measure
              (RowParts) so a date column never drifts away from the title it belongs to. */}
          <div className="min-w-0">
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
