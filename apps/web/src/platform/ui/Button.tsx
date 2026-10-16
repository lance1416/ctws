import type { ComponentProps } from 'react'
import { BUTTON } from './buttonStyles'

/**
 * A button in one of the app's tones (`BUTTON`). It is `type="button"` unless told it submits, so
 * a press inside a form never sends the form by accident. `className` adds placement, not looks.
 */
export function Button({
  look,
  className,
  type = 'button',
  ...props
}: ComponentProps<'button'> & { look: keyof typeof BUTTON }) {
  return (
    <button
      type={type}
      className={className ? `${className} ${BUTTON[look]}` : BUTTON[look]}
      {...props}
    />
  )
}
