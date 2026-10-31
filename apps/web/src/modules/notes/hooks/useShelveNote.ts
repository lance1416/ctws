import type { NoteFolderId, NoteId, NoteResponse } from '@ctws/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { notesQuery, patchNote } from '../api'

/**
 * Where a note is kept: its folder, its pin (FR-110). The list shows the answer at once, the note
 * moved where it now belongs; nothing of what it says is sent.
 */
export function useShelveNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...shelf
    }: {
      id: NoteId
      folderId?: NoteFolderId | null
      pinned?: boolean
    }) => patchNote(id, shelf),
    meta: { changes: ['note'] },
    onSuccess: (saved) =>
      qc.setQueryData(notesQuery().queryKey, (was: NoteResponse[] = []) =>
        was.map((n) => (n.id === saved.id ? saved : n)),
      ),
  })
}
