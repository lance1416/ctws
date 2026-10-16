import type { ProjectListItem } from '@ctws/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { archivedProjectsQuery, projectsQuery, useEveryProject } from './api'

const live = { id: 'live', name: 'Job hunt', archivedAt: null } as ProjectListItem

function Shown() {
  const { data } = useEveryProject()
  return <>{data ? data.map((p) => p.name).join(',') : 'nothing'}</>
}

describe('useEveryProject', () => {
  it('still gives the live projects when the archived shelf failed to load', () => {
    const qc = new QueryClient()
    qc.setQueryData(projectsQuery().queryKey, [live])
    qc.getQueryCache()
      .build(qc, { queryKey: [...archivedProjectsQuery().queryKey] })
      .setState({ status: 'error', error: new Error('offline'), fetchStatus: 'idle' })
    const html = renderToStaticMarkup(
      <QueryClientProvider client={qc}>
        <Shown />
      </QueryClientProvider>,
    )
    expect(html).toBe('Job hunt')
  })
})
