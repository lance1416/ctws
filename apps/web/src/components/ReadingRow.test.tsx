import type { ReadingItemResponse } from '@ctws/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ReadingRow } from './ReadingRow'

/**
 * 一条链接那一行写什么。
 *
 * 三个标题来源，顺序是定死的：人自己写的 > 抓回来的 > host 加路径。人改过的标题不能被一次重抓
 * 盖掉 —— 这也是抓回来的那一个单独存一列、而不是写进 `title` 的原因。
 */

const item = (over: Partial<ReadingItemResponse> = {}): ReadingItemResponse => ({
  id: '00000000-0000-0000-0000-000000000001',
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

const render = (i: ReadingItemResponse) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ReadingRow item={i} timeZone="UTC" today="2026-10-12" />
    </QueryClientProvider>,
  )

describe('ReadingRow', () => {
  it('抓回来的标题胜过 host 加路径', () => {
    const html = render(item({ fetchedTitle: 'Linear 怎么重做 issue' }))
    // 行上那句话，不是 href —— href 本来就该是完整地址。
    expect(html).toContain('>Linear 怎么重做 issue</a>')
    expect(html).not.toContain('>linear.app/now/how-we-redesigned-issues</a>')
  })

  it('人自己写的标题胜过抓回来的', () => {
    const html = render(item({ title: '我自己说的', fetchedTitle: '对面说的' }))
    expect(html).toContain('我自己说的')
    expect(html).not.toContain('对面说的')
  })

  it('什么都没抓到就还是 host 加路径', () => {
    expect(render(item())).toContain('linear.app/now/how-we-redesigned-issues')
  })

  it('抓到那句话时，行下面多一行它', () => {
    const html = render(
      item({ fetchedTitle: '标题', fetchedSummary: '我们把 issue 拆成了三件事。' }),
    )
    expect(html).toContain('我们把 issue 拆成了三件事。')
  })

  it('没有那句话就不留一行空的', () => {
    expect(render(item({ fetchedTitle: '标题' }))).not.toContain('data-reading-summary')
  })
})
