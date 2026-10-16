import { idFrom, readingId, type ReadingItemResponse, type UserResponse } from '@ctws/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ReadingRow } from './ReadingRow'

const item = (over: Partial<ReadingItemResponse> = {}): ReadingItemResponse => ({
  id: idFrom(readingId, '00000000-0000-0000-0000-000000000001'),
  kind: 'link',
  title: null,
  url: 'https://www.linear.app/now/how-we-redesigned-issues',
  author: null,
  status: 'todo',
  planOn: null,
  projectId: null,
  projectName: null,
  fetchedTitle: null,
  fetchedSummary: null,
  createdAt: '2026-10-10T09:00:00Z',
  updatedAt: '2026-10-10T09:00:00Z',
  ...over,
})

// The account's zone is read from `me`, as the app has it once signed in.
const signedIn = () => {
  const client = new QueryClient()
  client.setQueryData(['me'], { timezone: 'UTC' } as UserResponse)
  return client
}

const render = (i: ReadingItemResponse) =>
  renderToStaticMarkup(
    <QueryClientProvider client={signedIn()}>
      <ReadingRow item={i} today="2026-10-12" onOpen={() => {}} />
    </QueryClientProvider>,
  )

describe('ReadingRow', () => {
  it('a fetched title wins over host and path', () => {
    const html = render(item({ fetchedTitle: 'Linear 怎么重做 issue' }))
    // The words on the row, not the href, which is the whole address as it should be.
    expect(html).toContain('>Linear 怎么重做 issue</a>')
    expect(html).not.toContain('>linear.app/now/how-we-redesigned-issues</a>')
  })

  it('a typed title wins over a fetched one', () => {
    const html = render(item({ title: '我自己说的', fetchedTitle: '对面说的' }))
    expect(html).toContain('我自己说的')
    expect(html).not.toContain('对面说的')
  })

  it('with nothing fetched it is still host and path', () => {
    expect(render(item())).toContain('linear.app/now/how-we-redesigned-issues')
  })

  it('a fetched summary adds one line under the row', () => {
    const html = render(
      item({ fetchedTitle: '标题', fetchedSummary: '我们把 issue 拆成了三件事。' }),
    )
    expect(html).toContain('我们把 issue 拆成了三件事。')
  })

  it('without a summary there is no empty line', () => {
    expect(render(item({ fetchedTitle: '标题' }))).not.toContain('data-reading-summary')
  })

  it("a book's title is a button that opens its pane", () => {
    const html = render(item({ kind: 'book', url: null, title: '设计心理学' }))
    expect(html).toMatch(/<button type="button"[^>]*>设计心理学<\/button>/)
  })
})
