import {
  api,
  type CreateNoteBody,
  type NoteFolderId,
  type NoteFolderResponse,
  type NoteId,
  type NoteResponse,
  type UpdateNoteBody,
} from '@ctws/contracts'
import { queryOptions } from '@tanstack/react-query'
import { call, everyPage } from '../../platform/http/api'

/** This module's query keys. Every one starts with `'notes'`, so `all` reaches each of them. */
export const noteKeys = {
  all: ['notes'] as const,
  list: ['notes', 'list'] as const,
  folders: ['notes', 'folders'] as const,
}

/** Every note, the latest edited first. */
export const notesQuery = () =>
  queryOptions({
    queryKey: noteKeys.list,
    queryFn: async ({ signal }) =>
      (
        await everyPage((cursor) => call(api.notes.list, { query: { cursor } }, { signal }), signal)
      ).flatMap((p) => p.notes),
  })

export function createNote(body: CreateNoteBody): Promise<NoteResponse> {
  return call(api.notes.create, { body })
}

export function patchNote(id: NoteId, body: UpdateNoteBody): Promise<NoteResponse> {
  return call(api.notes.update, { params: { id }, body })
}

export function deleteNote(id: NoteId): Promise<void> {
  return call(api.notes.remove, { params: { id } })
}

/** Every folder, by name (FR-110). */
export const foldersQuery = () =>
  queryOptions({
    queryKey: noteKeys.folders,
    queryFn: async ({ signal }) => (await call(api.noteFolders.list, {}, { signal })).folders,
  })

export function createFolder(name: string): Promise<NoteFolderResponse> {
  return call(api.noteFolders.create, { body: { name } })
}

export function renameFolder(id: NoteFolderId, name: string): Promise<NoteFolderResponse> {
  return call(api.noteFolders.update, { params: { id }, body: { name } })
}

export function deleteFolder(id: NoteFolderId): Promise<void> {
  return call(api.noteFolders.remove, { params: { id } })
}
