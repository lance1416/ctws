import { idFrom, projectId, type ProjectListItem, workspaceId } from '@ctws/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { archivedProjectsQuery, projectsQuery } from './api'
import { ProjectPicker, ProjectsPicker } from './ProjectPicker'

const project = (id: string, name: string, archivedAt: string | null): ProjectListItem => ({
  id: idFrom(projectId, id),
  workspaceId: workspaceId.parse('00000000-0000-7000-8000-000000000000'),
  name,
  color: 'project-2',
  isInbox: false,
  rank: 'a0',
  archivedAt,
  createdAt: '2026-10-01T00:00:00.000Z',
  columns: {},
})

function render(node: ReactNode) {
  const client = new QueryClient()
  client.setQueryData(projectsQuery().queryKey, [project('live', 'Job hunt', null)])
  client.setQueryData(archivedProjectsQuery().queryKey, [
    project('old', 'Old flat', '2026-10-02T00:00:00.000Z'),
  ])
  return renderToStaticMarkup(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

describe('a chosen project that is archived', () => {
  it('keeps its name among several', () => {
    const html = render(<ProjectsPicker chosen={[idFrom(projectId, 'old')]} onChange={() => {}} />)
    expect(html).toContain('Old flat')
  })

  it('keeps its name as the one', () => {
    const html = render(
      <ProjectPicker value={idFrom(projectId, 'old')} onPick={() => {}} none="No project" />,
    )
    expect(html).toContain('Projects: Old flat')
  })
})
