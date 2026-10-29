import type { ProjectResponse, StageId, StageResponse } from '@ctws/contracts'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { problemText } from '../../../../platform/http/api'
import { Button } from '../../../../platform/ui/Button'
import { DetailHead, DetailPane } from '../../../../platform/ui/DetailPane'
import { boxed } from '../../../../platform/ui/formStyles'
import { EditIcon, FoldStageIcon, NewIcon } from '../../../../platform/ui/icons'
import { ProjectSquare, putStages } from '../../../../shell/projects'
import { projectTasksQuery } from '../../api'
import { Grip } from '../../../../platform/ui/Grip'

type Entry = { id?: StageId; name: string; collapsed?: boolean; mergeInto?: StageId }
const asEntries = (stages: readonly StageResponse[]): Entry[] =>
  stages.map((s) => ({ id: s.id, name: s.name, collapsed: s.collapsed }))
const tasksWord = (n: number) => `${n} task${n === 1 ? '' : 's'}`
const same = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase()

/**
 * EDIT STAGES (FR-040, artboard 29), in the inspector: the project's stages in board order, each
 * dragged to its place, renamed in place (on every task at it; a name that exists already asks
 * to merge the two), shown or folded on the board, and removed while nothing uses it. Every
 * change is written at once, as the whole list.
 */
export function EditStages({
  project,
  stages,
  onClose,
}: {
  project: ProjectResponse
  stages: readonly StageResponse[]
  onClose: () => void
}) {
  const save = useMutation({
    mutationFn: (next: Entry[]) => putStages(project.id, { stages: next }),
    // A rename or a merge reaches the tasks at those stages, and their tree.
    meta: { changes: ['task'], awaits: [projectTasksQuery(project.id).queryKey], ownsError: true },
  })
  const [merging, setMerging] = useState<{ from: StageResponse; into: StageResponse } | null>(null)
  const [adding, setAdding] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const write = (next: Entry[]) => save.mutate(next)
  const entries = asEntries(stages)
  const rename = (stage: StageResponse, name: string) => {
    const other = stages.find((s) => s.id !== stage.id && same(s.name, name))
    if (other) setMerging({ from: stage, into: other })
    else write(entries.map((e) => (e.id === stage.id ? { ...e, name } : e)))
  }
  const move = (from: number, to: number) => {
    if (from !== to && to >= 0 && to < entries.length) write(arrayMove(entries, from, to))
  }

  return (
    <DetailPane label={`Stages in ${project.name}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <DetailHead
          kind={
            <>
              <ProjectSquare project={project} />
              <span className="truncate text-ui font-medium text-ink">
                Stages in {project.name}
              </span>
            </>
          }
          onClose={onClose}
        />
        {save.isError && (
          <p role="alert" className="text-ui text-stop-t">
            {problemText(save.error) ?? "Couldn't change the stages"}
          </p>
        )}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={({ active, over }) => {
            if (!over) return
            move(
              stages.findIndex((s) => s.id === active.id),
              stages.findIndex((s) => s.id === over.id),
            )
          }}
        >
          <SortableContext items={stages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <ul aria-label="Stages" className="flex flex-col">
              {stages.map((stage, i) => (
                <StageRow
                  key={stage.id}
                  stage={stage}
                  busy={save.isPending}
                  onRename={(name) => rename(stage, name)}
                  onFold={() =>
                    write(
                      entries.map((e) =>
                        e.id === stage.id ? { ...e, collapsed: !stage.collapsed } : e,
                      ),
                    )
                  }
                  onRemove={() => write(entries.filter((e) => e.id !== stage.id))}
                  onStep={(step) => move(i, i + step)}
                  merge={
                    merging?.from.id === stage.id
                      ? {
                          into: merging.into,
                          onCancel: () => setMerging(null),
                          onMerge: () => {
                            setMerging(null)
                            write(
                              entries.map((e) =>
                                e.id === stage.id ? { ...e, mergeInto: merging.into.id } : e,
                              ),
                            )
                          },
                        }
                      : null
                  }
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        {adding ? (
          <NewStage
            onCancel={() => setAdding(false)}
            onAdd={(name) => {
              setAdding(false)
              if (!stages.some((s) => same(s.name, name))) write([...entries, { name }])
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex h-8 items-center gap-2 self-start rounded-control px-2 text-ui text-muted hover:bg-hover hover:text-ink"
          >
            <NewIcon size={14} aria-hidden="true" />
            New stage
          </button>
        )}
      </div>
    </DetailPane>
  )
}

/** One stage: its grip, dot, name, how many tasks are at it, and whether the board folds it. */
function StageRow({
  stage,
  busy,
  onRename,
  onFold,
  onRemove,
  onStep,
  merge,
}: {
  stage: StageResponse
  busy: boolean
  onRename: (name: string) => void
  onFold: () => void
  onRemove: () => void
  onStep: (step: -1 | 1) => void
  merge: { into: StageResponse; onCancel: () => void; onMerge: () => void } | null
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stage.id,
  })
  const [naming, setNaming] = useState<string | null>(null)
  // The box is left one way, its blur: Enter blurs it, Esc says first that it is not kept.
  const undo = useRef(false)
  const keep = () => {
    const name = naming?.trim() ?? ''
    setNaming(null)
    if (undo.current) undo.current = false
    else if (name !== '' && name !== stage.name) onRename(name)
  }
  return (
    <li
      ref={setNodeRef}
      data-stage-row={stage.id}
      style={{
        transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      className={`group flex flex-col rounded-control ${isDragging ? 'bg-float shadow-float' : ''}`}
    >
      <div className="flex min-h-10 items-center gap-2.5 px-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Move ${stage.name}`}
          // Alt and an arrow moves it a place, as a tree row moves (FR-029).
          onKeyDown={(e) => {
            if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
            e.preventDefault()
            onStep(e.key === 'ArrowUp' ? -1 : 1)
          }}
          className="flex h-8 w-3 cursor-grab touch-none items-center justify-center text-muted"
        >
          <Grip />
        </button>
        <i
          aria-hidden="true"
          className={`size-2 shrink-0 rounded-full ${stage.collapsed ? 'bg-subtle' : 'bg-muted'}`}
        />
        {naming === null ? (
          <button
            type="button"
            onClick={() => setNaming(stage.name)}
            aria-label={`Rename ${stage.name}`}
            className="min-w-0 flex-1 truncate rounded-control px-1 py-1 text-left text-ui text-ink hover:bg-hover"
          >
            {stage.name}
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
            aria-label={`Name of ${stage.name}`}
            className={`min-w-0 flex-1 ${boxed}`}
          />
        )}
        <span className="shrink-0 text-meta text-subtle tabular-nums">
          {tasksWord(stage.count)}
        </span>
        {/* Nothing at it, on the board or in the tree: it can go (FR-040). */}
        {stage.count === 0 && naming === null && (
          <button
            type="button"
            disabled={busy}
            onClick={onRemove}
            className="h-7 rounded-control border border-line px-2 text-meta text-ink opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:border-line-strong [@media(hover:none)]:opacity-100"
          >
            Remove
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          aria-pressed={stage.collapsed}
          aria-label={`Fold ${stage.name} on the board`}
          onClick={onFold}
          className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-control px-2 text-meta ${
            stage.collapsed
              ? 'bg-hover font-medium text-ink'
              : 'text-muted hover:bg-hover hover:text-ink'
          }`}
        >
          <FoldStageIcon size={14} aria-hidden="true" />
          {stage.collapsed ? 'Folded' : 'Shown'}
        </button>
      </div>
      {naming !== null && naming.trim() !== stage.name && (
        <p className="mb-1 ml-8 flex items-center gap-1.5 rounded-control bg-task-bg px-2.5 py-1.5 text-meta text-task-t">
          <EditIcon size={12} aria-hidden="true" />
          Renames it on {tasksWord(stage.count)}. Enter to keep, Esc to undo.
        </p>
      )}
      {merge && (
        <div
          role="alert"
          className="mx-1 mb-2 rounded-control border border-line-strong p-3 text-ui"
        >
          <p className="text-ink">
            {merge.into.name} already exists. Merge them? The {tasksWord(stage.count)} at{' '}
            {stage.name} {stage.count === 1 ? 'moves' : 'move'} to {merge.into.name}.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <Button look="secondary" onClick={merge.onCancel}>
              Cancel
            </Button>
            <Button look="primary" onClick={merge.onMerge}>
              Merge
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}

/** A new stage's name, typed where it will be: Enter adds it, Esc or an empty box does not. */
function NewStage({ onAdd, onCancel }: { onAdd: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  // Left by its blur alone, as a stage's name is: Enter blurs it, Esc says first it is not kept.
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
      aria-label="New stage"
      placeholder="New stage"
      className={`ml-8 w-auto ${boxed}`}
    />
  )
}
