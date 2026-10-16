import { idFrom, linkId, type LinksResponse } from '@ctws/contracts'
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

const groups: LinksResponse['groups'] = [
  {
    label: 'Meetings',
    type: 'meeting',
    items: [
      {
        type: 'meeting',
        id: 'm1',
        title: 'Second interview',
        detail: '2026-10-20 21:00 · America/Toronto',
        kind: 'attends',
        label: 'attended',
        outgoing: false,
        linkId: idFrom(linkId, '0190a7c2-6f00-7000-8000-00000000000a'),
      },
    ],
  },
  {
    label: 'Projects',
    type: 'project',
    items: [
      {
        type: 'project',
        id: 'p1',
        title: 'Job hunt',
        detail: null,
        kind: 'belongs',
        label: '',
        outgoing: true,
        linkId: idFrom(linkId, '0190a7c2-6f00-7000-8000-00000000000b'),
      },
    ],
  },
]

function render(of: { type: 'person'; id: string }, data?: LinksResponse['groups']) {
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

  it("shows the edge's own word, read from this end", () => {
    const html = render(of, groups)
    // "attended" is the inverse: the stored row says the meeting has this person.
    expect(html).toContain('attended')
    // `belongs` carries no word of its own: the group is already called Projects.
    const projectRow = /data-linked="p1".*?<\/a>/.exec(html)![0]
    expect(projectRow).toContain('Job hunt')
    expect(projectRow).not.toContain('text-ink-subtle')
    expect(html).toContain('America/Toronto')
  })

  it('says so when there is nothing, rather than drawing an empty frame', () => {
    expect(render(of, [])).toContain('Nothing linked yet')
  })

  it('renders nothing at all while it is still loading', () => {
    expect(render(of)).toBe('')
  })
})
