import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Login } from './routes/Login'
import { Project } from './routes/Project'
import { Projects } from './routes/Projects'
import { Today } from './routes/Today'
import './styles.css'

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    // The catch-all lives under Layout too, so an unknown path redirects like any other
    // unauthenticated visit (and falls back to Today once signed in).
    element: <Layout />,
    children: [
      { path: '/', element: <Today /> },
      { path: '/projects', element: <Projects /> },
      { path: '/projects/:id', element: <Project /> },
      { path: '*', element: <Today /> },
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
