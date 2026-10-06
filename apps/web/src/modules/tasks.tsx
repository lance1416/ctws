import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { listMovement } from '../api/movement'
import { inboxOf, listProjects } from '../api/projects'
import { searchTasks } from '../api/search'
import { createTask } from '../api/tasks'
import { refreshTasks } from '../api/taskCache'
import { listToday } from '../api/today'
import { ProjectRail } from '../components/RowParts'
import { Stat, StatRow } from '../components/Stat'
import { StatusMark } from '../components/StatusMark'
import { TaskTree } from '../components/TaskTree'
import { dayPhrase } from '../dueAt'
import { Completed } from '../routes/Completed'
import { Today } from '../routes/Today'
import { useMe } from '../useMe'
import type { CaptureTargetState, SearchHit, WorkspaceModule } from './contract'

/**
 * THE TASK MODULE: everything the shell used to have written into it.
 *
 * 「今天」and 「已完成」live here, not in the shell: they are defined by task semantics (overdue,
 * scheduled, in progress). A cross-module "today" is a separate idea and is not borrowed against
 * here (module-boundary contract §3). The shell only offers the SLOT.
 */
const ID = 'tasks'
const at = (page: string) => `/${ID}/${page}`

/** The rail's count for 今天. Shares the ['today'] cache entry with the page that owns it. */
function TodayCount() {
  const today = useQuery({ queryKey: ['today'], queryFn: listToday })
  // Only tasks that are actually on today's plate; the rail must not claim work that is not due.
  const count = today.data?.length ?? null
  if (count === null || count <= 0) return null
  return (
    <span data-count className="ml-auto pl-1 text-xs text-fg-muted">
      {count}
    </span>
  )
}

/**
 * Quick capture's destination: the workspace inbox. Found by the `isInbox` flag, never by name.
 * The shell asks for this once per render and nothing here costs the typist a keystroke.
 */
function useInboxCapture(): CaptureTargetState {
  const qc = useQueryClient()
  // Shares the ['projects'] cache entry with every other reader, so capture costs no extra request.
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  const inbox = projects.data ? inboxOf(projects.data) : undefined
  return {
    target: inbox
      ? {
          name: inbox.name,
          to: `/projects/${inbox.id}`,
          submit: async (title: string) => {
            await createTask({ projectId: inbox.id, title })
            // Awaited, so the input stays busy until the list that now holds the line is refreshed.
            await refreshTasks(qc, inbox.id)
          },
        }
      : null,
    missing: projects.isSuccess && !inbox,
    unavailable: projects.isError,
  }
}

/** This module's half of federated search: titles and notes, across every project. */
function useTaskHits(query: string) {
  const results = useQuery({
    queryKey: ['search', query],
    queryFn: () => searchTasks(query),
    enabled: query.length > 0,
  })
  const rows = query.length > 0 ? (results.data ?? []) : []
  const hits: SearchHit[] = rows.map((t) => ({
    id: t.id,
    // Choosing a result goes to the task's project with `?reveal=<id>`, which `TaskTree` consumes
    // by unfolding the ancestors and putting focus on that row. Routing alone is not enough: the
    // row may sit in a collapsed subtree, and arriving at a folded parent is the failure this is
    // for.
    to: `/projects/${t.projectId}?reveal=${t.id}`,
    title: t.title,
    meta: (
      <>
        {t.parentTitle === null ? t.projectName : `${t.projectName} › ${t.parentTitle}`}
        {t.projectArchived && ' · 已归档'}
      </>
    ),
    mark: <StatusMark status={t.status} />,
    rail: <ProjectRail projectId={t.projectId} at="left-2" />,
  }))
  return { hits, isError: results.isError, isSuccess: results.isSuccess }
}

/**
 * THE FOUR NUMBERS in the project header banner (workbench spec §2): 未完成 / 本周完成 / 逾期 /
 * 最后活动.
 *
 * Every one of them is the SERVER's, from the one `['movement']` cache entry 做到哪儿了 already
 * loads -- so a project page costs no extra request, and the banner cannot disagree with that
 * panel about the same line of work. Nothing is re-derived here: the week boundary, the overdue
 * boundary and the day count are all decided in the user's timezone by the query, and this only
 * formats them.
 *
 * NO RATIO AND NO BAR (§5). There are four counts and a date, which are things that can move;
 * `manual_progress` is written by nothing in the codebase, so a percentage would be a number the
 * backend cannot cash.
 */
function ProjectNumbers({ projectId }: { projectId: string }) {
  const movement = useQuery({ queryKey: ['movement'], queryFn: listMovement })
  const me = useMe()
  const row = movement.data?.find((r) => r.projectId === projectId)
  // Nothing rather than zeroes while the numbers are in flight, and nothing for an ARCHIVED
  // project: archiving sets a line of work aside, and the movement query leaves it out on purpose
  // rather than reporting that it has been quiet for forty days.
  if (!row) return null
  // The account's own calendar day, for reading the server's `lastActivityOn` back as a phrase.
  // Never a browser-local date: the server already decided which day that was.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: me.data?.timezone }).format(new Date())
  return (
    <StatRow>
      <Stat label="未完成" value={row.remaining} />
      <Stat label="本周完成" value={row.doneThisWeek} />
      {/* The one number that is allowed a hue, and it is the row system's own `missed`: a deadline
          that has gone. Zero stays plain, because "0 逾期" is not a warning. */}
      <Stat label="逾期" value={row.overdue} tone={row.overdue > 0 ? 'missed' : 'fg'} />
      <Stat
        label="最后活动"
        value={row.lastActivityOn ? dayPhrase(row.lastActivityOn, today) : '还没有'}
      />
    </StatRow>
  )
}

/** The module's rows under a shell project: the tree, and the one input that adds a root task. */
function ProjectTasks({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')

  const create = useMutation({
    mutationFn: (t: string) => createTask({ projectId, title: t, parentId: null }),
    onSuccess: () => {
      setTitle('')
      return refreshTasks(qc, projectId)
    },
  })

  const submit = () => {
    const t = title.trim()
    if (t && !create.isPending) create.mutate(t)
  }

  return (
    <>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit()
        }}
        placeholder="新任务"
        aria-label="新任务"
        // Inside the panel now, so it leads the rows rather than hanging under a page heading.
        className="mb-1 ml-3 h-10 w-[calc(100%-1.5rem)] max-w-[40ch] rounded-lg border border-border-strong bg-surface px-3 text-fg placeholder:text-fg-muted"
      />
      {create.isError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          创建失败，请重试
        </p>
      )}
      <TaskTree key={projectId} projectId={projectId} />
    </>
  )
}

export const taskModule: WorkspaceModule = {
  id: ID,
  label: '任务',
  destinations: [
    { id: 'today', to: at('today'), label: '今天', end: true, Count: TodayCount },
    { id: 'completed', to: at('completed'), label: '已完成', end: false },
  ],
  routes: [
    { path: 'today', element: <Today /> },
    { path: 'completed', element: <Completed /> },
  ],
  capture: { useTarget: useInboxCapture },
  search: { useHits: useTaskHits },
  chords: [
    { id: 'today', key: 't', label: '去「今天」', resolve: () => at('today'), order: 10 },
    { id: 'completed', key: 'd', label: '去「已完成」', resolve: () => at('completed'), order: 30 },
    {
      id: 'inbox',
      key: 'i',
      label: '去收件箱',
      // Read from the cache at keypress time rather than through a hook: the inbox is a row in the
      // database, and the rail and the capture box have both already loaded ['projects'] by the
      // time anyone can press a key. Unresolved means "do nothing", exactly as before.
      resolve: ({ queryClient }) => {
        const projects = queryClient.getQueryData<Awaited<ReturnType<typeof listProjects>>>([
          'projects',
        ])
        const inbox = projects ? inboxOf(projects) : undefined
        return inbox ? `/projects/${inbox.id}` : null
      },
      order: 40,
    },
  ],
  ProjectView: ProjectTasks,
  ProjectHeadline: ProjectNumbers,
}
