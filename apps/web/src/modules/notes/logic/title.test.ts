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
