import { useEffect, useState } from 'react'
import { BottomSheet } from './BottomSheet'
import { usePhone } from './phone'

/**
 * On a phone a finger has no hover to read the `title` a greyed button carries, so a tap on one
 * says it in a sheet. Any button that is `aria-disabled` and has a `title` takes part; mount once.
 */
export function WhyGreyed() {
  const phone = usePhone()
  const [why, setWhy] = useState<string | null>(null)
  useEffect(() => {
    if (!phone) return
    const tap = (e: MouseEvent) => {
      const greyed = (e.target as Element | null)?.closest?.('[aria-disabled="true"][title]')
      const title = greyed?.getAttribute('title')
      if (!title) return
      e.preventDefault()
      setWhy(title)
    }
    document.addEventListener('click', tap, true)
    return () => document.removeEventListener('click', tap, true)
  }, [phone])
  if (!phone || !why) return null
  return (
    <BottomSheet title="Not now" onClose={() => setWhy(null)}>
      <p className="px-4 pt-1 pb-6 text-prose text-ink">{why}</p>
    </BottomSheet>
  )
}
