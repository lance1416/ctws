import { allChords } from '../modules/registry'
import { setShortcutsEnabled, useShortcutsEnabled } from '../shortcuts/enabled'
import { JUMP_PREFIX } from '../shortcuts/chords'
import { Modal } from './Modal'

/**
 * The `?` overlay. Nothing in this app announced its own keys before; a keyboard-first tool whose
 * keys are undiscoverable is a keyboard-first tool for the person who wrote it.
 *
 * Grouped by where the key works, because `s` on a task row and `g p` anywhere are not the same
 * kind of thing and a flat list of eleven rows reads as noise.
 */
const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: 'Anywhere',
    keys: [
      ['/', 'Jump to the capture box'],
      ['f', 'Search tasks across every project'],
      ['?', 'This list of shortcuts'],
      // The jump chords come from the key table, so a module that adds one cannot add it
      // without the help overlay saying so -- an undiscoverable key is no key at all.
      ...allChords().map((c): [string, string] => [`${JUMP_PREFIX} ${c.key}`, c.label]),
      ['Esc', 'Close the pane or overlay'],
    ],
  },
  {
    // `n` is not under Anywhere on purpose: it needs a project to create into, so it exists only
    // on a project page. Listed because a key nobody can find is not a key.
    title: 'On a project page',
    keys: [['n', 'Open the New dialog']],
  },
  {
    title: 'In the task tree (with a row focused)',
    keys: [
      ['↑ ↓ / j k', 'Move between rows'],
      ['← →', 'Collapse / expand (when collapsed, jump to the parent / first child)'],
      ['Home End', 'First row / last row'],
      ['Tab', 'Leave the tree (the whole tree is one tab stop)'],
      ['Enter', 'Open the details'],
      ['Shift+Enter', 'Add a sibling'],
      ['Alt+Enter', 'Add a subtask'],
      ['Alt+↑ Alt+↓', 'Move this row up / down'],
      ['Alt+← Alt+→', 'Outdent / indent'],
      ['s', 'Start / pause'],
      ['x', 'Complete / reopen'],
    ],
  },
  {
    title: 'On Today (with a row focused)',
    keys: [
      ['s', 'Start / pause'],
      ['x', 'Complete / reopen'],
      ['Enter', 'Open the details'],
    ],
  },
]

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const enabled = useShortcutsEnabled()

  return (
    // Radix now owns Escape, the press outside, the focus trap and the focus restoration that this
    // file used to get from the hand-built `Overlay`. Nothing about WHAT it says changed.
    <Modal title="Keyboard shortcuts" onClose={onClose} className="rounded-lg">
      <div className="px-5 py-4">
        {GROUPS.map((group) => (
          <section key={group.title} className="mt-4 first:mt-0">
            <h3 className="text-sm font-semibold text-fg-muted">{group.title}</h3>
            <dl className="mt-1">
              {group.keys.map(([key, what]) => (
                <div key={`${group.title}-${key}`} className="flex items-baseline gap-3 py-0.5">
                  <dt className="w-[14ch] shrink-0">
                    <kbd className="rounded border border-border-strong px-1.5 text-xs leading-5 text-fg-muted">
                      {key}
                    </kbd>
                  </dt>
                  <dd className="text-sm text-fg">{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        {/* The OpenProject 16.2 lesson: single-key shortcuts take keystrokes away from assistive
            technology, so they have to be refusable. Arrow keys, Enter, Escape and the Alt
            combinations are NOT turned off -- those are how a treeview is operated at all, and a
            tree with no arrow keys and one tab stop would be unreachable. */}
        <label className="mt-6 flex items-start gap-2 border-t border-border-subtle pt-4 text-sm text-fg">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setShortcutsEnabled(e.target.checked)}
            className="mt-1 h-4 w-4 accent-accent"
          />
          <span>
            Single-key shortcuts
            <span className="block text-fg-muted">
              With this off, /, f, ?, the g chords, s, x, j and k stop responding. Arrow keys,
              Enter, Esc and the Alt combinations are unaffected. This browser only.
            </span>
          </span>
        </label>
      </div>
    </Modal>
  )
}
