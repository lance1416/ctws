import { useEffect, useRef, useState } from 'react'

const PAUSE_MS = 1000

/**
 * Saves a note a second after typing stops, and at once on `flush`. One save runs at a time and the
 * latest text wins; text whose save failed is kept and tried again.
 */
export function createNoteAutosave(
  save: (text: string) => Promise<unknown>,
  /** Told after every save whether it failed, so the page can say so. */
  onFailed: (failed: boolean) => void = () => {},
) {
  let pending: string | null = null
  let saved: string | null = null
  let inFlight: Promise<void> | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const run = async (): Promise<void> => {
    if (inFlight) {
      await inFlight
      return run()
    }
    const text = pending
    if (text === null || text === saved) return
    pending = null
    inFlight = save(text).then(
      () => {
        saved = text
        onFailed(false)
      },
      () => {
        // Kept for the next pause or the close, unless newer text has arrived since.
        if (pending === null) pending = text
        onFailed(true)
      },
    )
    await inFlight
    inFlight = null
    if (pending !== null && pending !== text) return run()
  }

  return {
    change(text: string) {
      pending = text
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void run(), PAUSE_MS)
    },
    async flush() {
      if (timer) clearTimeout(timer)
      timer = null
      await run()
    },
  }
}

/**
 * `createNoteAutosave` for a component: the latest `save` is used, unmounting flushes, and
 * `failed` says whether the last save was refused.
 */
export function useNoteAutosave(save: (text: string) => Promise<unknown>) {
  const latest = useRef(save)
  latest.current = save
  const [failed, setFailed] = useState(false)
  const [notes] = useState(() => createNoteAutosave((text) => latest.current(text), setFailed))
  useEffect(() => () => void notes.flush(), [notes])
  return { ...notes, failed }
}
