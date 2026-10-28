import type { KeyboardEvent } from 'react'

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

/**
 * A group of button radios, as a radiogroup is used (DES-001 section 4): one Tab stop, the checked
 * one's (give each radio `tabIndex={checked ? 0 : -1}`); the arrows move to the next and pick it
 * there and then. Give it to the group's `onKeyDown`.
 */
export function radioKeys(e: KeyboardEvent<HTMLElement>) {
  const step = STEP[e.key]
  if (step === undefined) return
  const radios = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')].filter(
    (r) => !r.hasAttribute('disabled') && r.getAttribute('aria-disabled') !== 'true',
  )
  const at = radios.indexOf(document.activeElement as HTMLElement)
  if (at < 0) return
  e.preventDefault()
  const next = radios[(at + step + radios.length) % radios.length]!
  next.focus()
  next.click()
}
