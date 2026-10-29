import { describe, expect, it } from 'vitest'
import { noteTitle } from './title'

const note = (over: object) => ({ title: null, body: '', anchor: null, ...over })

describe('noteTitle', () => {
  it('is the title, else the first line said plainly, else what it hangs on', () => {
    expect(noteTitle(note({ title: 'Onsite prep' }))).toBe('Onsite prep')
    expect(noteTitle(note({ body: '\n## Updates\n- one' }))).toBe('Updates')
    expect(noteTitle(note({ body: '- **Ask** about the SDK' }))).toBe('Ask about the SDK')
    expect(
      noteTitle(
        note({ anchor: { type: 'meeting', id: 'x', occurrenceId: null, title: 'Intro call' } }),
      ),
    ).toBe('Notes on Intro call')
    expect(noteTitle(note({}))).toBe('Empty note')
  })
})

describe('a meeting note', () => {
  const anchor = {
    type: 'meeting',
    id: 'x',
    occurrenceId: '2026-10-19T09:00',
    title: 'Atlas weekly',
  }

  it('is called by its meeting and that day, its headings not taken for a name', () => {
    expect(noteTitle(note({ anchor, body: '## Updates\n- one' }))).toBe('Atlas weekly, Oct 19')
  })

  it('keeps a title of its own', () => {
    expect(noteTitle(note({ anchor, title: 'Hiring plan', body: '## Updates' }))).toBe(
      'Hiring plan',
    )
  })
})
