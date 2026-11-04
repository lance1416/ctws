import type { NoteFolderResponse } from '@ctws/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Toast } from '../../../platform/ui/Toast'
import { createNote, noteKeys } from '../api'
import { NOTES_ID } from '../logic/id'
import { importedLine, isMarkdownFile, noteFromFile } from '../logic/importNote'

/** What `accept` offers in the file picker; .md has no type browsers agree on. */
export const MARKDOWN_ACCEPT = '.md,.markdown,text/markdown'

/**
 * Imports .md files as notes, each unchanged and named by its file, into `folder` or none. One
 * file in opens it; several stay where they were and say how many went in. Those that could not
 * be are listed under that line with why, and the rest go in anyway.
 */
export function useImportNotes(): {
  importFiles: (files: readonly File[], folder: NoteFolderResponse | null) => Promise<void>
  said: ReactNode
} {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [toast, setToast] = useState<{ line: string; lines: string[] } | null>(null)

  const importFiles = async (files: readonly File[], folder: NoteFolderResponse | null) => {
    if (files.length === 0) return
    if (!files.some((f) => isMarkdownFile(f.name))) {
      setToast({ line: 'Only .md files', lines: [] })
      return
    }
    const made: string[] = []
    const refused: string[] = []
    // One at a time, so the notes come in the order the files were picked.
    for (const file of files) {
      const note = noteFromFile(file.name, await file.arrayBuffer())
      if (!note.ok) {
        refused.push(note.why)
        continue
      }
      try {
        const saved = await createNote({
          title: note.title,
          body: note.body,
          folderId: folder?.id ?? null,
        })
        made.push(saved.id)
      } catch {
        refused.push(`${file.name} couldn't be saved. Try again.`)
      }
    }
    if (made.length > 0) {
      await Promise.all([
        qc.invalidateQueries({ queryKey: noteKeys.list }),
        qc.invalidateQueries({ queryKey: noteKeys.folders }),
      ])
    }
    if (made.length === 1 && refused.length === 0) {
      navigate(`/${NOTES_ID}/${made[0]}`)
      return
    }
    setToast({ line: importedLine(made.length, folder?.name ?? null), lines: refused })
  }

  const said = toast && (
    <Toast lines={toast.lines} onGone={() => setToast(null)}>
      {toast.line}
    </Toast>
  )
  return { importFiles, said }
}

/** The files a drag carries, if it carries any: a note dragged in the sidebar carries none. */
export const carriesFiles = (e: { dataTransfer: DataTransfer | null }): boolean =>
  e.dataTransfer?.types.includes('Files') ?? false
