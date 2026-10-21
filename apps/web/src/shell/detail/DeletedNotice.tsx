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
import { useEveryProject } from '../projects/api'
import { ProjectSquare } from '../projects/ProjectSquare'

/**
 * SOMETHING THAT NO LONGER EXISTS (FR-032, FR-035, artboard 23): an old address gives the whole
 * main area to what happened. When it was deleted and where it was, read from what the deletion
 * left, and the way to what held it. With nothing left to read, it still says it was deleted.
 */
export function DeletedNotice({ type, id }: { type: ObjectType; id: string }) {
  const zone = useTimeZone()
  const navigate = useNavigate()
  const registry = useRegistry()
  const projects = useEveryProject()
  const stone = useQuery({
    queryKey: ['tombstones', type, id],
    queryFn: ({ signal }) => call(api.tombstones.get, { params: { type, id } }, { signal }),
    retry: false,
  })
  const kind = KIND_WORDS[type].one.toLocaleLowerCase()
  if (stone.isPending) return null
  const failed = stone.isError && !(stone.error instanceof ApiError && stone.error.status === 404)
  const found = stone.data
  const place = found?.place
  const parent =
    place?.parentType && place.parentId
      ? {
          to: registry.relationFor(place.parentType).to(place.parentId),
          name: place.path.at(-1) ?? KIND_WORDS[place.parentType].one,
        }
      : place?.projectId
        ? { to: `/projects/${place.projectId}`, name: place.projectName ?? 'its project' }
        : null
  const project = place?.projectId
    ? projects.data?.find((p) => p.id === place.projectId)
    : undefined
  const where = place ? [place.projectName, ...place.path].filter(Boolean).join(' / ') : ''
  return (
    <div
      role="alert"
      data-deleted-notice
      className="flex max-w-xl flex-col items-start gap-2 rounded-block border border-line bg-panel p-5"
    >
      <span className="inline-grid size-8 place-items-center rounded-control bg-hover text-muted">
        <RemoveIcon size={16} aria-hidden="true" />
      </span>
      <h2 className="text-subject text-ink">
        {failed
          ? `Couldn’t find out what happened to this ${kind}`
          : found
            ? `This ${kind} was deleted on ${monthDay(ymd(new Date(found.deletedAt), zone))}`
            : `This ${kind} was deleted`}
      </h2>
      {found && <p className="text-ui text-muted">“{found.title}”</p>}
      {where && (
        <p className="inline-flex items-center gap-1.5 text-ui text-muted">
          It was in
          {project && <ProjectSquare project={project} />}
          {where}
        </p>
      )}
      {parent && (
        <button
          type="button"
          onClick={() => navigate(parent.to)}
          className={`${BUTTON.secondary} mt-1.5`}
        >
          Open {parent.name}
        </button>
      )}
    </div>
  )
}
