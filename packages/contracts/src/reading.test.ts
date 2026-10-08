import { describe, expect, it } from 'vitest'
import { createReadingItemBody, updateReadingItemBody } from './reading'

describe('createReadingItemBody', () => {
  it('takes a bare url, because that is what pasting a link is', () => {
    const parsed = createReadingItemBody.parse({ kind: 'link', url: 'https://example.com/a' })
    expect(parsed).toEqual({ kind: 'link', url: 'https://example.com/a' })
  })

  it('refuses a link with no url and a book with no title', () => {
    expect(createReadingItemBody.safeParse({ kind: 'link', title: '一篇文章' }).success).toBe(false)
    expect(createReadingItemBody.safeParse({ kind: 'book', author: '某人' }).success).toBe(false)
  })

  it('refuses the fields of the other kind', () => {
    // A book with a url and a link with an author are both nonsense; the union is where that is
    // said, rather than leaving the database CHECK to be the only thing that knows.
    const book = { kind: 'book', title: '设计心理学', url: 'https://example.com' }
    expect(createReadingItemBody.safeParse(book).success).toBe(false)
    const link = { kind: 'link', url: 'https://example.com', author: '某人' }
    expect(createReadingItemBody.safeParse(link).success).toBe(false)
  })

  it('refuses a url scheme that is not http(s)', () => {
    // The list renders this as an href someone will click.
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd']) {
      expect(createReadingItemBody.safeParse({ kind: 'link', url }).success, url).toBe(false)
    }
    expect(createReadingItemBody.safeParse({ kind: 'link', url: 'http://x.test' }).success).toBe(
      true,
    )
  })

  it('trims the title, so a line of spaces is not a title', () => {
    expect(createReadingItemBody.safeParse({ kind: 'book', title: '   ' }).success).toBe(false)
    expect(createReadingItemBody.parse({ kind: 'book', title: '  读完它 ' }).title).toBe('读完它')
  })
})

describe('updateReadingItemBody', () => {
  it('refuses an empty patch, which would be a write that says nothing', () => {
    expect(updateReadingItemBody.safeParse({}).success).toBe(false)
  })

  it('does not let a link become a book', () => {
    expect(updateReadingItemBody.safeParse({ kind: 'book' }).success).toBe(false)
  })

  it('lets a title be cleared but never a url', () => {
    // Clearing a title returns the row to showing its host. Clearing the url would leave a link
    // that links nowhere, which is the one thing a link cannot be.
    expect(updateReadingItemBody.safeParse({ title: null }).success).toBe(true)
    expect(updateReadingItemBody.safeParse({ url: null }).success).toBe(false)
  })
})
