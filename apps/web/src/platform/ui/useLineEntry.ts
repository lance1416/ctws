import { useState, type ChangeEvent } from 'react'
import { useComposing } from '../keyboard/composition'
import { inlineEditProps } from './useInlineEdit'

/**
 * A one-line box that sends what is typed on Enter, for adding things one after another. Enter
 * does nothing while an IME composes or while the last line is still out, and an empty box is
 * not sent. The box empties once the server has the line, not once the list is read again, and
 * only if it still holds that line: whatever was typed since is the next one.
 */
export function useLineEntry() {
  const composing = useComposing()
  const [value, setValue] = useState('')

  /** The server has `line`: the box is ready for the next. */
  const sent = (line: string) => setValue((now) => (now.trim() === line ? '' : now))

  return {
    value,
    setValue,
    sent,
    /**
     * Wraps the write that sends a line, so the box empties the moment it resolves. Made before
     * `useMutation`: inside its options the result's type would not reach `onSuccess`.
     */
    sends:
      <T>(write: (line: string) => Promise<T>) =>
      async (line: string): Promise<T> => {
        const made = await write(line)
        sent(line)
        return made
      },
    /** The box's props. `onEmpty` is Enter on an empty box; `onCancel` is Escape. */
    field: ({
      onSubmit,
      busy = false,
      onEmpty,
      onCancel,
    }: {
      onSubmit: (line: string) => void
      busy?: boolean
      onEmpty?: () => void
      onCancel?: () => void
    }) => ({
      value,
      onChange: (e: ChangeEvent<HTMLInputElement>) => setValue(e.target.value),
      ...inlineEditProps(composing, {
        onCommit: () => {
          const line = value.trim()
          if (!line) onEmpty?.()
          else if (!busy) onSubmit(line)
        },
        ...(onCancel ? { onCancel } : {}),
      }),
    }),
  }
}
