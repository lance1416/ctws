import type { NoteFolderResponse, NoteResponse } from '@ctws/contracts'
import { describe, expect, it } from 'vitest'
import { deleteQuestion } from './folderDelete'

let n = 0
const folder = (name: string, parent: NoteFolderResponse | null = null) =>
  ({ id: `f${++n}`, parentId: parent?.id ?? null, name }) as NoteFolderResponse
const note = (inFolder: NoteFolderResponse) => ({ folderId: inFolder.id }) as NoteResponse

describe('the question before a folder is deleted', () => {
  it('says what stays, one level up', () => {
    const ideas = folder('Ideas')
    const all = [ideas, folder('A', ideas), folder('B', ideas)]
    const notes = Array.from({ length: 5 }, () => note(ideas))
    expect(deleteQuestion(ideas, all, notes)).toBe(
      'Delete Ideas? The folder goes; its 2 folders and 5 notes stay, one level up.',
    )
    const one = folder('One')
    expect(deleteQuestion(one, [one], [note(one)])).toBe(
      'Delete One? The folder goes; its 1 note stays, one level up.',
    )
  })

  it('says which folder moving up is renamed, and is not asked for an empty one', () => {
    const talks = folder('Talks')
    const ideas = folder('Ideas')
    const all = [talks, ideas, folder('Talks', ideas)]
    expect(deleteQuestion(ideas, all, [])).toBe(
      'Delete Ideas? The folder goes; its 1 folder stays, one level up. Talks becomes Talks 2.',
    )
    expect(deleteQuestion(talks, all, [])).toBeNull()
  })
})
