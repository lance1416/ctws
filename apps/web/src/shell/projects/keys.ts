import type { KeyTable } from '../../platform/keyboard/keyTable'

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const
type Digit = (typeof DIGITS)[number]
type ProjectAction = 'switchView' | `open${Digit}`

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
      presses: Object.fromEntries(DIGITS.map((d) => [d, `open${d}` as const])),
    },
    { keys: 'B', does: 'Switch between tree and board', presses: { b: 'switchView' } },
  ],
}
