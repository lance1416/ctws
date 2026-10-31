import { useEffect, useEffectEvent } from 'react'
import { useShortcutsEnabled } from './enabled'
import { isTypingTarget } from './keys'
import { isOverlayOpen } from './overlayState'

/**
 * A key table: each row is one line of the keyboard help, the presses that do it, and the action
 * each runs. A handler for the action is bound where the action can run; the help reads the same
 * rows. A press is written `x`, `?`, `Enter`, `Shift+Enter`, `Alt+ArrowUp`: modifiers in the order
 * Ctrl, Meta, Alt, Shift, and a character never names Shift, which is already in it.
 */
type KeyRow<A extends string = string> = {
  /** How the help writes the keys. */
  keys: string
  /** What the help says they do. */
  does: string
  /** The key this replaced in the redesign (FR-029), shown for the first release after it. */
  was?: string
  /** Each press and its action. Empty for a key told here but handled by the browser or a layer. */
  presses: Partial<Record<string, A>>
}

export type KeyTable<A extends string = string> = {
  /** Where the keys work: the help's heading for them. */
  title: string
  rows: readonly KeyRow<A>[]
}

/** The fields of a key event a press is read from. */
type KeyLike = Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>

/** The event as a table writes it. */
export function pressOf(e: KeyLike): string {
  const held = [
    e.ctrlKey && 'Ctrl',
    e.metaKey && 'Meta',
    e.altKey && 'Alt',
    e.shiftKey && [...e.key].length > 1 && 'Shift',
  ].filter((m) => m !== false)
  return [...held, e.key].join('+')
}

type Modifier = 'Ctrl' | 'Meta' | 'Alt' | 'Shift'
const MODIFIERS: readonly Modifier[] = ['Ctrl', 'Meta', 'Alt', 'Shift']

/**
 * Every press of a named key with `held` down and any of `either` too or not, each giving `action`:
 * for a key whose meaning does not change with the extra modifiers.
 */
export function pressesWith<A extends string>(
  key: string,
  action: A,
  { held = [], either }: { held?: readonly Modifier[]; either: readonly Modifier[] },
): Record<string, A> {
  let sets: Modifier[][] = [[...held]]
  for (const m of either) sets = sets.flatMap((set) => [set, [...set, m]])
  const presses = sets.map((set) => [...MODIFIERS.filter((m) => set.includes(m)), key].join('+'))
  return Object.fromEntries(presses.map((p) => [p, action]))
}

/** A character with nothing held: the kind of key the off switch silences. */
export const isSingleKey = (press: string): boolean => [...press].length === 1

/** The action the table gives a press, the first row's that names it. */
export function actionOf<A extends string>(table: KeyTable<A>, press: string): A | null {
  for (const row of table.rows) {
    const action = row.presses[press]
    if (action) return action
  }
  return null
}

/** Every single key the tables answer, once each, in table order. */
export function singleKeysOf(tables: readonly KeyTable[]): string[] {
  const presses = tables.flatMap((t) => t.rows.flatMap((r) => Object.keys(r.presses)))
  return [...new Set(presses.filter(isSingleKey))]
}

/** What runs an action. Returning false declines the press, which then keeps its default. */
export type Handlers<A extends string, E> = Partial<Record<A, (e: E) => void | false>>

/** Runs the press's action if this table has one and a handler is bound; true when it ran. */
function run<A extends string, E extends KeyLike & { preventDefault: () => void }>(
  table: KeyTable<A>,
  handlers: Handlers<A, E>,
  e: E,
): boolean {
  const action = actionOf(table, pressOf(e))
  const handler = action ? handlers[action] : undefined
  if (!handler || handler(e) === false) return false
  e.preventDefault()
  return true
}

/**
 * A key handler for one element, from its table, taking the actions' handlers per event (a row's
 * depend on the row). Single keys answer only while the off switch is on; arrows, Enter and the
 * modified presses always do.
 */
export function useKeyTable<A extends string>(
  table: KeyTable<A>,
): <E extends KeyLike & { preventDefault: () => void }>(e: E, handlers: Handlers<A, E>) => void {
  const singleKeys = useShortcutsEnabled()
  return (e, handlers) => {
    if (!singleKeys && isSingleKey(pressOf(e))) return
    run(table, handlers, e)
  }
}

/**
 * The page-wide keys of a table, bound while the caller is mounted. Every press stands down while
 * an overlay is open. A SINGLE KEY (`c`, `?`, `[`) also obeys the off switch and never fires while
 * typing; a press with a modifier (Ctrl K) is a command and works from inside a field too.
 * `claim` sees a single key that passed before any other listener does, and a press it claims goes
 * no further; `skipped` hears a single key that did not pass.
 */
export function useDocumentKeys<A extends string>(
  table: KeyTable<A>,
  handlers: Handlers<A, KeyboardEvent>,
  { claim, skipped }: { claim?: (e: KeyboardEvent) => boolean; skipped?: () => void } = {},
): void {
  const enabled = useShortcutsEnabled()
  /** null when the press may run; otherwise why it may not. */
  const heldBack = (e: KeyboardEvent): 'overlay' | 'single' | null => {
    if (isOverlayOpen()) return 'overlay'
    if (!isSingleKey(pressOf(e))) return null
    return !enabled || isTypingTarget(e.target) ? 'single' : null
  }
  // In the capture phase: the other page-wide keys and the page's own handlers come after it.
  const onClaim = useEffectEvent((e: KeyboardEvent) => {
    if (heldBack(e) === null && isSingleKey(pressOf(e)) && claim?.(e)) e.stopPropagation()
  })
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    // Answered already where it was pressed (the editor's Ctrl Shift K reads as Ctrl K here).
    if (e.defaultPrevented) return
    if (heldBack(e) !== null) {
      skipped?.()
      return
    }
    run(table, handlers, e)
  })
  useEffect(() => {
    document.addEventListener('keydown', onClaim, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onClaim, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [])
}
