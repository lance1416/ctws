import type { ObjectType } from '@ctws/contracts'
import { useNavigate, useParams } from 'react-router-dom'
import { useForgetWhenGone } from '../search/recent'

/**
 * THE ITEM AN ADDRESS OPENS over its list (`<base>/<id>`). The list stays behind, so its filters
 * and scroll survive a look at one item, and the address is the only state: Back, Forward and
 * reload need nothing more.
 *
 * Looked up in the list rather than held, so the pane follows the list's refetches. Gone once the
 * list has loaded without it; then Recent forgets it too.
 */
export function useOpenFromUrl<T>({
  list,
  idOf,
  type,
  base,
}: {
  list: { data?: readonly T[] | undefined; isSuccess: boolean }
  idOf: (item: T) => string
  type: ObjectType
  base: string
}) {
  const { id: openId = null } = useParams()
  const navigate = useNavigate()
  const open =
    openId === null ? null : (list.data?.find((item) => idOf(item) === openId) ?? null)
  const gone = openId !== null && list.isSuccess && open === null
  useForgetWhenGone(type, openId, gone)
  return {
    openId,
    open,
    gone,
    show: (id: string) => navigate(`${base}/${id}`),
    close: () => navigate(base),
  }
}
