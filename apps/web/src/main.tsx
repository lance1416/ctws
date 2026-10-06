import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { Layout } from './components/Layout'
import { homePath, moduleRoutes } from './modules/registry'
import { Login } from './routes/Login'
import { Project } from './routes/Project'
import { Projects } from './routes/Projects'
// IBM Plex Sans, self-hosted and LATIN SUBSET ONLY: no Google Fonts link, because this app is
// private and self-hosted and has no business making a third-party request on every load. Three
// weights (body / emphasis / heading), ~24 KB of woff2 each. Chinese is served by a self-hosted
// subset of Noto Sans SC, declared as @font-face in styles.css (not imported here, because it
// needs a `unicode-range` that keeps it off Latin).
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import './styles.css'

/**
 * The paths the app answered on before its pages moved into module namespaces. This app is
 * deployed and the user has it open: a bookmark, or a tab that was sitting on /completed when the
 * container restarted, must not meet a blank page because the code was reorganised. Redirect, do
 * not break.
 *
 * COMPATIBILITY, not contract: deletable once nothing points at them.
 */
const MOVED: { from: string; to: string }[] = [{ from: '/completed', to: '/tasks/completed' }]

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    // The catch-all lives under Layout too, so an unknown path redirects like any other
    // unauthenticated visit (and falls back to the home destination once signed in).
    element: <Layout />,
    children: [
      // The shell has no page of its own: `/` opens the module you work in, named in the registry.
      { index: true, element: <Navigate to={homePath()} replace /> },
      // The shell's own pages stay at the top level; a MODULE's pages live under /<module>/.
      { path: '/projects', element: <Projects /> },
      { path: '/projects/:id', element: <Project /> },
      ...moduleRoutes(),
      ...MOVED.map(({ from, to }) => ({ path: from, element: <Navigate to={to} replace /> })),
      { path: '*', element: <Navigate to={homePath()} replace /> },
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
