import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { createReadingItem } from '../api/reading'
import { isReadingUrl } from '../readingUrl'
import { useComposing } from '../composition'
import { textbox } from './formStyles'

/**
 * ONE INPUT, both kinds.
 *
 * Paste a url and it is a link; type anything else and it is a book. The person already knows
 * which one they are adding, so a Link / Book toggle would be asking them to say it twice --
 * and the rule is visible in the field itself, which says what will happen before Enter is
 * pressed. Everything else about the item (title, project, author) is edited on the row.
 */
export function AddReading({ projectId }: { projectId?: string } = {}) {
  const qc = useQueryClient()
  const composing = useComposing()
  const [line, setLine] = useState('')
  const trimmed = line.trim()
  const isLink = isReadingUrl(trimmed)

  const add = useMutation({
    mutationFn: (value: string) =>
      createReadingItem(
        isReadingUrl(value)
          ? { kind: 'link', url: value, ...(projectId ? { projectId } : {}) }
          : { kind: 'book', title: value, ...(projectId ? { projectId } : {}) },
      ),
    onSuccess: async () => {
      setLine('')
      await qc.invalidateQueries({ queryKey: ['reading'] })
    },
  })

  return (
    <div>
      <input
        value={line}
        onChange={(e) => setLine(e.target.value)}
        {...composing.bind}
        onKeyDown={(e) => {
          // isComposing: Enter confirms an IME candidate, it must not submit half a word.
          if (e.key !== 'Enter' || composing.composingNow(e)) return
          if (trimmed === '' || add.isPending) return
          add.mutate(trimmed)
        }}
        placeholder="Paste a link, or type a book title"
        aria-label="Add to the reading list"
        className={`w-full bg-sheet ${textbox}`}
      />
      {/* Said BEFORE Enter, not after: this is the one place the link/book rule is visible, and a
          rule you can see is one you can work with. */}
      {trimmed !== '' && (
        <p className="mt-1 text-xs text-ink-subtle">
          {isLink ? 'Enter saves it as a link' : 'Enter saves it as a book'}
        </p>
      )}
      {add.isError && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {add.error instanceof Error ? add.error.message : "Couldn't add that"}
        </p>
      )}
    </div>
  )
}
