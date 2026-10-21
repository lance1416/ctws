import { idFrom, relationId, type RelationsResponse } from '@ctws/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { registry } from '../../app/registry'
import { RegistryProvider } from '../registry'
import { linksQuery } from './api'
import { LinkList } from './Links'

/**
 * The panel turns a type and id from the server into a link only through the registry, so these
 * fail if a module stops declaring where its things live.
 */

const groups: RelationsResponse['groups'] = [
  {
    type: 'meeting',
    items: [
      {
        type: 'meeting',
        id: 'm1',
        title: 'Second interview',
        startsAt: '2026-10-21T01:00:00.000Z',
        timeZone: 'America/Toronto',
        relationId: idFrom(relationId, '0190a7c2-6f00-7000-8000-00000000000a'),
        origin: 'mention',
        note: null,
        excerpt: 'Prep for the second interview with Mira.',
        outgoing: false,
        createdAt: '2026-10-18T10:24:00.000Z',
      },
    ],
  },
  {
    type: 'project',
    items: [
      {
        type: 'project',
        id: 'p1',
        title: 'Job hunt',
        relationId: idFrom(relationId, '0190a7c2-6f00-7000-8000-00000000000b'),
        origin: 'manual',
        note: null,
        excerpt: null,
        outgoing: true,
        createdAt: '2026-10-18T10:24:00.000Z',
      },
    ],
  },
]

function render(of: { type: 'person'; id: string }, data?: RelationsResponse['groups']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (data) client.setQueryData(linksQuery(of).queryKey, data)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <RegistryProvider value={registry}>
        <MemoryRouter>
          <LinkList of={of} />
        </MemoryRouter>
      </RegistryProvider>
    </QueryClientProvider>,
  )
}

const of = { type: 'person', id: 'c1' } as const

describe('what one thing is connected to', () => {
  it('names each group and counts what is in it', () => {
    const html = render(of, groups)
    expect(html).toContain('Meetings')
    expect(html).toContain('Projects')
    expect(html).toContain('aria-label="Meetings"')
  })

  it('routes a row through the module that owns its type, not through a path of its own', () => {
    const html = render(of, groups)
    // The meetings module says where a meeting lives; the shell must not guess.
    expect(html).toContain('href="/meetings/m1"')
    // A project is the shell's own, and it has a page per project.
    expect(html).toContain('href="/projects/p1"')
  })

  it('shows the sentence that mentioned it, and no unlink for a mention', () => {
    const html = render(of, groups)
    expect(html).toContain('Prep for the second interview with Mira.')
    expect(html).not.toContain('Unlink Second interview')
    // One made by hand with no note has nothing to say, and can be unlinked.
    const projectRow = /data-linked="p1".*?<\/a>/.exec(html)![0]
    expect(projectRow).toContain('Job hunt')
    expect(html).toContain('Unlink Job hunt')
    // The meeting's own module says when it is, in figures (`meetingWhen` has the wording).
    const meetingRow = /data-linked="m1".*?<\/a>/.exec(html)![0]
    expect(meetingRow).toContain('font-mono')
  })

  it('says so when there is nothing, rather than drawing an empty frame', () => {
    expect(render(of, [])).toContain('Nothing linked yet')
  })

  it('renders nothing at all while it is still loading', () => {
    expect(render(of)).toBe('')
  })
})
