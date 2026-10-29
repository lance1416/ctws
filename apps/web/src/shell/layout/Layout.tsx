import { api, idFrom, projectId as projectIdSchema } from '@ctws/contracts'
import { PhoneBack } from './PhoneBack'
import { PinLink } from '../resources/PinLink'
import { forgetDrafts } from '../../platform/ui/drafts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Navigate, Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom'
import { call } from '../../platform/http/api'
import { meKey, useMe } from '../auth/useMe'
import type { Creator } from '../contract'
import { NewContext, rememberKind, type NewHow } from '../creates'
import { LinkDialog } from '../links/LinkDialog'
import { BottomBar } from './BottomBar'
import { IconBar } from './IconBar'
import { Inspector } from './Inspector'
import { BackOnline } from './Online'
import { BackFromNote } from '../resources/BackFrom'
import { LeaveGuardContext, type LeaveGuard } from '../../platform/ui/leaveGuard'
import { placeOf } from './places'
import { useRemembered } from './remembered'
import { Shortcuts } from '../shortcuts/Shortcuts'
import { MentionChip } from '../links/MentionChip'
import { MentionContext, type Mention } from '../../platform/notes/mention'
import { useRegistry } from '../registry'
import { SignOutContext } from './signOut'
import { Sidebar } from './Sidebar'
import { SubjectProvider, useSubject } from './subject'
import { TopBar } from './TopBar'

/**
 * THE FRAME (FR-017), five regions: the top bar; the icon bar; the module's sidebar; the main
 * area; and the inspector, when something is open in it. Below 1280 the sidebar starts hidden
 * and the inspector covers the main area; below 1024 the phone's tab bar stands in for the top
 * bar, the icon bar and the sidebar. The one place that sends a visitor to /login.
 */
export function Layout() {
  const qc = useQueryClient()
  const me = useMe()
  const { pathname } = useLocation()
  const leaveGuard: LeaveGuard = useRef(null)

  const logout = useMutation({
    mutationFn: () => call(api.auth.logout),
    meta: { refresh: false },
    onSuccess: () => {
      // Every cache, not just the session: the next sign-in may be someone else.
      qc.clear()
      qc.setQueryData(meKey, null)
      forgetDrafts()
    },
  })

  if (me.isLoading) return <div className="min-h-screen bg-ground" />
  // A server that is down is not a signed-out visitor, so this is not a redirect to /login. Only a
  // first load that failed means there is no app to show; a later failed check keeps the page.
  if (me.isLoadingError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ground p-6">
        <p role="alert" className="max-w-prose text-ui text-stop-t">
          Can't reach the server. Your session is fine -- try again once it is back.
        </p>
      </div>
    )
  }
  // A session that ended under the page comes back to it once signed in again; signing out does not.
  if (!me.data) {
    const from = logout.isSuccess ? undefined : `${pathname}${location.search}`
    return <Navigate to="/login" replace state={from ? { from } : undefined} />
  }

  return (
    <SubjectProvider>
      <Frame
        email={me.data.email}
        leaveGuard={leaveGuard}
        onLogout={() => {
          // An open form with unsaved edits asks first, and runs the logout if let go.
          if (!leaveGuard.current?.(() => logout.mutate())) logout.mutate()
        }}
      />
    </SubjectProvider>
  )
}

function Frame({
  email,
  leaveGuard,
  onLogout,
}: {
  email: string
  leaveGuard: LeaveGuard
  onLogout: () => void
}) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [searching, setSearching] = useState(false)
  const [help, setHelp] = useState(false)
  const [linking, setLinking] = useState(false)
  const [pinning, setPinning] = useState(false)
  const [creating, setCreating] = useState<({ creator: Creator } & NewHow) | null>(null)
  const [barExpanded, setBarExpanded] = useRemembered('ctws:iconbar', () => false)
  // A choice made by hand is kept whatever the width (handoff §4).
  const [sidebarOpen, setSidebarOpen] = useRemembered(
    'ctws:sidebar',
    () => window.matchMedia('(min-width: 1280px)').matches,
  )
  const place = placeOf(pathname)
  // The pages across kinds have no list beside them (artboard 7) unless they bring one: Review's
  // weeks (FR-081).
  const registry = useRegistry()
  const hasSidebar = place !== null && (place.kind !== null || place.to in registry.pageSidebars)
  const subject = useSubject()
  // What a New makes on a project page belongs to the project (FR-026).
  const onProject = useMatch('/projects/:id')
  const projectId = onProject?.params.id ? idFrom(projectIdSchema, onProject.params.id) : null

  const openNew = (creator: Creator, how: NewHow = { opens: false }) => {
    rememberKind(creator.kind)
    if (creator.Dialog) setCreating({ creator, ...how })
    else if (creator.to) navigate(typeof creator.to === 'string' ? creator.to : creator.to(subject))
  }

  return (
    <SignOutContext.Provider value={onLogout}>
      <NewContext.Provider value={openNew}>
        {/* Every note in the app draws its mentions as chips that open the thing (FR-042). */}
        <MentionContext.Provider value={drawMention}>
          <div className="flex h-dvh flex-col">
            <div className="contents max-lg:hidden">
              <TopBar
                email={email}
                onSearch={() => setSearching(true)}
                onHelp={() => setHelp(true)}
                onLogout={onLogout}
              />
            </div>
            <div className="flex min-h-0 flex-1">
              <div className="contents max-lg:hidden">
                <IconBar expanded={barExpanded} setExpanded={setBarExpanded} />
                {hasSidebar && sidebarOpen && <Sidebar place={place} />}
              </div>
              <div className="relative flex min-w-0 flex-1">
                {/* An item open as a column (`DetailPane`, from 1280) takes its width from the main
                area's right, so it sits beside the page rather than over it: 22rem, its 12px
                inset, and a 12px gap. */}
                <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-ground p-5 max-lg:px-4 max-lg:pt-3 max-lg:pb-[calc(5.5rem+env(safe-area-inset-bottom))] has-[[data-detail-mode=pane]]:pr-[calc(var(--width-inspector)+1.25rem)]">
                  <LeaveGuardContext.Provider value={leaveGuard}>
                    <PhoneBack />
                    <Outlet />
                    {/* Inside main: one that opens as a column (Log a message) makes room for
                      itself as the page's own panes do (K-02). */}
                    {creating?.creator.Dialog && (
                      <creating.creator.Dialog
                        projectId={projectId}
                        about={subject}
                        opens={creating.opens}
                        day={creating.day ?? null}
                        onClose={() => setCreating(null)}
                      />
                    )}
                  </LeaveGuardContext.Provider>
                </main>
                <Inspector />
                <BackOnline />
                <BackFromNote />
              </div>
            </div>
            <Shortcuts
              search={searching}
              setSearch={setSearching}
              help={help}
              setHelp={setHelp}
              onSidebar={() => setSidebarOpen(!sidebarOpen)}
              onLink={() => {
                if (subject) setLinking(true)
              }}
              onNew={openNew}
              onPinLink={() => setPinning(true)}
            />
            {pinning && <PinLink onClose={() => setPinning(false)} />}
            {linking && subject && <LinkDialog of={subject} onClose={() => setLinking(false)} />}
            <BottomBar />
          </div>
        </MentionContext.Provider>
      </NewContext.Provider>
    </SignOutContext.Provider>
  )
}

const drawMention = (mention: Mention) => <MentionChip {...mention} />
