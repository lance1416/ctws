import { useRef } from 'react'

/**
 * Enter that commits IME text is not a submit. Safari fires `compositionend` before that Enter's
 * keydown, so `isComposing` alone fails; the tracked flag clears one task later, after both.
 */
export function useComposing() {
  const composing = useRef(false)

  const bind = {
    onCompositionStart: () => {
      composing.current = true
    },
    onCompositionEnd: () => {
      setTimeout(() => {
        composing.current = false
      }, 0)
    },
  }

  /** True while the key belongs to the IME rather than to the app. */
  const composingNow = (e: { nativeEvent: { isComposing?: boolean } }) =>
    composing.current || e.nativeEvent.isComposing === true

  return { bind, composingNow }
}
