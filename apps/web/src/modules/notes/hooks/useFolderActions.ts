import type { NoteFolderId, NoteId } from '@ctws/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFolder, deleteFolder, noteKeys, patchNote, renameFolder } from '../api'

/**
 * A folder made, renamed or deleted (FR-110). Made for a note ("New folder…"), the note goes in
 * it. Deleted, its notes are in none: the list is read again for them.
 */
export function useFolderActions() {
  const qc = useQueryClient()
  const settle = () => qc.invalidateQueries({ queryKey: noteKeys.all })
  return {
    create: useMutation({
      mutationFn: async ({ name, forNote }: { name: string; forNote: NoteId | null }) => {
        const made = await createFolder(name)
        if (forNote) await patchNote(forNote, { folderId: made.id })
        return made
      },
      meta: { changes: ['note'], ownsError: true },
      onSettled: settle,
    }),
    rename: useMutation({
      mutationFn: ({ id, name }: { id: NoteFolderId; name: string }) => renameFolder(id, name),
      meta: { changes: ['note'], ownsError: true },
      onSettled: settle,
    }),
    remove: useMutation({
      mutationFn: (id: NoteFolderId) => deleteFolder(id),
      meta: { changes: ['note'] },
      onSettled: settle,
    }),
  }
}
