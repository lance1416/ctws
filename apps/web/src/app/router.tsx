import { createBrowserRouter, Navigate } from 'react-router-dom'
import { Login } from '../shell/auth'
import { Calendar } from '../shell/calendar'
import { Layout, RouteError, topPage, type PageHandle } from '../shell/layout'
import { ProjectPage, Projects, useProjectCrumbs } from '../shell/projects'
import { WORKBENCH_PATH } from '../shell/registry'
import { Things, Workbench } from '../shell/workbench'
import { registry } from './registry'

/** The tiles sit on the desk. */
const WORKBENCH: PageHandle = { ...topPage('Workbench'), ground: 'desk' }

export const router = createBrowserRouter([
  {
    // A throw while drawing shows a way on instead of a blank page: a page's inside the frame,
    // the frame's or sign-in's on its own.
    errorElement: <RouteError />,
    children: [
      { path: '/login', element: <Login /> },
      {
        // The catch-all is under Layout, so an unknown path is handled like any signed-out visit.
        element: <Layout />,
        children: [
          {
            errorElement: <RouteError />,
            children: [
              { index: true, element: <Workbench />, handle: WORKBENCH },
              { path: '/calendar', element: <Calendar />, handle: topPage('Calendar') },
              { path: '/projects', element: <Projects />, handle: topPage('Projects') },
              {
                path: '/projects/:id',
                element: <ProjectPage />,
                handle: { useCrumbs: useProjectCrumbs } satisfies PageHandle,
              },
              { path: '/things', element: <Things />, handle: topPage('Things') },
              ...registry.routes,
              { path: '*', element: <Navigate to={WORKBENCH_PATH} replace /> },
            ],
          },
        ],
      },
    ],
  },
])
