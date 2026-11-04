import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { isTypingTarget } from '../keyboard/keys'
import { Toast } from './Toast'

/** A write done and how to take it back: "Done", and the write that restores what was. */
export type Undoable = { said: string; undo: () => Promise<unknown> }

type Say = {
  /** The write went through: say so, and offer to take it back. */
  offer: (done: Undoable) => void
  /**
   * The write failed and the page is as it was. A refusal says why and is final; anything else
   * offers to try again.
   */
  failed: (retry: () => void, refused?: string | null) => void
}

const UndoContext = createContext<Say | null>(null)

/**
 * The foot of the window for writes that answer before the server does: "Done. Undo" after one
 * that can be taken back, "Couldn't save. Try again" after one that failed. Only the last write
 * can be undone, by its Undo or by Ctrl Z while the line shows and nothing is being typed in.
 */
export function UndoProvider({ children }: { children: ReactNode }) {
  type Shown =
    | { kind: 'done'; said: string; undo: () => Promise<unknown>; n: number }
    | { kind: 'failed'; retry: () => void; refused: string | null; n: number }
  const [shown, setShown] = useState<Shown | null>(null)
  // Taken once: a second Undo, or Ctrl Z after it, finds nothing.
  const pending = useRef<Undoable | null>(null)
  // Each line its own, so a second "Done" starts its own few seconds.
  const count = useRef(0)
  const say = useMemo<Say & { takeBack: () => void }>(() => {
    const failed = (retry: () => void, refused?: string | null) => {
      pending.current = null
      setShown({ kind: 'failed', retry, refused: refused ?? null, n: ++count.current })
    }
    const takeBack = () => {
      const last = pending.current
      if (!last) return
      pending.current = null
      setShown(null)
      void last.undo().catch(() =>
        failed(() => {
          pending.current = last
          takeBack()
        }),
      )
    }
    const offer = (done: Undoable) => {
      pending.current = done
      setShown({ kind: 'done', ...done, n: ++count.current })
    }
    return { offer, failed, takeBack }
  }, [])
  const { takeBack } = say

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const undoKey =
        (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z'
      // In a field or the editor, Ctrl Z is theirs; vim's too.
      if (!undoKey || e.defaultPrevented || isTypingTarget(e.target) || !pending.current) return
      e.preventDefault()
      takeBack()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [takeBack])

  // Stable, so the line's few seconds are not started again by a render.
  const gone = useCallback(() => {
    pending.current = null
    setShown(null)
  }, [])
  return (
    <UndoContext.Provider value={say}>
      {children}
      {shown?.kind === 'done' && (
        <Toast key={shown.n} onGone={gone} action={{ label: 'Undo', onPress: takeBack }}>
          {shown.said}
        </Toast>
      )}
      {shown?.kind === 'failed' &&
        (shown.refused ? (
          <Toast key={shown.n} onGone={gone}>
            {shown.refused}
          </Toast>
        ) : (
          <Toast
            key={shown.n}
            onGone={gone}
            action={{
              label: 'Retry',
              onPress: () => {
                setShown(null)
                shown.retry()
              },
            }}
          >
            Couldn’t save. Try again
          </Toast>
        ))}
    </UndoContext.Provider>
  )
}

/** The foot's line for this page's writes; outside the provider (a test), a no-op. */
export function useUndo(): Say {
  return useContext(UndoContext) ?? { offer: () => {}, failed: () => {} }
}
