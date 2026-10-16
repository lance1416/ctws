import type { ProjectListItem } from '@ctws/contracts'
import { PickOne } from '../../../platform/ui/inline'

/** What to do with the picked rows; shown only while something is selected. */
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
        {/* Not a native `<select>`, whose OS-drawn popup ignores this palette. It holds no value:
            picking is the act. */}
        <PickOne
          label="Move to project"
          value={null}
          disabled={busy}
          placeholder="Choose a project…"
          choices={projects
            .filter((p) => p.id !== currentProjectId)
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
