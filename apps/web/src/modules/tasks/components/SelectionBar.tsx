import type { ProjectListItem } from '@ctws/contracts'
import { PickOne } from '../../../platform/ui/inline'

/**
 * WHAT TO DO WITH THE ROWS YOU PICKED.
 *
 * MULTI-SELECT IS NOT ONLY A TEAM TOOL: one person with sixty open tasks across four lines of
 * work finishes five at once and moves a handful to another project as ordinary weekly
 * maintenance, and doing it one row at a time is the chore this exists to remove.
 *
 * It appears only with a selection, so a tree nobody is picking from carries no chrome for it.
 * Two actions and a way out -- not a toolbar: anything else a person wants to do to five tasks
 * at once can be argued for when it is actually wanted.
 */
export function SelectionBar({
  count,
  projects,
  currentProjectId,
  onFinish,
  onMove,
  onClear,
  busy,
}: {
  count: number
  projects: ProjectListItem[]
  currentProjectId: string
  onFinish: () => void
  onMove: (projectId: string) => void
  onClear: () => void
  busy: boolean
}) {
  if (count === 0) return null
  return (
    <div
      role="group"
      aria-label="Selected tasks"
      data-selection-bar
      className="mb-1 ml-3 flex w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 rounded-md border border-rule-strong bg-sheet px-3 py-2"
    >
      <span className="text-sm text-ink">{count} selected</span>
      <button
        type="button"
        onClick={onFinish}
        disabled={busy}
        className="h-8 rounded-md border border-rule-strong px-2.5 text-sm text-ink hover:bg-hover disabled:opacity-50"
      >
        Mark done
      </button>
      <span className="flex items-center gap-1.5 text-sm text-ink-muted">
        Move to
        {/* The app's own picker, not a native `<select>`: the OS draws that popup and does not
            know this palette. It holds no value -- picking IS the act. */}
        <PickOne
          label="Move to project"
          value={null}
          disabled={busy}
          placeholder="Choose a project…"
          choices={projects
            .filter((p) => p.id !== currentProjectId && !p.archivedAt)
            .map((p) => ({ value: p.id, label: p.name }))}
          onPick={onMove}
        />
      </span>
      <button
        type="button"
        onClick={onClear}
        className="ml-auto h-8 rounded-md px-2 text-sm text-ink-muted hover:bg-hover hover:text-ink"
      >
        Clear selection
      </button>
    </div>
  )
}
