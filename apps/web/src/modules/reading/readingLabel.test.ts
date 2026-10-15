import { describe, expect, it } from 'vitest'
import { readingLabel } from './item'
import { addedLabel } from './components/ReadingRow'

const at = (iso: string) => new Date(iso)

describe('readingLabel', () => {
  it('prefers the title someone typed', () => {
    expect(readingLabel({ title: '重做配色', url: 'https://example.com' })).toBe('重做配色')
  })

  /**
   * 没有标题时写 host + 路径。
   *
   * 只写 host，一行就是 `github.com`、`x.com` —— 认不出是哪个 repo、哪条推，这一行等于没有信息。
   * 查询串不写：utm 之类是噪音，而行宽本来就不够。
   */
  it('没有标题时写到路径，因为 host 自己认不出是哪一个', () => {
    expect(readingLabel({ title: null, url: 'https://www.linear.app/now/a/b?c=1' })).toBe(
      'linear.app/now/a/b',
    )
    expect(readingLabel({ title: null, url: 'https://github.com/lance1416/ctws' })).toBe(
      'github.com/lance1416/ctws',
    )
    // 根路径就是 host 本身，不留一条光秃秃的斜杠。
    expect(readingLabel({ title: null, url: 'https://example.com/' })).toBe('example.com')
  })

  it('shows a url it cannot parse rather than an empty row', () => {
    expect(readingLabel({ title: null, url: 'not a url' })).toBe('not a url')
  })
})

describe('addedLabel', () => {
  it('names today and yesterday, and counts the rest', () => {
    const now = at('2026-10-08T09:00:00Z')
    expect(addedLabel('2026-10-08T01:00:00Z', 'UTC', now)).toBe('Added today')
    expect(addedLabel('2026-10-07T23:00:00Z', 'UTC', now)).toBe('Added yesterday')
    expect(addedLabel('2026-09-21T10:00:00Z', 'UTC', now)).toBe('Added 17 days ago')
  })

  it("counts in the account's zone, not the browser's", () => {
    // The SAME two instants, a day apart in one zone and the same day in another: 01:00 UTC on
    // the 8th is still the 7th in Los Angeles, while 09:00 UTC is the 8th there.
    const now = at('2026-10-08T09:00:00Z')
    const added = '2026-10-08T01:00:00Z'
    expect(addedLabel(added, 'UTC', now)).toBe('Added today')
    expect(addedLabel(added, 'America/Los_Angeles', now)).toBe('Added yesterday')
  })
})
