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
  recommendedBy: null,
}

describe('the reading form', () => {
  it('makes a link patch with trimmed text and no author', () => {
    expect(readingForm.parse(link)).toEqual({
      title: 'A post',
      url: 'https://example.com/a',
      status: 'reading',
      planOn: '2026-10-20',
      projectId: null,
      recommendedById: null,
    })
  })

  it('lets a link lose its title, and keeps its address when the box is emptied', () => {
    expect(readingForm.parse({ ...link, title: ' ', url: '' })).toEqual({
      title: null,
      status: 'reading',
      planOn: '2026-10-20',
      projectId: null,
      recommendedById: null,
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
      recommendedById: null,
    })
  })

  it('sends who recommended it as their id, and nobody as null', () => {
    const mira = { id: '6f1c2a3b-0000-4000-8000-000000000001', name: 'Mira Chen' } as const
    expect(readingForm.parse({ ...link, recommendedBy: mira })).toMatchObject({
      recommendedById: mira.id,
    })
    expect(readingForm.parse(link)).toMatchObject({ recommendedById: null })
  })
})
