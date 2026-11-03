/**
 * Which hand moved last, on the root as `data-input="keyboard" | "pointer"`. A menu moves focus to
 * the row under the pointer, and the browser counts that focus as one to ring; the stylesheet
 * reads this to ring a menu's rows only when the keys are moving through them.
 */
export function watchInputModality(root: HTMLElement = document.documentElement): void {
  const set = (input: 'keyboard' | 'pointer') => () => {
    if (root.dataset.input !== input) root.dataset.input = input
  }
  window.addEventListener('keydown', set('keyboard'), true)
  window.addEventListener('pointerdown', set('pointer'), true)
  window.addEventListener('pointermove', set('pointer'), true)
}
