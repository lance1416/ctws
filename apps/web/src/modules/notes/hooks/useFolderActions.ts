import type { NoteFolderId, NoteFolderResponse, NoteId } from '@ctws/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFolder, deleteFolder, foldersQuery, noteKeys, patchFolder, patchNote } from '../api'

/**
 * A folder made (at the top or in another), renamed, moved, opened or deleted.
 * Made for a note ("New folder…"), the note goes in it. Deleted, what was in it moves up a level:
 * the list is read again for it. Opened or closed, the sidebar shows it at once.
 */
export function useFolderActions() {
  const qc = useQueryClient()
  const settle = () => qc.invalidateQueries({ queryKey: noteKeys.all })
  return {
    create: useMutation({
      mutationFn: async ({
        name,
        parentId = null,
        forNote,
      }: {
        name: string
        parentId?: NoteFolderId | null
        forNote: NoteId | null
      }) => {
        const made = await createFolder(name, parentId)
        if (forNote) await patchNote(forNote, { folderId: made.id })
        return made
      },
      meta: { changes: ['note'], ownsError: true },
      onSettled: settle,
    }),
    rename: useMutation({
      mutationFn: ({ id, name }: { id: NoteFolderId; name: string }) => patchFolder(id, { name }),
      meta: { changes: ['note'], ownsError: true },
      onSettled: settle,
    }),
    move: useMutation({
      mutationFn: ({ id, parentId }: { id: NoteFolderId; parentId: NoteFolderId | null }) =>
        patchFolder(id, { parentId }),
      meta: { changes: ['note'] },
      onSettled: settle,
    }),
    open: useMutation({
      mutationFn: ({ id, open }: { id: NoteFolderId; open: boolean }) => patchFolder(id, { open }),
      // Shown at once; nothing else reads it, so nothing is read again.
      onMutate: ({ id, open }) =>
        qc.setQueryData(foldersQuery().queryKey, (was: NoteFolderResponse[] = []) =>
          was.map((f) => (f.id === id ? { ...f, open } : f)),
        ),
      meta: { refresh: false },
      onError: settle,
    }),
    remove: useMutation({
      mutationFn: (id: NoteFolderId) => deleteFolder(id),
      meta: { changes: ['note'] },
      onSettled: settle,
    }),
  }
}
