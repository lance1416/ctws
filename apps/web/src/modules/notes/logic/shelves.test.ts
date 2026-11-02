import type { NoteFolderResponse, NoteResponse } from '@ctws/contracts'
import { describe, expect, it } from 'vitest'
import { everyShelf, shelvesOf } from './shelves'

const AT = '2026-10-31T09:00:00.000Z'
let n = 0
const id = () => `01a19000-0000-7000-8000-${String(++n).padStart(12, '0')}`

function note(title: string, more: Partial<NoteResponse> = {}): NoteResponse {
  return {
    id: id() as NoteResponse['id'],
    title,
    body: '',
    anchor: null,
    folderId: null,
    pinnedAt: null,
    words: 0,
    heldAt: null,
    createdAt: AT,
    updatedAt: AT,
    ...more,
  }
}

const folder = (name: string, parent: NoteFolderResponse | null = null): NoteFolderResponse => ({
  id: id() as NoteFolderResponse['id'],
  parentId: parent?.id ?? null,
  name,
  open: false,
  createdAt: AT,
  updatedAt: AT,
})

const titles = (list: readonly NoteResponse[]) => list.map((x) => x.title)

describe('the notes sidebar’s places', () => {
  const job = folder('Job hunt prep')
  const ideas = folder('Ideas')
  const notes = [
    note('System design prep', { pinnedAt: '2026-10-30T10:00:00.000Z', folderId: job.id }),
    note('Questions for the onsite', { pinnedAt: '2026-10-31T10:00:00.000Z' }),
    note('Salary bands', { folderId: job.id }),
    note('Weekend plan'),
    note('Atlas weekly', { anchor: { type: 'meeting', id: id(), occurrenceId: null, title: 'A' } }),
  ]

  it('puts each note in one place: pinned first, newest pin on top', () => {
    const s = shelvesOf(notes, [job, ideas])
    expect(titles(s.pinned)).toEqual(['Questions for the onsite', 'System design prep'])
    expect(s.folders.map((f) => [f.folder.name, titles(f.notes)])).toEqual([
      ['Job hunt prep', ['Salary bands']],
      ['Ideas', []],
    ])
    expect(titles(s.loose)).toEqual(['Weekend plan'])
    expect(titles(s.onThings)).toEqual(['Atlas weekly'])
  })

  it('filters by name, and leaves out a folder with nothing left in it', () => {
    const s = shelvesOf(notes, [job, ideas], 'SALARY')
    expect(s.folders.map((f) => f.folder.name)).toEqual(['Job hunt prep'])
    expect([s.pinned, s.loose, s.onThings].map((l) => l.length)).toEqual([0, 0, 0])
  })

  it('lays folders out as a tree, each counting the notes under it at any depth', () => {
    const offers = folder('Offers', job)
    const london = folder('London', offers)
    const s = shelvesOf(
      [note('Stripe', { folderId: offers.id }), note('Rent', { folderId: london.id }), ...notes],
      [job, ideas, offers, london],
    )
    const top = s.folders.find((f) => f.folder.name === 'Job hunt prep')!
    expect(top.count).toBe(3)
    expect(top.folders.map((f) => [f.folder.name, f.count])).toEqual([['Offers', 2]])
    expect(top.folders[0]!.folders.map((f) => f.folder.name)).toEqual(['London'])
    expect(everyShelf(s.folders).map((f) => f.folder.name)).toEqual([
      'Job hunt prep',
      'Offers',
      'London',
      'Ideas',
    ])
  })

  it('keeps a note whose folder is gone among those in none', () => {
    const s = shelvesOf([note('Orphan', { folderId: folder('Gone').id })], [job])
    expect(titles(s.loose)).toEqual(['Orphan'])
  })
})
