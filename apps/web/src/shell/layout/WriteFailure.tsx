import { useLocation } from 'react-router-dom'
import { useWriteFailure } from '../../platform/http/writeFailure'
import { LAYER } from '../../platform/ui/layers'

/**
 * A write that failed where nothing on the page says so, said under the header's end. It stays
 * until the next write starts, and belongs to the page it failed on.
 */
export function WriteFailure() {
  const { pathname } = useLocation()
  const failure = useWriteFailure(pathname)
  if (!failure) return null
  return (
    <p
      role="alert"
      className={`absolute top-full right-0 ${LAYER.cover} mt-1 w-max max-w-[20rem] rounded-block bg-float px-3 py-1.5 text-ui text-stop-t shadow-float`}
    >
      {failure}
    </p>
  )
}
