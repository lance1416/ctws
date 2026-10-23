import { createBrowserRouter, Navigate } from 'react-router-dom'
import { Login } from '../shell/auth'
import { Calendar } from '../shell/calendar'
import { Layout, Placeholder, PLACES, RouteError, topPage, type PageHandle } from '../shell/layout'
import {
  EditProject,
  NewProject,
  ProjectPage,
  Projects,
  useEditProjectCrumbs,
  useNewProjectCrumbs,
  useProjectCrumbs,
} from '../shell/projects'
import { WORKBENCH_PATH } from '../shell/registry'
import { Workbench } from '../shell/workbench'
import { registry } from './registry'

/** The modules on the bar whose pages are still to come (EPIC-12). */
const PLACEHOLDERS = ['organisations', 'communication', 'notes']

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
              { index: true, element: <Workbench />, handle: topPage('Workbench') },
              { path: '/calendar', element: <Calendar />, handle: topPage('Calendar') },
              { path: '/projects', element: <Projects />, handle: topPage('Projects') },
              {
                path: '/projects/new',
                element: <NewProject />,
                handle: { useCrumbs: useNewProjectCrumbs } satisfies PageHandle,
              },
              {
                path: '/projects/:id/edit',
                element: <EditProject />,
                handle: { useCrumbs: useEditProjectCrumbs } satisfies PageHandle,
              },
              {
                path: '/projects/:id',
                element: <ProjectPage />,
                handle: { useCrumbs: useProjectCrumbs } satisfies PageHandle,
              },
              ...PLACES.filter((p) => PLACEHOLDERS.includes(p.id)).map((p) => ({
                path: p.to,
                element: <Placeholder place={p} />,
                handle: topPage(p.label),
              })),
              ...registry.routes,
              // The addresses the redesign retired (FR-023, FR-029): each goes where its page went.
              { path: '/things', element: <Navigate to={WORKBENCH_PATH} replace /> },
              { path: '/tasks/today', element: <Navigate to="/today" replace /> },
              { path: '/tasks/review', element: <Navigate to="/review" replace /> },
              { path: '*', element: <Navigate to={WORKBENCH_PATH} replace /> },
            ],
          },
        ],
      },
    ],
  },
])
