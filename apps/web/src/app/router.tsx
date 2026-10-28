import { createBrowserRouter, Navigate } from 'react-router-dom'
import { Login } from '../shell/auth'
import { Account, MigrationReport } from '../shell/account'
import { Calendar } from '../shell/calendar'
import { Layout, RouteError, topPage, type PageHandle } from '../shell/layout'
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
              { path: '/account', element: <Account />, handle: topPage('Account') },
              {
                path: '/migration',
                element: <MigrationReport />,
                handle: {
                  useCrumbs: () => [
                    { label: 'Account', to: '/account' },
                    { label: 'Migration report' },
                  ],
                } satisfies PageHandle,
              },
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
