import { problemText } from '../../../platform/http/api'
import { useMutation } from '@tanstack/react-query'
import { createReadingItem, readingKeys } from '../api'
import { isReadingUrl } from '../logic/readingUrl'
import { useLineEntry } from '../../../platform/ui/useLineEntry'
import { textbox } from '../../../platform/ui/formStyles'

/**
 * One input for both kinds: a url becomes a link, anything else a book, and the field says which
 * before Enter is pressed.
 */
export function AddReading() {
  const line = useLineEntry()
  const trimmed = line.value.trim()
  const isLink = isReadingUrl(trimmed)

  const send = line.sends((text) =>
    createReadingItem(
      isReadingUrl(text) ? { kind: 'link', url: text } : { kind: 'book', title: text },
    ),
  )
  const add = useMutation({
    mutationFn: send,
    meta: { changes: ['reading'], awaits: [readingKeys.all], ownsError: true },
  })

  return (
    <div>
      <input
        {...line.field({ onSubmit: add.mutate, busy: add.isPending })}
        placeholder="Paste a link, or type a book title"
        aria-label="Add to the reading list"
        className={`w-full bg-sheet ${textbox}`}
      />
      {trimmed !== '' && (
        <p className="mt-1 text-xs text-ink-subtle">
          {isLink ? 'Enter saves it as a link' : 'Enter saves it as a book'}
        </p>
      )}
      {add.isError && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {problemText(add.error) ?? "Couldn't add that"}
        </p>
      )}
    </div>
  )
}
