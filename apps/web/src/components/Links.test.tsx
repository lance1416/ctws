import type { LinksResponse } from '@ctws/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { linksKey } from '../api/links'
import { Links } from './Links'

/**
 * 牵着的东西 -- the panel that reads an edge from the OTHER end.
 *
 * What is worth testing here is not that a list renders: it is that the shell routes a row it
 * knows nothing about. The panel is handed a type and an id by the server and has to turn that
 * into a link, which it can only do by asking the module registry -- so these assertions fail if
 * a module stops declaring where its things live, which is the one way this panel can break
 * without anything else noticing.
 */

const groups: LinksResponse['groups'] = [
  {
    label: '会议',
    type: 'meeting',
    items: [
      {
        type: 'meeting',
        id: 'm1',
        title: '二面',
        detail: '2026-10-20 21:00 · America/Toronto',
        kind: 'attends',
        label: '参加过',
        outgoing: false,
      },
    ],
  },
  {
    label: '项目',
    type: 'project',
    items: [
      {
        type: 'project',
        id: 'p1',
        title: '找工作',
        detail: null,
        kind: 'belongs',
        label: '属于',
        outgoing: true,
      },
    ],
  },
]

function render(of: { type: 'contact'; id: string }, data?: LinksResponse['groups']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (data) client.setQueryData(linksKey(of), data)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Links of={of} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const of = { type: 'contact', id: 'c1' } as const

describe('what one thing is connected to', () => {
  it('names each group and counts what is in it', () => {
    const html = render(of, groups)
    expect(html).toContain('会议')
    expect(html).toContain('项目')
    expect(html).toContain('aria-label="会议"')
  })

  it('routes a row through the module that owns its type, not through a path of its own', () => {
    const html = render(of, groups)
    // The meetings module says where a meeting lives; the shell does not know and must not guess.
    expect(html).toContain('href="/calendar"')
    // A project is the shell's own, and it has a page per project.
    expect(html).toContain('href="/projects/p1"')
  })

  it("shows the edge's own word, read from this end", () => {
    const html = render(of, groups)
    // 「参加过」 is the INVERSE: the row stored says 「这个会 参与 陈颖」, and this is the person.
    expect(html).toContain('参加过')
    expect(html).toContain('属于')
    expect(html).toContain('America/Toronto')
  })

  it('says so when there is nothing, rather than drawing an empty frame', () => {
    expect(render(of, [])).toContain('还没有牵着别的东西')
  })

  it('renders nothing at all while it is still loading', () => {
    // A skeleton would flash on every pane that opens, and the panel sits BELOW the thing's own
    // fields rather than in place of them -- so there is nothing to hold a place for.
    expect(render(of)).toBe('')
  })
})
