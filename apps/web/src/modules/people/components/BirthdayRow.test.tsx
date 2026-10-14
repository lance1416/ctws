import type { BirthdayListRow } from '@ctws/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { BirthdayRow } from './BirthdayRow'

/**
 * ONE BIRTHDAY, AS A ROW. What the row must say, and what it must not say twice.
 */

const row = (over: Partial<BirthdayListRow> = {}): BirthdayListRow => ({
  personId: '00000000-0000-0000-0000-000000000001',
  name: '周楠',
  circle: null,
  calendar: 'lunar',
  day: '2026-10-12',
  inDays: 2,
  turns: 35,
  lunarDate: '农历九月初三',
  kept: [],
  remindLead: 7,
  ...over,
})

const render = (r: BirthdayListRow) =>
  renderToStaticMarkup(
    // The thread asks for the projects' colours; nothing is fetched in a static render.
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <BirthdayRow row={r} />
      </MemoryRouter>
    </QueryClientProvider>,
  )

describe('BirthdayRow', () => {
  it('说名字、年龄、日期与距离', () => {
    const html = render(row())
    expect(html).toContain('周楠')
    expect(html).toContain('turns 35')
    expect(html).toContain('Oct 12')
    expect(html).toContain('in 2 days')
  })

  it('农历追的人带农历回显，公历追的人不带', () => {
    expect(render(row())).toContain('农历九月初三')
    expect(render(row({ calendar: 'solar', lunarDate: null }))).not.toContain('农历')
  })

  it('没有年份就不说年龄，而是说年份不知道', () => {
    const html = render(row({ turns: null }))
    expect(html).not.toContain('turns')
    expect(html).toContain('year unknown')
  })

  /** 日子被挪过的那一行要能看出来；完整的那句话在人物页上。 */
  it('日子被挪过时说一声', () => {
    expect(render(row({ kept: ['short-month'] }))).toContain('moved')
    expect(render(row({ kept: [] }))).not.toContain('moved')
  })

  it('日子在页边：只有月和日，旁边一个蛋糕', () => {
    // 下一次生日在明年也不写年份：下一次总在一年之内，页边只有一行。
    const html = render(row({ day: '2027-01-05' }))
    expect(html).toContain('Jan 5')
    expect(html).not.toContain('2027</time>')
    expect(html).toContain('data-cake')
  })

  it('今天的生日穿 deadline 色、加粗，其余是 muted', () => {
    expect(render(row({ inDays: 0 }))).toContain('text-deadline')
    expect(render(row({ inDays: 2 }))).not.toContain('text-deadline')
  })

  it('circle 用英文名，因为它是枚举而不是人写的字', () => {
    expect(render(row({ circle: 'friend' }))).toContain('Friends')
    expect(render(row({ circle: null }))).not.toContain('Friends')
  })

  it('链接指向那个人自己的页', () => {
    expect(render(row())).toContain('href="/people/00000000-0000-0000-0000-000000000001"')
  })
})
