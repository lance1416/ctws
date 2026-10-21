import { api, type ObjectType } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ApiError, call } from '../../platform/http/api'
import { BUTTON } from '../../platform/ui/buttonStyles'
import { RemoveIcon } from '../../platform/ui/icons'
import { monthDay } from '../../platform/time/dates'
import { useTimeZone } from '../auth/useMe'
import { ymd } from '../../platform/time/dates'
import { useRegistry } from '../registry'
import { KIND_WORDS } from '../search/view'

/**
 * SOMETHING THAT NO LONGER EXISTS (FR-032, FR-035): an old address says when it was deleted and
 * where it was, read from what the deletion left, and offers the way to what held it.
 */
export function DeletedNotice({ type, id }: { type: ObjectType; id: string }) {
  const zone = useTimeZone()
  const navigate = useNavigate()
  const registry = useRegistry()
  const stone = useQuery({
    queryKey: ['tombstones', type, id],
    queryFn: ({ signal }) => call(api.tombstones.get, { params: { type, id } }, { signal }),
    retry: false,
  })
  const kind = KIND_WORDS[type].one.toLocaleLowerCase()
  if (stone.isPending) return null
  if (stone.isError) {
    const notFound = stone.error instanceof ApiError && stone.error.status === 404
    return (
      <p role="alert" className="mt-4 text-ui text-muted">
        {notFound
          ? `This ${kind} is not here any more.`
          : `Couldn’t find out what happened to this ${kind}.`}
      </p>
    )
  }
  const { title, deletedAt, place } = stone.data
  const parent =
    place.parentType && place.parentId
      ? {
          to: registry.relationFor(place.parentType).to(place.parentId),
          name: place.path.at(-1) ?? KIND_WORDS[place.parentType].one,
        }
      : place.projectId
        ? { to: `/projects/${place.projectId}`, name: place.projectName ?? 'its project' }
        : null
  const where = [place.projectName, ...place.path].filter(Boolean).join(' / ')
  return (
    <div
      role="alert"
      className="mt-4 flex max-w-xl flex-col items-start gap-2 rounded-block border border-line bg-panel p-5"
    >
      <span className="inline-grid size-8 place-items-center rounded-control bg-hover text-muted">
        <RemoveIcon size={16} aria-hidden="true" />
      </span>
      <h2 className="text-subject text-ink">
        This {kind} was deleted on {monthDay(ymd(new Date(deletedAt), zone))}
      </h2>
      <p className="text-ui text-muted">
        “{title}”{where ? `, in ${where}` : ''}
      </p>
      {parent && (
        <button
          type="button"
          onClick={() => navigate(parent.to)}
          className={`${BUTTON.secondary} mt-1`}
        >
          Open {parent.name}
        </button>
      )}
    </div>
  )
}
