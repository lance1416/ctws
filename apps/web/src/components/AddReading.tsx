import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { createReadingItem } from '../api/reading'
import { isReadingUrl } from '../readingUrl'
import { useComposing } from '../composition'

/**
 * ONE INPUT, both kinds.
 *
 * Paste a url and it is a link; type anything else and it is a book. The person already knows
 * which one they are adding, so a 「链接 / 书」 toggle would be asking them to say it twice --
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
        placeholder="粘个链接，或者写本书名"
        aria-label="加到待读"
        className="h-9 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-muted"
      />
      {/* Said BEFORE Enter, not after: this is the one place the link/book rule is visible, and a
          rule you can see is one you can work with. */}
      {trimmed !== '' && (
        <p className="mt-1 text-xs text-fg-subtle">{isLink ? '按回车存为链接' : '按回车存为书'}</p>
      )}
      {add.isError && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {add.error instanceof Error ? add.error.message : '没能加进来'}
        </p>
      )}
    </div>
  )
}
