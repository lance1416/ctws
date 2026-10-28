import { useSearchParams } from 'react-router-dom'

type View = { id: string; label: string }

/**
 * Which of a page's views is showing, kept in `?view=` so a reload or a link keeps it. The first
 * view is the default and leaves the URL bare; an unknown value reads as the default.
 */
export function useViewParam(views: readonly View[]): [string, (id: string) => void] {
  const [params, setParams] = useSearchParams()
  const fallback = views[0]?.id ?? ''
  const current = views.find((v) => v.id === params.get('view'))?.id ?? fallback
  const pick = (id: string) => {
    const next = new URLSearchParams(params)
    if (id === fallback) next.delete('view')
    else next.set('view', id)
    setParams(next, { replace: true })
  }
  return [current, pick]
}
