import { useEffect, useState } from 'react'

/** Long enough that typing a word does not fire a request per letter, short enough to feel live. */
const TYPING_PAUSE_MS = 150

/** `value` once it has held still for `ms`: what a box asks the server for while typing goes on. */
export function useDebouncedValue<T>(value: T, ms = TYPING_PAUSE_MS): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return settled
}
