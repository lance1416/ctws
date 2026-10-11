/**
 * 明 / 暗 / 跟系统。
 *
 * 之前只跟系统（`prefers-color-scheme`）。手动选的那一下要压过系统，所以暗色那套值在 CSS 里出现
 * 两次：一次在媒体查询里（并且让 `[data-theme='light']` 把它让开），一次在 `[data-theme='dark']`
 * 下。这是这个做法必付的重复，而替代方案——把整套值搬进 JS 再注入——会让首屏多一次闪白。
 *
 * 选择存在 localStorage，并且在 React 挂载之前就写进 `<html>`（`index.html` 里那小段脚本），
 * 否则刷新时会先闪一下系统主题。
 */
export type Theme = 'light' | 'dark' | 'system'

const KEY = 'ctws:theme'

export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY)
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    // 隐私窗口里 localStorage 会抛：跟系统走就是了。
    return 'system'
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
  try {
    if (theme === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch {
    // 存不下就只管这一次：这一页仍然是他选的那个样子。
  }
}
