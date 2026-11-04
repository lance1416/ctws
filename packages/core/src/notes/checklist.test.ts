import { describe, expect, it } from 'vitest'
import { openItems, tickItem } from './checklist'

const NOTES = [
  '# Atlas weekly',
  '- [ ] Ask Sam about the API',
  '- [x] Send the agenda',
  '  * [ ] Book the room',
  '1. [ ] Numbered one',
  '```',
  '- [ ] not an item, only code',
  '```',
  '- [ ]',
].join('\n')

describe('openItems', () => {
  it('lists the unticked items by line, whatever their bullet or indent, not in code', () => {
    expect(openItems(NOTES)).toEqual([
      { line: 1, text: 'Ask Sam about the API' },
      { line: 3, text: 'Book the room' },
      { line: 4, text: 'Numbered one' },
    ])
  })
})

describe('tickItem', () => {
  it('ticks the item at its line, leaving the rest of the note as it was', () => {
    const ticked = tickItem(NOTES, { line: 3, text: 'Book the room' })!
    expect(ticked.split('\n')[3]).toBe('  * [x] Book the room')
    expect(ticked.split('\n').filter((_, i) => i !== 3)).toEqual(
      NOTES.split('\n').filter((_, i) => i !== 3),
    )
  })

  it('finds the item where an edit since has moved it', () => {
    const moved = `A new first line\n${NOTES}`
    expect(tickItem(moved, { line: 3, text: 'Book the room' })!.split('\n')[4]).toBe(
      '  * [x] Book the room',
    )
  })

  it('ticks nothing when the item is gone, already ticked, or there are two to guess between', () => {
    expect(tickItem(NOTES, { line: 1, text: 'Gone' })).toBeNull()
    expect(tickItem(NOTES, { line: 2, text: 'Send the agenda' })).toBeNull()
    const twice = '- [ ] Call\n- [ ] Call'
    expect(tickItem(`x\n${twice}`, { line: 0, text: 'Call' })).toBeNull()
    expect(tickItem(twice, { line: 1, text: 'Call' })).toBe('- [ ] Call\n- [x] Call')
  })
})
