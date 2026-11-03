import type { NoteFolderResponse, NoteResponse } from '@ctws/contracts'
import { freeName } from '@ctws/core'

/**
 * What deleting a folder asks first: what goes, what stays, and where; a folder
 * moving up whose name is taken there says what it becomes, as the server will name it. An empty
 * folder goes unasked: null.
 */
export function deleteQuestion(
  folder: NoteFolderResponse,
  folders: readonly NoteFolderResponse[],
  notes: readonly NoteResponse[],
): string | null {
  const inside = folders.filter((f) => f.parentId === folder.id)
  const held = notes.filter((n) => n.folderId === folder.id).length
  if (inside.length + held === 0) return null
  const what = [
    inside.length > 0 && (inside.length === 1 ? '1 folder' : `${inside.length} folders`),
    held > 0 && (held === 1 ? '1 note' : `${held} notes`),
  ].filter((w) => w !== false)
  const stays = inside.length + held === 1 ? 'stays' : 'stay'
  const taken = new Set(
    folders.filter((f) => f.parentId === folder.parentId && f.id !== folder.id).map((f) => f.name),
  )
  const renamed: string[] = []
  for (const f of inside) {
    const name = freeName(f.name, taken)
    taken.add(name)
    if (name !== f.name) renamed.push(` ${f.name} becomes ${name}.`)
  }
  return `Delete ${folder.name}? The folder goes; its ${what.join(' and ')} ${stays}, one level up.${renamed.join('')}`
}
