import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link, Navigate, Outlet } from 'react-router-dom'
import { apiFetch } from '../../platform/http/api'
import { useMe } from '../auth/useMe'
import { Location, LocationProvider } from './Location'
import { DetailPaneContext, useWidePane } from '../../platform/ui/paneLayout'
import { LAYER } from '../../platform/ui/layers'
import { QuickCapture } from '../capture/QuickCapture'
import { BottomBar } from './BottomBar'
import { LeaveGuardContext, type LeaveGuard } from '../../platform/ui/leaveGuard'
import { SetGround, type Ground } from './ground'
import { Shortcuts } from '../shortcuts/Shortcuts'
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
  // Opened from the header's button, the `f` key, or the phone's tab bar.
  const [searching, setSearching] = useState(false)
  // The sheet, unless the page says it is a desk (`useGround`).
  const [ground, setGround] = useState<Ground>('sheet')
  const wide = useWidePane()

  const logout = useMutation({
    mutationFn: () => apiFetch('/auth/logout', { method: 'POST' }),
    meta: { refresh: false },
    onSuccess: () => {
      // Drop every cache, not just the session: the next sign-in may be a different user and
      // must never be shown the previous user's cached projects or tasks.
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
    <LocationProvider>
      <div className="min-h-screen">
        {/* THE BAR SAYS WHERE YOU ARE, AND HOLDS WHAT WORKS FROM EVERY PAGE: home, the page's own
          path, then search, capture, the key list and the account. It lists no destinations --
          those are the rail's, and a bar of them runs out of room at five. Capture is here and
          not in the rail because it is the same box at every width, phone included.
          Nothing here knows what a task is, which is the test a shell has to pass. */}
        <header className={`sticky top-0 ${LAYER.bar} border-b border-rule bg-chrome`}>
          <div className="flex min-h-13 items-center gap-x-3 px-4 py-2 sm:gap-x-4">
            <Link to="/" className="shrink-0 font-semibold tracking-tight text-ink">
              CTWS
            </Link>
            <Location />
            {/* THE ROOM: deliberately empty, kept for what belongs to the whole app later. Things
              that belong to one kind never go here. */}
            <span aria-hidden="true" className="flex-1" />
            <div className="flex shrink-0 items-center gap-1 text-sm">
              <Shortcuts capture={<QuickCapture />} search={searching} setSearch={setSearching} />
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
          top of it. The rail is 256px: it has to hold a project name at 15px
          without truncating every one of them. `minmax(0,1fr)` and not `1fr`: a grid track sized
          `1fr` takes its minimum from its content, so one long untruncated title would push the
          centre column wider than the viewport and bring back the horizontal scrollbar at 375px. */}
        <div
          className={`lg:grid lg:items-start ${
            // 24rem for the detail: at 1440 that leaves the work 800px against the detail's 384, so
            // the content area really is three columns with the work spanning two of them. The pane's
            // own box is 22rem inside it, 12px in from the window's edge, so it reads as a sheet laid
            // in that column rather than a slab bolted to the edge of the window. DetailPane holds
            // the matching numbers; they are two places and must agree.
            paneOpen && wide
              ? 'lg:grid-cols-[16rem_minmax(0,1fr)_24rem]'
              : 'lg:grid-cols-[16rem_minmax(0,1fr)]'
          }`}
        >
          <SideRail />
          {/* 至少一屏高：`DangerZone` 靠 `mt-auto` 把自己推到它所在那个纵向 flex 盒子的底，而一个
            比视口矮的盒子没有「底」可推 —— 删除于是会吊在半空。顶栏 3.25rem，这里补上。 */}
          {/* Below 1024 the page ends above the tab bar, never under it. */}
          <main
            className={`flex min-h-[calc(100vh-3.25rem)] min-w-0 flex-col px-4 pt-4 max-lg:pb-20 sm:px-6 ${
              ground === 'desk' ? 'bg-desk' : 'bg-sheet'
            }`}
          >
            {/* NO WIDTH CAP. The capped 51rem centre column is what put one clump of rows left of
              centre at 1440 with half the screen empty beside it. The width is now carried by the
              PANEL GRID the page lays out inside it, and each list keeps its own measure
              (RowParts) so a date column never drifts away from the title it belongs to. */}
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
          {/* The pane's own box is position-fixed (it has to stay put while the centre column
            scrolls), so this placeholder is what actually takes the width out of the grid. */}
          {paneOpen && wide && <div aria-hidden="true" />}
        </div>
        <BottomBar onSearch={() => setSearching(true)} />
      </div>
    </LocationProvider>
  )
}
