import { problemText } from '../../../platform/http/api'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { createReadingItem } from '../api'
import { isReadingUrl } from '../logic/readingUrl'
import { useComposing } from '../../../platform/keyboard/composition'
import { textbox } from '../../../platform/ui/formStyles'

/**
 * One input for both kinds: a url becomes a link, anything else a book, and the field says which
 * before Enter is pressed.
 */
export function AddReading() {
  const composing = useComposing()
  const [line, setLine] = useState('')
  const trimmed = line.trim()
  const isLink = isReadingUrl(trimmed)

  const add = useMutation({
    mutationFn: async (value: string) => {
      const made = await createReadingItem(
        isReadingUrl(value) ? { kind: 'link', url: value } : { kind: 'book', title: value },
      )
      // Emptied once the server has it, not after the list is read again: what is typed in the
      // meantime is the next one.
      setLine('')
      return made
    },
    meta: { awaits: [['reading']] },
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
