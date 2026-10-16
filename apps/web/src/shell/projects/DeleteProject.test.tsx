import type { ProjectListItem } from '@ctws/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { registry } from '../../app/registry'
import { RegistryProvider } from '../registry'
import { archivedProjectsQuery, projectsQuery } from './api'
import { DeleteProject } from './DeleteProject'

const project = (id: string, over: Partial<ProjectListItem> = {}): ProjectListItem => ({
  id,
  workspaceId: '00000000-0000-7000-8000-000000000000',
  name: id,
  color: 'project-2',
  isInbox: false,
  rank: 'a0',
  archivedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  openTasks: 0,
  ...over,
})

function render(id: string, live: ProjectListItem[], archived: ProjectListItem[]) {
  const client = new QueryClient()
  client.setQueryData(projectsQuery().queryKey, live)
  client.setQueryData(archivedProjectsQuery().queryKey, archived)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <RegistryProvider value={registry}>
        <MemoryRouter>
          <DeleteProject id={id} />
        </MemoryRouter>
      </RegistryProvider>
    </QueryClientProvider>,
  )
}

describe('deleting a project', () => {
  it('is offered for an archived project too', () => {
    const shelved = project('old', { archivedAt: '2026-10-02T00:00:00.000Z' })
    expect(render('old', [project('inbox', { isInbox: true })], [shelved])).toContain(
      'Delete project',
    )
  })

  it('is not offered for the inbox', () => {
    expect(render('inbox', [project('inbox', { isInbox: true })], [])).toBe('')
  })
})
