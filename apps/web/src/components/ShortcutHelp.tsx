import { setShortcutsEnabled, useShortcutsEnabled } from '../shortcuts/enabled'
import { Overlay } from './Overlay'

/**
 * The `?` overlay. Nothing in this app announced its own keys before; a keyboard-first tool whose
 * keys are undiscoverable is a keyboard-first tool for the person who wrote it.
 *
 * Grouped by where the key works, because `s` on a task row and `g p` anywhere are not the same
 * kind of thing and a flat list of eleven rows reads as noise.
 */
const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: '任何地方',
    keys: [
      ['/', '跳到捕获框'],
      ['f', '搜索所有项目的任务'],
      ['?', '这份快捷键清单'],
      ['g t', '去「今天」'],
      ['g p', '去「项目」'],
      ['g d', '去「已完成」'],
      ['g i', '去收件箱'],
      ['Esc', '关闭面板或浮层'],
    ],
  },
  {
    title: '任务树里（焦点在某一行上）',
    keys: [
      ['↑ ↓ / j k', '在行之间移动'],
      ['← →', '折叠 / 展开（已折叠时跳到父行 / 第一个子行）'],
      ['Home End', '第一行 / 最后一行'],
      ['Tab', '离开整棵树（树只占一个 Tab 站位）'],
      ['Enter', '打开详情'],
      ['Shift+Enter', '在同级新增'],
      ['Alt+Enter', '新增子任务'],
      ['Alt+↑ Alt+↓', '上移 / 下移这一行'],
      ['Alt+← Alt+→', '减少 / 增加层级'],
      ['s', '开始 / 暂停'],
      ['x', '完成 / 恢复'],
    ],
  },
  {
    title: '「今天」页上（焦点在某一行上）',
    keys: [
      ['s', '开始 / 暂停'],
      ['x', '完成 / 恢复'],
      ['Enter', '打开详情'],
    ],
  },
]

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const enabled = useShortcutsEnabled()

  return (
    <Overlay label="键盘快捷键" onClose={onClose} className="rounded-lg">
      <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
        <h2 className="font-semibold text-fg">键盘快捷键</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-1 text-sm text-fg-muted hover:text-fg"
        >
          关闭
        </button>
      </div>
      <div className="px-5 py-4">
        {GROUPS.map((group) => (
          <section key={group.title} className="mt-4 first:mt-0">
            <h3 className="text-sm font-medium text-fg-muted">{group.title}</h3>
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
            启用单键快捷键
            <span className="block text-fg-muted">
              关掉后 /、f、?、g 和弦、s、x、j、k 不再响应，方向键、Enter、Esc 与 Alt 组合不受影响。
              只影响这个浏览器。
            </span>
          </span>
        </label>
      </div>
    </Overlay>
  )
}
