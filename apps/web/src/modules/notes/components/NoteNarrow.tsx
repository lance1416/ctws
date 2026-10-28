import { useQuery } from '@tanstack/react-query'
import { NoteBody } from '../../../platform/notes/NoteBody'
import { monthDay, ymd } from '../../../platform/time/dates'
import { KIND_ICON, type Kind } from '../../../platform/ui/icons'
import { KIND_ON_TINT, KIND_TEXT, KIND_TINT } from '../../../platform/ui/kinds'
import { useTimeZone } from '../../../shell/auth'
import { InspectLink, NarrowHead } from '../../../shell/inspector'
import { useRegistry } from '../../../shell/registry'
import { notesQuery } from '../api'
import { noteTitle } from '../logic/title'

/**
 * A NOTE IN THE INSPECTOR (FR-022, artboard 33): its name and what it hangs on, then the note
 * itself, rendered and read only; Edit opens its page to write.
 */
export function NoteNarrow({ id }: { id: string }) {
  const notes = useQuery(notesQuery())
  const zone = useTimeZone()
  const relationFor = useRegistry().relationFor
  const note = notes.data?.find((n) => n.id === id)
  if (notes.isSuccess && !note)
    return <p className="p-4 text-ui text-muted">This note is not here any more.</p>
  if (!note) return null
  const on = note.anchor
  const OnIcon = on ? KIND_ICON[on.type as Kind] : null
  const day = note.heldAt ?? note.updatedAt
  return (
    <>
      <NarrowHead
        mark={<KIND_ICON.note size={20} aria-hidden="true" className={KIND_TEXT.note} />}
        title={noteTitle(note)}
        tags={
          <>
            {on && on.title && (
              <span className="inline-flex items-center gap-1.5 text-muted">
                On
                <InspectLink
                  thing={{ type: on.type, id: on.id }}
                  to={relationFor(on.type).to(on.id)}
                  className={`inline-flex h-5.5 items-center gap-1 rounded-key px-2 font-medium hover:underline ${KIND_TINT[on.type as Kind]} ${KIND_ON_TINT[on.type as Kind]}`}
                >
                  {OnIcon && <OnIcon size={12} aria-hidden="true" />}
                  {on.title}
                </InspectLink>
              </span>
            )}
            <span className="font-mono text-muted tabular-nums">
              {monthDay(ymd(new Date(day), zone))}
            </span>
          </>
        }
      />
      <div className="border-t border-line px-4 py-3 text-ui">
        <NoteBody source={note.body} />
      </div>
    </>
  )
}
