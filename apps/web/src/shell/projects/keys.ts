import type { KeyTable } from '../../platform/keyboard/keyTable'

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const
type Digit = (typeof DIGITS)[number]
type OpenDigit = `open${Digit}`
type ProjectAction = 'switchView' | OpenDigit

/** Each digit key, to the action that opens what is numbered with it. */
const digitPresses = Object.fromEntries(DIGITS.map((d) => [d, `open${d}` as const])) as Record<
  Digit,
  OpenDigit
>

/** A handler for each digit, from what opens the resource pinned at a digit. */
export const digitHandlers = (open: (digit: number) => void) =>
  Object.fromEntries(DIGITS.map((d) => [`open${d}` as const, () => open(Number(d))]))

/** On a project's page (FR-053, artboard 24). */
export const PROJECT_KEYS: KeyTable<ProjectAction> = {
  title: 'On a project',
  rows: [
    {
      keys: '1–9',
      does: 'Open a pinned resource',
      presses: digitPresses,
    },
    { keys: 'B', does: 'Switch between tree and board', presses: { b: 'switchView' } },
  ],
}

/** The launcher's cells for links: two rows of four, the last cell pinning another. */
export const LAUNCHER_LINKS = 7

/** On the workbench (FR-076, artboard 24): the launcher's links, by the digit on each. */
export const WORKBENCH_KEYS: KeyTable<OpenDigit> = {
  title: 'On the Workbench',
  rows: [
    {
      keys: `1–${LAUNCHER_LINKS}`,
      does: 'Open a launcher link',
      presses: Object.fromEntries(
        DIGITS.slice(0, LAUNCHER_LINKS).map((d) => [d, digitPresses[d]]),
      ) as Partial<Record<Digit, OpenDigit>>,
    },
  ],
}
