import { api } from '@ctws/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link, Navigate, Outlet } from 'react-router-dom'
import { call } from '../../platform/http/api'
import { useMe } from '../auth/useMe'
import { Breadcrumbs, BreadcrumbsProvider } from './Breadcrumbs'
import { DetailPaneContext, useWidePane } from '../../platform/ui/paneLayout'
import { LAYER } from '../../platform/ui/layers'
import { QuickCapture } from '../capture'
import { BottomBar } from './BottomBar'
import { LeaveGuardContext, type LeaveGuard } from '../../platform/ui/leaveGuard'
import { SetGround, type Ground } from './ground'
import { Shortcuts } from '../shortcuts/Shortcuts'
import { SideRail } from './SideRail'
import { UserMenu } from './UserMenu'
import { WriteFailure } from './WriteFailure'

/**
 * The signed-in frame: top bar, rail, page, and the detail pane's column. The one place that
 * sends a visitor to /login.
 */
export function Layout() {
  const qc = useQueryClient()
  const me = useMe()
  const leaveGuard: LeaveGuard = useRef(null)
  // Set by the detail pane while it is mounted, so the grid holds a column open for it.
  const [paneOpen, setPaneOpen] = useState(false)
  // Opened from the header's button, the `f` key, or the phone's tab bar.
  const [searching, setSearching] = useState(false)
  const [ground, setGround] = useState<Ground>('sheet')
  const wide = useWidePane()

  const logout = useMutation({
    mutationFn: () => call(api.auth.logout),
    meta: { refresh: false },
    onSuccess: () => {
      // Every cache, not just the session: the next sign-in may be someone else.
      qc.clear()
      qc.setQueryData(['me'], null)
    },
  })

  if (me.isLoading) return <div className="min-h-screen bg-sheet" />
  // A server that is down is not a signed-out visitor, so this is not a redirect to /login. Only a
  // first load that failed means there is no app to show; a later failed check keeps the page.
  if (me.isLoadingError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sheet p-6">
        <p role="alert" className="max-w-prose text-sm text-danger">
          Can't reach the server. Your session is fine -- try again once it is back.
        </p>
      </div>
    )
  }
  if (!me.data) return <Navigate to="/login" replace />

  return (
    <BreadcrumbsProvider>
      <div className="min-h-screen">
        <header className={`sticky top-0 ${LAYER.bar} border-b border-rule bg-chrome`}>
          <div className="flex min-h-13 items-center gap-x-3 px-4 py-2 sm:gap-x-4">
            <Link to="/" className="shrink-0 font-semibold tracking-tight text-ink">
              CTWS
            </Link>
            <Breadcrumbs />
            <span aria-hidden="true" className="flex-1" />
            <div className="flex shrink-0 items-center gap-1 text-sm">
              <Shortcuts capture={<QuickCapture />} search={searching} setSearch={setSearching} />
              <span className="relative ml-1">
                <UserMenu
                  email={me.data.email}
                  onLogout={() => {
                    // An open pane with unsaved edits asks first, and runs the logout if let go.
                    if (!leaveGuard.current?.(() => logout.mutate())) logout.mutate()
                  }}
                />
                {/* Any write that fails unsaid, signing out among them, is said here. */}
                <WriteFailure />
              </span>
            </div>
          </div>
        </header>
        {/* `minmax(0,1fr)`, not `1fr`: one long title would otherwise widen the page past 375px.
            The 24rem column matches DetailPane's width. */}
        <div
          className={`lg:grid lg:items-start ${
            paneOpen && wide
              ? 'lg:grid-cols-[16rem_minmax(0,1fr)_24rem]'
              : 'lg:grid-cols-[16rem_minmax(0,1fr)]'
          }`}
        >
          <SideRail />
          {/* At least a screen tall, so DangerZone's `mt-auto` has a floor to sit on; below 1024
              the page ends above the tab bar. */}
          <main
            className={`flex min-h-[calc(100vh-3.25rem)] min-w-0 flex-col px-4 pt-4 max-lg:pb-20 sm:px-6 ${
              ground === 'desk' ? 'bg-desk' : 'bg-sheet'
            }`}
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <DetailPaneContext.Provider value={setPaneOpen}>
                <LeaveGuardContext.Provider value={leaveGuard}>
                  <SetGround.Provider value={setGround}>
                    <Outlet />
                  </SetGround.Provider>
                </LeaveGuardContext.Provider>
              </DetailPaneContext.Provider>
            </div>
          </main>
          {/* The pane itself is fixed; this placeholder is what takes its width out of the grid. */}
          {paneOpen && wide && <div aria-hidden="true" />}
        </div>
        <BottomBar onSearch={() => setSearching(true)} />
      </div>
    </BreadcrumbsProvider>
  )
}
