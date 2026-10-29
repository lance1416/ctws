import { Children, useRef, useState, type ReactNode } from 'react'
import { usePhone } from './phone'

/** Each action uncovered, 84 across (artboard 25). */
const ACTION_PX = 84

/**
 * A ROW THAT SWIPES LEFT ON A PHONE (DES-001 "只有悬停才出现的东西"): what the desk shows on hover
 * (a row's ×) is under the row, uncovered by a swipe. The swipe is only a shortcut: the actions
 * are reached as they are by a screen reader and a keyboard, and reaching one slides the row open.
 * From 1024 up it is the row alone.
 */
export function SwipeRow({ actions, children }: { actions: ReactNode; children: ReactNode }) {
  const phone = usePhone()
  const [open, setOpen] = useState(false)
  const [dx, setDx] = useState<number | null>(null)
  const start = useRef<{ x: number; y: number; sideways: boolean | null } | null>(null)
  const count = Children.toArray(actions).length
  if (!phone || count === 0) return <>{children}</>
  const width = count * ACTION_PX
  const rest = open ? -width : 0
  const x = dx ?? rest
  return (
    <div className="relative overflow-hidden">
      <div
        style={{
          transform: `translateX(${x}px)`,
          transitionDuration: dx === null ? '150ms' : '0ms',
        }}
        className="relative z-10 touch-pan-y bg-panel transition-transform"
        onPointerDown={(e) => {
          start.current = { x: e.clientX, y: e.clientY, sideways: null }
        }}
        onPointerMove={(e) => {
          const s = start.current
          if (!s) return
          const mx = e.clientX - s.x
          if (s.sideways === null && Math.hypot(mx, e.clientY - s.y) > 8) {
            s.sideways = Math.abs(mx) > Math.abs(e.clientY - s.y)
            if (s.sideways) e.currentTarget.setPointerCapture(e.pointerId)
          }
          if (s.sideways) setDx(Math.max(-width - 24, Math.min(0, rest + mx)))
        }}
        onPointerUp={() => {
          const moved = start.current?.sideways && dx !== null
          start.current = null
          if (moved) setOpen(dx! < -width / 3)
          setDx(null)
        }}
        onClickCapture={(e) => {
          if (dx !== null) e.stopPropagation()
        }}
      >
        {children}
      </div>
      <div
        className="absolute inset-y-0 right-0 flex"
        onFocus={() => setOpen(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
        }}
      >
        {actions}
      </div>
    </div>
  )
}
