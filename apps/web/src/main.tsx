import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  createBrowserRouter,
  generatePath,
  Navigate,
  RouterProvider,
  useLocation,
  useParams,
} from 'react-router-dom'
import { Layout } from './components/Layout'
import { moduleRoutes, WORKBENCH_PATH } from './modules/registry'
import { Login } from './routes/Login'
import { Calendar } from './routes/Calendar'
import { ObjectPage } from './components/ObjectPage'
import { Projects } from './routes/Projects'
import { Workbench } from './routes/Workbench'
// IBM Plex Sans, self-hosted and LATIN SUBSET ONLY: no Google Fonts link, because this app is
// private and self-hosted and has no business making a third-party request on every load. TWO
// weights, ~24 KB of woff2 each, and no more: the type scale has exactly two, 400 and 600, so a
// third face would be 24 KB for a weight nothing can ask for.
// Chinese is served by a self-hosted subset of Noto Sans SC, declared as @font-face in styles.css
// (not imported here, because it needs a `unicode-range` that keeps it off Latin).
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import './styles.css'

/**
 * The paths the app answered on before its pages moved into module namespaces. This app is
 * deployed and the user has it open: a bookmark, or a tab that was sitting on /completed when the
 * container restarted, must not meet a blank page because the code was reorganised. Redirect, do
 * not break.
 *
 * COMPATIBILITY, not contract: deletable once nothing points at them. A `:param` in `from` is
 * carried into `to`, so an address that named one thing still names it.
 */
const MOVED: { from: string; to: string }[] = [
  { from: '/completed', to: '/tasks/completed' },
  // People had an older name; these are its addresses.
  { from: '/contacts', to: '/people' },
  { from: '/contacts/birthdays', to: '/people/birthdays' },
  { from: '/contacts/:id', to: '/people/:id' },
]

function Moved({ to }: { to: string }) {
  const params = useParams()
  const { search } = useLocation()
  return <Navigate to={generatePath(to, params) + search} replace />
}

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    // The catch-all lives under Layout too, so an unknown path redirects like any other
    // unauthenticated visit (and falls back to the home destination once signed in).
    element: <Layout />,
    children: [
      // The shell's own front page: every module's glance, side by side. Not a redirect into a
      // module, which would make the front page depend on registration order.
      { index: true, element: <Workbench /> },
      // The shell's own pages stay at the top level; a MODULE's pages live under /<module>/.
      // A SHELL page, like /projects: the calendar is about every module at once, so it is not
      // under any module's namespace.
      { path: '/calendar', element: <Calendar /> },
      { path: '/projects', element: <Projects /> },
      { path: '/projects/:id', element: <ObjectPage type="project" /> },
      ...moduleRoutes(),
      ...MOVED.map(({ from, to }) => ({ path: from, element: <Moved to={to} /> })),
      { path: '*', element: <Navigate to={WORKBENCH_PATH} replace /> },
    ],
  },
])

// One retry covers a genuine blip; the default three (with backoff) hide a down server behind a
// spinner for about seven seconds, which is the wrong trade for a self-hosted personal app.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
