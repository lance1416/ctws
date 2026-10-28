import { api, idFrom, projectId as projectIdSchema } from '@ctws/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Navigate, Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom'
import { call } from '../../platform/http/api'
import { meKey, useMe } from '../auth/useMe'
import type { Creator } from '../contract'
import { NewContext, rememberKind } from '../creates'
import { LinkDialog } from '../links/LinkDialog'
import { BottomBar } from './BottomBar'
import { IconBar } from './IconBar'
import { Inspector } from './Inspector'
import { BackOnline } from './Online'
import { LeaveGuardContext, type LeaveGuard } from '../../platform/ui/leaveGuard'
import { placeOf } from './places'
import { useRemembered } from './remembered'
import { Shortcuts } from '../shortcuts/Shortcuts'
import { MentionChip } from '../links/MentionChip'
import { MentionContext, type Mention } from '../../platform/notes/mention'
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
  const [creating, setCreating] = useState<{ creator: Creator; opens: boolean } | null>(null)
  const [barExpanded, setBarExpanded] = useRemembered('ctws:iconbar', () => false)
  // A choice made by hand is kept whatever the width (handoff §4).
  const [sidebarOpen, setSidebarOpen] = useRemembered(
    'ctws:sidebar',
    () => window.matchMedia('(min-width: 1280px)').matches,
  )
  const place = placeOf(pathname)
  // The pages across kinds have no list beside them (artboard 7); Review's weeks come with its batch.
  const hasSidebar = place !== null && place.kind !== null
  const subject = useSubject()
  // What a New makes on a project page belongs to the project (FR-026).
  const onProject = useMatch('/projects/:id')
  const projectId = onProject?.params.id ? idFrom(projectIdSchema, onProject.params.id) : null

  const openNew = (creator: Creator, { opens }: { opens: boolean } = { opens: false }) => {
    rememberKind(creator.kind)
    if (creator.Dialog) setCreating({ creator, opens })
    else if (creator.to) navigate(typeof creator.to === 'string' ? creator.to : creator.to(subject))
  }

  return (
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
              <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-ground p-5 max-lg:pb-20 has-[[data-detail-mode=pane]]:pr-[calc(var(--width-inspector)+1.25rem)]">
                <LeaveGuardContext.Provider value={leaveGuard}>
                  <Outlet />
                  {/* Inside main: one that opens as a column (Log a message) makes room for
                      itself as the page's own panes do (K-02). */}
                  {creating?.creator.Dialog && (
                    <creating.creator.Dialog
                      projectId={projectId}
                      about={subject}
                      opens={creating.opens}
                      onClose={() => setCreating(null)}
                    />
                  )}
                </LeaveGuardContext.Provider>
              </main>
              <Inspector />
              <BackOnline />
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
          />
          {linking && subject && <LinkDialog of={subject} onClose={() => setLinking(false)} />}
          <BottomBar onSearch={() => setSearching(true)} />
        </div>
      </MentionContext.Provider>
    </NewContext.Provider>
  )
}

const drawMention = (mention: Mention) => <MentionChip {...mention} />
