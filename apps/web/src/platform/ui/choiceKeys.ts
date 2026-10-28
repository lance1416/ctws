import type { KeyboardEvent } from 'react'

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

/**
 * A group of choices as DES-001 section 4 has them: one Tab stop, the chosen one's (give each
 * `tabIndex={chosen ? 0 : -1}`); the arrows move to the next and choose it there and then. Give
 * it to the group's `onKeyDown`: `radioKeys` for a radiogroup, `tabKeys` for a tablist.
 */
const stepKeys = (role: 'radio' | 'tab') => (e: KeyboardEvent<HTMLElement>) => {
  const step = STEP[e.key]
  if (step === undefined) return
  const radios = [...e.currentTarget.querySelectorAll<HTMLElement>(`[role="${role}"]`)].filter(
    (r) => !r.hasAttribute('disabled') && r.getAttribute('aria-disabled') !== 'true',
  )
  const at = radios.indexOf(document.activeElement as HTMLElement)
  if (at < 0) return
  e.preventDefault()
  const next = radios[(at + step + radios.length) % radios.length]!
  next.focus()
  next.click()
}

export const radioKeys = stepKeys('radio')
export const tabKeys = stepKeys('tab')
