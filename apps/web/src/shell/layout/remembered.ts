import { useState } from 'react'

/**
 * A yes-or-no the frame remembers per browser (the sidebar open, the icon bar expanded). Every
 * access is wrapped: `localStorage` throws in a private window or with site data blocked, and then
 * the choice lasts for this page only.
 */
export function useRemembered(
  key: string,
  fallback: () => boolean,
): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(key)
      if (saved === '1' || saved === '0') return saved === '1'
    } catch {
      // Not readable: fall through to the default.
    }
    return fallback()
  })
  return [
    value,
    (next) => {
      setValue(next)
      try {
        localStorage.setItem(key, next ? '1' : '0')
      } catch {
        // Not remembered across reloads; this page still honours it.
      }
    },
  ]
}
