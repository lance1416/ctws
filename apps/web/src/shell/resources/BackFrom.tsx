import { useMutation } from '@tanstack/react-query'
import { useEffect } from 'react'
import { problemText } from '../../platform/http/api'
import { useNow } from '../../platform/time/useNow'
import { BUTTON, ICON_BUTTON } from '../../platform/ui/buttonStyles'
import { CloseIcon, MarkDoneIcon, ReturnedIcon } from '../../platform/ui/icons'
import { LAYER } from '../../platform/ui/layers'
import { ProjectSquare, useEveryProject } from '../projects'
import { useRegistry } from '../registry'
import { agoWords, type Away, cameBack, closeNote, useAway, useReturned, useSettle } from './away'
import { ResourceIcon } from './ResourceIcon'

/**
 * "Mark done" for the thing a resource was opened from, where its kind can be finished (a task):
 * finishing it settles the return.
 */
function useFinish(away: Away | null) {
  const relation = useRegistry().relations.find((r) => r.type === away?.from.type)
  const settle = useSettle()
  const finish = relation?.finish
  const done = useMutation({
    mutationFn: () => finish!(away!.from.id),
    meta: { changes: [away?.from.type ?? 'task'], ownsError: true },
    onSuccess: settle,
  })
  return finish && away ? done : null
}

/** The resource's name with its service's icon. */
function Resource({ away }: { away: Away }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-ink">
      <ResourceIcon url={away.url} />
      <span className="truncate">{away.name}</span>
    </span>
  )
}

/**
 * BACK FROM, ON THE WORKBENCH (FR-028, artboards 10 and 22): the top of Now, while what was last
 * opened from CTWS is still offered: the resource, how long ago, the thing it was for, and the two
 * ways to settle it. Nothing when there is none.
 */
export function BackFromCard() {
  const now = useNow()
  const away = useAway(now)
  const settle = useSettle()
  const done = useFinish(away)
  const project = useEveryProject().data?.find((p) => p.id === away?.from.projectId)
  if (!away) return null
  return (
    <div
      data-back-from
      className="grid shrink-0 grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 rounded-card bg-warn-bg p-3.5"
    >
      <ReturnedIcon size={20} aria-hidden="true" className="text-warn-t" />
      <span className="flex min-w-0 items-center gap-2 text-ui">
        <span className="shrink-0 text-muted">Back from</span>
        <Resource away={away} />
      </span>
      <span className="text-meta text-muted">{agoWords(away, now)}</span>
      <span />
      <span className="flex min-w-0 items-center gap-2">
        {project && <ProjectSquare project={project} />}
        <span className="truncate text-prose font-medium text-ink">{away.from.title}</span>
      </span>
      <span className="flex gap-1.5">
        {done && (
          <button
            type="button"
            disabled={done.isPending}
            onClick={() => done.mutate()}
            className={`${BUTTON.secondary} h-7 px-2.5 text-meta`}
          >
            <MarkDoneIcon size={14} aria-hidden="true" className="text-go" />
            Mark done
          </button>
        )}
        <button
          type="button"
          onClick={settle}
          className={`${BUTTON.secondary} h-7 px-2.5 text-meta`}
        >
          Still on it
        </button>
      </span>
      {done?.isError && (
        <p role="alert" className="col-span-full text-meta text-stop-t">
          {problemText(done.error) ?? 'Couldn’t mark it done.'}
        </p>
      )}
    </div>
  )
}

/**
 * BACK FROM, AT THE FOOT (FR-028, artboard 8): coming back to the tab after opening a resource
 * from CTWS, a note says where from and what it was for, with Mark done. Closing it leaves the
 * workbench's card.
 */
export function BackFromNote() {
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState === 'visible') cameBack()
    }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [])
  const away = useAway(useNow())
  const returned = useReturned()
  const done = useFinish(away)
  if (!away || !returned) return null
  return (
    <div
      role="status"
      data-back-from-note
      className={`absolute bottom-5 left-1/2 ${LAYER.cover} flex max-w-[calc(100%-2.5rem)] -translate-x-1/2 items-center gap-3 rounded-block bg-float py-2.5 pr-2.5 pl-3.5 text-ui shadow-float max-lg:bottom-20`}
    >
      <ReturnedIcon size={16} aria-hidden="true" className="shrink-0 text-warn" />
      <span className="shrink-0 text-muted">Back from</span>
      <Resource away={away} />
      <span className="shrink-0 text-muted">for</span>
      <span className="min-w-0 truncate font-medium text-ink">{away.from.title}</span>
      {done && (
        <button
          type="button"
          disabled={done.isPending}
          onClick={() => done.mutate()}
          className={`${BUTTON.secondary} ml-1 h-7 shrink-0 px-2.5 text-meta`}
        >
          <MarkDoneIcon size={14} aria-hidden="true" className="text-go" />
          Mark done
        </button>
      )}
      <button
        type="button"
        onClick={closeNote}
        aria-label="Dismiss"
        title="Dismiss"
        className={ICON_BUTTON}
      >
        <CloseIcon size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
