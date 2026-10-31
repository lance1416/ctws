import { BUILD } from '../../platform/build/build'
import { type EditorMode, useEditorMode } from '../../platform/editor/vim'
import { LAYER } from '../../platform/ui/layers'

/**
 * THE STATUS BAR (DES-001 section 4): the frame's last 24 on a desk, across its whole width. On the
 * left what the editor with the focus is doing, when it has vim's keys (REQ-002 FR-112); on the
 * right what the app is, the version always last. Items 16 apart, no separators. A phone has
 * none: its version ends More.
 */
export function StatusBar() {
  const editing = useEditorMode()
  return (
    <footer
      aria-label="Status"
      // A bar of the frame, as the top bar: over the pane beside it, and that pane's shadow.
      className={`relative ${LAYER.bar} flex h-6 shrink-0 items-center gap-4 border-t border-line bg-chrome px-3 text-meta text-subtle tabular-nums max-lg:hidden`}
    >
      {editing && <VimMode {...editing} />}
      <span className="ml-auto" />
      <BuildVersion />
    </footer>
  )
}

/** Each mode in its own colour, so it reads at a glance (artboard 34, "Vim, when it is on"). */
const MODE_TINT: Record<EditorMode['mode'], string> = {
  NORMAL: 'text-ink',
  INSERT: 'text-task-t',
  VISUAL: 'text-meeting-t',
  REPLACE: 'text-stop-t',
}

/** `NORMAL  Ln 6, Col 42`; in VISUAL, how many lines the selection takes. */
function VimMode({ mode, line, column, lines }: EditorMode) {
  return (
    <span data-vim-mode={mode} className="flex items-center gap-4">
      <span className={`font-mono font-medium ${MODE_TINT[mode]}`}>{mode}</span>
      <span className="text-muted">
        {mode === 'VISUAL'
          ? `${lines} ${lines === 1 ? 'line' : 'lines'}`
          : `Ln ${line}, Col ${column}`}
      </span>
    </span>
  )
}

/** The release running, as its tag ("v0.31.5"); its commit on a hover and to a screen reader. */
export function BuildVersion() {
  const commit = BUILD.commit ? `Build ${BUILD.commit}` : undefined
  return (
    <span data-build-version title={commit}>
      {BUILD.version}
      {commit && <span className="sr-only">, {commit}</span>}
    </span>
  )
}
