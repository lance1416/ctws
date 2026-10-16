import { createBrowserRouter, Navigate } from 'react-router-dom'
import { Login } from '../shell/auth'
import { Calendar } from '../shell/calendar'
import { Layout, RouteError } from '../shell/layout'
import { ProjectPage, Projects } from '../shell/projects'
import { WORKBENCH_PATH } from '../shell/registry'
import { Things, Workbench } from '../shell/workbench'
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
              { index: true, element: <Workbench /> },
              { path: '/calendar', element: <Calendar /> },
              { path: '/projects', element: <Projects /> },
              { path: '/projects/:id', element: <ProjectPage /> },
              { path: '/things', element: <Things /> },
              ...registry.routes,
              { path: '*', element: <Navigate to={WORKBENCH_PATH} replace /> },
            ],
          },
        ],
      },
    ],
  },
])
