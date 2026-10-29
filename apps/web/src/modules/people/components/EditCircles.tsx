import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { problemText } from '../../../platform/http/api'
import { Button } from '../../../platform/ui/Button'
import { DetailHead, DetailPane } from '../../../platform/ui/DetailPane'
import { boxed } from '../../../platform/ui/formStyles'
import { Grip } from '../../../platform/ui/Grip'
import { CirclesIcon, KIND_ICON, NewIcon, RemoveIcon } from '../../../platform/ui/icons'
import { KIND_TEXT } from '../../../platform/ui/kinds'
import { peopleKeys, putCircles } from '../api'

/** One circle as the list has it: its id, name and how many are in it. */
type Circle = Awaited<ReturnType<typeof putCircles>>[number]
type Entry = { id?: Circle['id']; name: string }
const peopleWord = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`
const same = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase()

/**
 * EDIT CIRCLES (FR-049, artboard 29), from Edit on the Circles block: your circles in your order
 * (the New person form's), each dragged to its place, renamed in place, and deleted after a
 * question that says how many people leave it; nobody is deleted. Every change is written at
 * once, as the whole list.
 */
export function EditCircles({
  circles,
  onClose,
}: {
  circles: readonly Circle[]
  onClose: () => void
}) {
  const save = useMutation({
    mutationFn: (next: Entry[]) => putCircles(next),
    // A circle renamed or gone is on the people in it, and on the sidebar's filter.
    meta: { changes: ['person'], awaits: [peopleKeys.circles], ownsError: true },
  })
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<Circle['id'] | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const entries: Entry[] = circles.map((c) => ({ id: c.id, name: c.name }))
  const write = (next: Entry[]) => save.mutate(next)
  const move = (from: number, to: number) => {
    if (from !== to && to >= 0 && to < entries.length) write(arrayMove(entries, from, to))
  }
  const Person = KIND_ICON.person
  return (
    <DetailPane label="Circles" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <DetailHead
          kind={
            <>
              <Person size={16} aria-hidden="true" className={KIND_TEXT.person} />
              <span className="truncate text-ui font-medium text-ink">Circles</span>
            </>
          }
          onClose={onClose}
        />
        {save.isError && (
          <p role="alert" className="text-ui text-stop-t">
            {problemText(save.error) ?? "Couldn't change the circles"}
          </p>
        )}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={({ active, over }) => {
            if (!over) return
            move(
              circles.findIndex((c) => c.id === active.id),
              circles.findIndex((c) => c.id === over.id),
            )
          }}
        >
          <SortableContext items={circles.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <ul aria-label="Circles" className="flex flex-col">
              {circles.map((circle, i) => (
                <CircleRow
                  key={circle.id}
                  circle={circle}
                  busy={save.isPending}
                  taken={(name) => circles.some((c) => c.id !== circle.id && same(c.name, name))}
                  onRename={(name) =>
                    write(entries.map((e) => (e.id === circle.id ? { ...e, name } : e)))
                  }
                  onStep={(step) => move(i, i + step)}
                  deleting={deleting === circle.id}
                  onAsk={() => setDeleting(circle.id)}
                  onCancel={() => setDeleting(null)}
                  onDelete={() => {
                    setDeleting(null)
                    write(entries.filter((e) => e.id !== circle.id))
                  }}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        {adding ? (
          <NewCircle
            onCancel={() => setAdding(false)}
            onAdd={(name) => {
              setAdding(false)
              if (!circles.some((c) => same(c.name, name))) write([...entries, { name }])
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex h-8 items-center gap-2 self-start rounded-control px-2 text-ui text-muted hover:bg-hover hover:text-ink"
          >
            <NewIcon size={14} aria-hidden="true" />
            New circle
          </button>
        )}
      </div>
    </DetailPane>
  )
}

/** One circle: its grip, its name, how many are in it, and its delete. */
function CircleRow({
  circle,
  busy,
  taken,
  onRename,
  onStep,
  deleting,
  onAsk,
  onCancel,
  onDelete,
}: {
  circle: Circle
  busy: boolean
  taken: (name: string) => boolean
  onRename: (name: string) => void
  onStep: (step: -1 | 1) => void
  deleting: boolean
  onAsk: () => void
  onCancel: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: circle.id,
  })
  const [naming, setNaming] = useState<string | null>(null)
  // The box is left one way, its blur: Enter blurs it, Esc says first that it is not kept.
  const undo = useRef(false)
  const typed = naming?.trim() ?? ''
  const clash = naming !== null && typed !== circle.name && taken(typed)
  const keep = () => {
    setNaming(null)
    if (undo.current) undo.current = false
    else if (typed !== '' && typed !== circle.name && !taken(typed)) onRename(typed)
  }
  return (
    <li
      ref={setNodeRef}
      data-circle-row={circle.id}
      style={{
        transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      className={`flex flex-col rounded-control ${isDragging ? 'bg-float shadow-float' : ''}`}
    >
      <div className="flex min-h-10 items-center gap-2.5 px-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Move ${circle.name}`}
          // Alt and an arrow moves it a place, as a stage moves.
          onKeyDown={(e) => {
            if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
            e.preventDefault()
            onStep(e.key === 'ArrowUp' ? -1 : 1)
          }}
          className="flex h-8 w-3 cursor-grab touch-none items-center justify-center text-muted"
        >
          <Grip />
        </button>
        <CirclesIcon size={16} aria-hidden="true" className="shrink-0 text-muted" />
        {naming === null ? (
          <button
            type="button"
            onClick={() => setNaming(circle.name)}
            aria-label={`Rename ${circle.name}`}
            className="min-w-0 flex-1 truncate rounded-control px-1 py-1 text-left text-ui text-ink hover:bg-hover"
          >
            {circle.name}
          </button>
        ) : (
          <input
            autoFocus
            value={naming}
            onChange={(e) => setNaming(e.target.value)}
            onBlur={keep}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return
              if (e.key !== 'Enter' && e.key !== 'Escape') return
              e.preventDefault()
              e.stopPropagation()
              if (e.key === 'Escape') undo.current = true
              e.currentTarget.blur()
            }}
            aria-label={`Name of ${circle.name}`}
            aria-invalid={clash || undefined}
            className={`min-w-0 flex-1 ${boxed}`}
          />
        )}
        <span className="shrink-0 text-meta text-subtle tabular-nums">
          {peopleWord(circle.count)}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={onAsk}
          aria-label={`Delete ${circle.name}`}
          title={`Delete ${circle.name}`}
          className={`inline-grid size-7 shrink-0 place-items-center rounded-control hover:bg-hover ${
            deleting ? 'text-stop' : 'text-muted hover:text-ink'
          }`}
        >
          <RemoveIcon size={14} aria-hidden="true" />
        </button>
      </div>
      {clash && (
        <p role="alert" className="mb-1 ml-8 text-meta text-stop-t">
          There is a circle called {typed} already.
        </p>
      )}
      {deleting && (
        <div
          role="alert"
          className="mx-1 mb-2 rounded-control border border-line-strong p-3 text-ui"
        >
          <p className="text-ink">
            Delete {circle.name}?{/* Nobody in it: the question alone (FR-049). */}
            {circle.count > 0 &&
              ` The ${peopleWord(circle.count)} in it ${circle.count === 1 ? 'stays' : 'stay'}; they just leave this circle.`}
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <Button look="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button look="destructive" onClick={onDelete}>
              <RemoveIcon size={14} aria-hidden="true" />
              Delete {circle.name}
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}

/** A new circle's name, typed where it will be: Enter adds it, Esc or an empty box does not. */
function NewCircle({ onAdd, onCancel }: { onAdd: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const undo = useRef(false)
  return (
    <input
      autoFocus
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={() => (name.trim() && !undo.current ? onAdd(name.trim()) : onCancel())}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing || (e.key !== 'Enter' && e.key !== 'Escape')) return
        e.preventDefault()
        e.stopPropagation()
        if (e.key === 'Escape') undo.current = true
        e.currentTarget.blur()
      }}
      aria-label="New circle"
      placeholder="New circle"
      className={`ml-8 w-auto ${boxed}`}
    />
  )
}
