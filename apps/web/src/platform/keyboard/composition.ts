import { useRef } from 'react'

/**
 * ENTER WHILE AN IME IS COMPOSING IS NOT A SUBMIT.
 *
 * Typing English inside a Chinese IME and pressing Enter is how a lot of people type English --
 * the Enter commits the letters out of the candidate buffer. It must not also file the task,
 * save the person or close the editor, and it did.
 *
 * `KeyboardEvent.isComposing` is the standard signal and is not enough on its own: in Safari (and
 * so on most Macs) `compositionend` is dispatched BEFORE the `keydown` for the very Enter that
 * ended it, so by the time the handler runs the flag has already gone false. Chrome dispatches
 * them the other way round. Checking the flag alone works in one browser and not the other.
 *
 * So the composition is tracked here as well, and the tracked flag is cleared one TASK late. The
 * whole compositionend-plus-keydown sequence is dispatched inside a single input task, so a
 * timeout of zero lands after it: the Enter that committed the text still sees a composition in
 * progress, and an Enter pressed afterwards -- a separate task -- does not.
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
