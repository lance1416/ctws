import type { ProjectResponse } from '@ctws/contracts'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { archivedProjectsQuery, inboxOf, projectsQuery } from './api'

const project = (over: Partial<ProjectResponse>): ProjectResponse =>
  ({ id: 'x', name: 'x', isInbox: false, ...over }) as ProjectResponse

describe('inboxOf', () => {
  it('finds the flagged project wherever it is, ignoring a decoy named Inbox', () => {
    const decoy = project({ id: 'decoy', name: 'Inbox', isInbox: false })
    const real = project({ id: 'real', name: 'Inbox', isInbox: true })
    expect(inboxOf([project({ id: 'a', name: 'a' }), decoy, real])?.id).toBe('real')
  })

  it('returns undefined when no project is flagged', () => {
    expect(inboxOf([project({ name: 'Inbox' })])).toBeUndefined()
  })
})

describe('the project queries', () => {
  it('keep the archived shelf under the projects key, so a write awaiting one awaits both', () => {
    const qc = new QueryClient()
    qc.setQueryData(projectsQuery().queryKey, [])
    qc.setQueryData(archivedProjectsQuery().queryKey, [])
    const found = qc.getQueryCache().findAll({ queryKey: projectsQuery().queryKey })
    expect(found.map((q) => q.queryKey)).toEqual([['projects'], ['projects', 'archived']])
  })
})
