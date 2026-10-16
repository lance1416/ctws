import { createBrowserRouter, Navigate } from 'react-router-dom'
import { Login } from '../shell/auth'
import { Calendar } from '../shell/calendar'
import { Layout } from '../shell/layout'
import { ProjectPage, Projects } from '../shell/projects'
import { WORKBENCH_PATH } from '../shell/registry'
import { Things, Workbench } from '../shell/workbench'
import { registry } from './registry'

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    // The catch-all is under Layout, so an unknown path is handled like any signed-out visit.
    element: <Layout />,
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
])
