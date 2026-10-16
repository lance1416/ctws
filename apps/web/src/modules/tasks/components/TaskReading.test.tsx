import {
  idFrom,
  projectId,
  type ProjectResponse,
  taskId,
  type TaskResponse,
  workspaceId,
} from '@ctws/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { registry } from '../../../app/registry'
import { RegistryProvider } from '../../../shell/registry'
import { archivedProjectsQuery, projectsQuery } from '../../../shell/projects'
import { TaskReading } from './TaskReading'

const project = (id: string, name: string, archivedAt: string | null): ProjectResponse => ({
  id: idFrom(projectId, id),
  workspaceId: workspaceId.parse('00000000-0000-7000-8000-0000000000ff'),
  name,
  color: 'project-1',
  rank: 'a0',
  isInbox: false,
  archivedAt,
  createdAt: '2026-10-01T00:00:00Z',
  columns: {},
})

const task: TaskResponse = {
  id: taskId.parse('00000000-0000-7000-8000-000000000001'),
  projectId: projectId.parse('00000000-0000-7000-8000-0000000000a2'),
  parentId: null,
  title: 'shipped',
  notes: null,
  status: 'done',
  scheduledOn: null,
  dueAt: null,
  rank: 'a0',
  completedAt: '2026-10-10T09:00:00Z',
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-10T09:00:00Z',
}

describe('TaskReading', () => {
  it('names the project of a task whose project is archived', () => {
    const client = new QueryClient()
    client.setQueryData(projectsQuery().queryKey, [
      project('00000000-0000-7000-8000-0000000000a1', '在做的', null),
    ])
    client.setQueryData(archivedProjectsQuery().queryKey, [
      project(task.projectId, '收起来的', '2026-10-11T00:00:00Z'),
    ])
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <RegistryProvider value={registry}>
          <MemoryRouter>
            <TaskReading task={task} onEdit={() => {}} onClose={() => {}} />
          </MemoryRouter>
        </RegistryProvider>
      </QueryClientProvider>,
    )
    expect(html).toContain('收起来的')
  })

  it.each(['done', 'cancelled'] as const)('does not call a %s task late', (status) => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <RegistryProvider value={registry}>
          <MemoryRouter>
            <TaskReading
              task={{ ...task, status, dueAt: '2020-01-01T12:00:00Z' }}
              onEdit={() => {}}
              onClose={() => {}}
            />
          </MemoryRouter>
        </RegistryProvider>
      </QueryClientProvider>,
    )
    expect(html).not.toContain('late')
    expect(html).not.toContain('text-missed')
  })

  it('still calls an open task late', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <RegistryProvider value={registry}>
          <MemoryRouter>
            <TaskReading
              task={{ ...task, status: 'todo', completedAt: null, dueAt: '2020-01-01T12:00:00Z' }}
              onEdit={() => {}}
              onClose={() => {}}
            />
          </MemoryRouter>
        </RegistryProvider>
      </QueryClientProvider>,
    )
    expect(html).toContain('late')
  })
})
