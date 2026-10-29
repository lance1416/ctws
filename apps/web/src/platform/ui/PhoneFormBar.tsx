import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BUTTON, GATED } from './buttonStyles'

/**
 * How far the visible part of the page has moved down from the layout's top. iOS Safari brings
 * the keyboard up by moving what is seen, not by making the layout shorter, so a bar fixed at the
 * layout's top is carried off the screen (BUG-086); held this far down, it stays in sight.
 */
function useVisibleTop(): number {
  const [top, setTop] = useState(0)
  useEffect(() => {
    const seen = window.visualViewport
    if (!seen) return
    const follow = () => setTop(Math.max(0, seen.offsetTop))
    follow()
    seen.addEventListener('resize', follow)
    seen.addEventListener('scroll', follow)
    return () => {
      seen.removeEventListener('resize', follow)
      seen.removeEventListener('scroll', follow)
    }
  }, [])
  return top
}

/**
 * A FORM'S BAR ON A PHONE (DES-001 "表单"): Cancel on the left, the form's name, its press on the
 * right, held at the top of the screen so it is still there with the keyboard up. Put inside the
 * form: the press is its submit. The page and a dialog make room for it (`data-phone-form-bar`).
 */
export function PhoneFormBar({
  title,
  submit,
  disabled = false,
  why,
  cancelTo,
  onCancel,
}: {
  title: string
  submit: string
  disabled?: boolean
  /** Why the press is greyed, said when it is tapped (offline); it does nothing meanwhile. */
  why?: string | undefined
  /** Where Cancel goes, a page's way back; or `onCancel`, a dialog's. */
  cancelTo?: string
  onCancel?: () => void
}) {
  const top = useVisibleTop()
  // Its words at the bar's 16, the press at the other 16 (DES-001 "表单页").
  const cancel = '-ml-2 flex min-h-11 items-center px-2 text-prose text-muted'
  let back: ReactNode = null
  if (cancelTo)
    back = (
      <Link to={cancelTo} className={cancel}>
        Cancel
      </Link>
    )
  else if (onCancel)
    back = (
      <button type="button" onClick={onCancel} className={cancel}>
        Cancel
      </button>
    )
  return (
    <div
      data-phone-form-bar
      style={top ? { transform: `translateY(${top}px)` } : undefined}
      className="fixed inset-x-0 top-0 z-30 flex min-h-14 items-center gap-2 border-b border-line bg-chrome px-4 pt-[env(safe-area-inset-top)] lg:hidden"
    >
      {back}
      {/* The page's name on a phone, where its own head stands down (styles.css). */}
      <h1 className="min-w-0 flex-1 truncate text-center text-ui font-medium text-ink">{title}</h1>
      <button
        type="submit"
        disabled={disabled && !why}
        {...(why ? { 'aria-disabled': true, title: why } : {})}
        onClick={(e) => {
          if (why) e.preventDefault()
        }}
        className={`${BUTTON.primary} ${GATED}`}
      >
        {submit}
      </button>
    </div>
  )
}
