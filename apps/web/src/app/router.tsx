import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'
import { ymd } from '../platform/time/dates'
import { serverNow } from '../platform/time/serverClock'
import { Login, meQuery } from '../shell/auth'
import { Layout, More, MORE_PATH, RouteError, topPage, type PageHandle } from '../shell/layout'
import {
  archivedProjectsQuery,
  prefetchProject,
  ProjectPage,
  projectsQuery,
  useEditProjectCrumbs,
  useNewProjectCrumbs,
  useProjectCrumbs,
} from '../shell/projects'
import { WORKBENCH_PATH } from '../shell/registry'
import { Workbench } from '../shell/workbench'
import { lazyPage } from '../platform/ui/lazyPage'
import { queryClient } from './queryClient'
import { registry } from './registry'

// Pages the first page of a visit seldom is, loaded when drawn (baseline.md §8).
const Account = lazyPage(() => import('../shell/account/Account').then((m) => m.Account))
const MigrationReport = lazyPage(() =>
  import('../shell/account/MigrationReport').then((m) => m.MigrationReport),
)
const Calendar = lazyPage(() => import('../shell/calendar/Calendar').then((m) => m.Calendar))
const Projects = lazyPage(() => import('../shell/projects/Projects').then((m) => m.Projects))
const NewProject = lazyPage(() => import('../shell/projects/ProjectForm').then((m) => m.NewProject))
const EditProject = lazyPage(() =>
  import('../shell/projects/ProjectForm').then((m) => m.EditProject),
)

/**
 * A page that says what it will ask for gets a loader that starts it once the session is known:
 * the frame's project lists, then the page's own. It returns at once, so nothing waits on it but
 * the session, which the frame waits on anyway (baseline.md §8: the first request a page made
 * used to wait for the whole frame to be drawn).
 */
function prefetched(routes: RouteObject[]): RouteObject[] {
  return routes.map((route) => {
    const prefetch = (route.handle as PageHandle | undefined)?.prefetch
    const children = route.children ? prefetched(route.children) : undefined
    return {
      ...route,
      ...(children ? { children } : {}),
      ...(prefetch
        ? {
            loader: async ({ params }) => {
              const me = await queryClient.ensureQueryData(meQuery()).catch(() => null)
              if (!me) return null
              void queryClient.prefetchQuery(projectsQuery())
              void queryClient.prefetchQuery(archivedProjectsQuery())
              prefetch({ qc: queryClient, params, today: ymd(serverNow(), me.timezone), registry })
              return null
            },
            // Arriving at a page prefetches; a change of its search (`?task=` as a task opens) is
            // not arriving, and prefetching again then would join a read the write in hand has
            // already made stale.
            shouldRevalidate: ({ currentParams, nextParams, currentUrl, nextUrl }) =>
              currentUrl.pathname !== nextUrl.pathname ||
              JSON.stringify(currentParams) !== JSON.stringify(nextParams),
          }
        : {}),
    } as RouteObject
  })
}

export const router = createBrowserRouter(
  prefetched([
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
                { path: MORE_PATH, element: <More />, handle: topPage('More') },
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
                  handle: {
                    useCrumbs: useProjectCrumbs,
                    prefetch: prefetchProject,
                  } satisfies PageHandle,
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
  ]),
)
