import type { ObjectType } from '@ctws/contracts'
import { useNavigate, useParams } from 'react-router-dom'
import { useForgetWhenGone } from '../search/recent'

/**
 * The item `<base>/<id>` opens over its list, which keeps its filters and scroll behind it. Looked
 * up in the list rather than held, so the pane follows the list's refetches.
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
  const open = openId === null ? null : (list.data?.find((item) => idOf(item) === openId) ?? null)
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
