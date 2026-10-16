import { describe, expect, it } from 'vitest'
import { createLinkBody, isLinkEdge, kindsBetween, linkIsAllowed, type LinkEdge } from './link'

const id = '01931b9c-5d7e-7c3a-8f2e-1a2b3c4d5e6f'
const other = '01931b9c-5d7e-7c3a-8f2e-1a2b3c4d5e70'

describe('belongs', () => {
  it.each(['reading', 'meeting', 'person'])('files a %s under a project', (from) => {
    expect(linkIsAllowed('belongs', from, 'project')).toBe(true)
  })

  // A task's project is its own column, and projects do not nest.
  it.each(['task', 'project'])('is not an edge from a %s', (from) => {
    expect(linkIsAllowed('belongs', from, 'project')).toBe(false)
    expect(kindsBetween(from as 'task', 'project').map((k) => k.kind)).toEqual(['about'])
  })

  it('cannot be written down from a task or a project', () => {
    // @ts-expect-error A task's project is its own column.
    const task: LinkEdge = {
      kind: 'belongs',
      from: { type: 'task', id },
      to: { type: 'project', id: other },
    }
    // @ts-expect-error Projects do not nest.
    const project: LinkEdge = {
      kind: 'belongs',
      from: { type: 'project', id },
      to: { type: 'project', id: other },
    }
    expect([task, project].filter(isLinkEdge)).toEqual([])
  })

  it('points only at a project', () => {
    expect(linkIsAllowed('belongs', 'reading', 'person')).toBe(false)
  })
})

describe('linkIsAllowed', () => {
  it('reads each kind in its own direction', () => {
    expect(linkIsAllowed('attends', 'meeting', 'person')).toBe(true)
    expect(linkIsAllowed('attends', 'person', 'meeting')).toBe(false)
  })

  it('lets `about` join any two things, two of a kind included', () => {
    expect(linkIsAllowed('about', 'project', 'project')).toBe(true)
    expect(linkIsAllowed('about', 'task', 'reading')).toBe(true)
  })

  it('knows no other kind', () => {
    expect(linkIsAllowed('likes', 'person', 'person')).toBe(false)
  })
})

describe('createLinkBody', () => {
  const body = (from: string, to: string, kind: string, toId = other) => ({
    from: { type: from, id },
    to: { type: to, id: toId },
    kind,
  })

  it('refuses a task filed by link', () => {
    expect(createLinkBody.safeParse(body('task', 'project', 'belongs')).success).toBe(false)
    expect(createLinkBody.safeParse(body('reading', 'project', 'belongs')).success).toBe(true)
  })

  it('refuses a thing linked to itself', () => {
    expect(createLinkBody.safeParse(body('task', 'task', 'about', id)).success).toBe(false)
  })
})
