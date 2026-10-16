import { describe, expect, it } from 'vitest'
import { readingForm, type ReadingForm } from './readingForm'

const link: ReadingForm = {
  kind: 'link',
  title: '  A post  ',
  url: ' https://example.com/a ',
  author: 'ignored',
  status: 'reading',
  planOn: '2026-10-20',
  projectId: null,
}

describe('the reading form', () => {
  it('makes a link patch with trimmed text and no author', () => {
    expect(readingForm.parse(link)).toEqual({
      title: 'A post',
      url: 'https://example.com/a',
      status: 'reading',
      planOn: '2026-10-20',
      projectId: null,
    })
  })

  it('lets a link lose its title, and keeps its address when the box is emptied', () => {
    expect(readingForm.parse({ ...link, title: ' ', url: '' })).toEqual({
      title: null,
      status: 'reading',
      planOn: '2026-10-20',
      projectId: null,
    })
  })

  it('refuses a book with no title, and sends a book its author but never a url', () => {
    const book: ReadingForm = { ...link, kind: 'book', author: ' ' }
    expect(readingForm.safeParse({ ...book, title: '' }).success).toBe(false)
    expect(readingForm.parse(book)).toEqual({
      title: 'A post',
      author: null,
      status: 'reading',
      planOn: '2026-10-20',
      projectId: null,
    })
  })
})
