import type { ProjectListItem } from '@ctws/contracts'

/**
 * WHAT TO DO WITH THE ROWS YOU PICKED (D61).
 *
 * This was refused once, on the grounds that multi-select is a team clean-up tool. That measured
 * the wrong axis: one person with sixty open tasks across four lines of work does 「把这五条标
 * 完成」 and 「把这几条挪到另一个项目」 as ordinary weekly maintenance, and doing it one row at a
 * time is the chore the tool exists to remove.
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
      aria-label="已选的任务"
      data-selection-bar
      className="mb-1 ml-3 flex w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 py-2"
    >
      <span className="text-sm text-fg">已选 {count}</span>
      <button
        type="button"
        onClick={onFinish}
        disabled={busy}
        className="h-8 rounded-lg border border-border-strong px-2.5 text-sm text-fg hover:bg-surface-hover disabled:opacity-50"
      >
        标记完成
      </button>
      <label className="flex items-center gap-1.5 text-sm text-fg-muted">
        移到
        <select
          aria-label="移到项目"
          value=""
          disabled={busy}
          onChange={(e) => {
            if (e.target.value) onMove(e.target.value)
          }}
          className="h-8 rounded-lg border border-border-strong bg-surface px-2 text-sm text-fg disabled:opacity-50"
        >
          <option value="">选择项目…</option>
          {projects
            .filter((p) => p.id !== currentProjectId && !p.archivedAt)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </label>
      <button
        type="button"
        onClick={onClear}
        className="ml-auto h-8 rounded-lg px-2 text-sm text-fg-muted hover:bg-surface-hover hover:text-fg"
      >
        取消选择
      </button>
    </div>
  )
}
