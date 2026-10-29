import { createContext, useEffect, useState } from 'react'

/**
 * Below this width the app wears the phone's frame (DES-001 "宽度和断点"): five tabs at the foot,
 * one column, a title bar a page. A tablet from 768 too, on purpose. Tailwind's `lg` is the same
 * line, so `max-lg:` and this agree.
 */
const PHONE_QUERY = '(max-width: 1023px)'

export function usePhone(): boolean {
  const [phone, setPhone] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY)
    const onChange = () => setPhone(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return phone
}

/**
 * Inside a phone's sheet over the whole screen (the inspector on a phone): its bar closes it and
 * there is no fuller page to open, so what draws its own close or "Open full page" leaves them out.
 */
export const InSheet = createContext(false)
