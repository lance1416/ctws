import { useEffect, useState } from 'react'

type PhoneTools = typeof import('./phone')

/**
 * 号码那套按国家分组的元数据，谁先要谁去取，全站只取一次。
 *
 * 它有八十来 KB，而排一个号码是打开一个人之后才会发生的事，所以它不在首屏那一包里 —— 和
 * Markdown 渲染器、Mermaid 一样的待遇。没到之前号码按存下来的样子显示（E.164，读得懂，只是没
 * 分组），到了再排 —— 先把字摆上，再变好看。
 *
 * 这个 hook 本身是干的（不到 20 行，没有依赖），所以它可以留在首屏那一包里，让三个地方共用同一次
 * 取。`pending` 在模块上：第二个用它的组件不会再发一次请求。
 */
let pending: Promise<PhoneTools> | null = null

export function usePhone(): PhoneTools | null {
  const [tools, setTools] = useState<PhoneTools | null>(null)
  useEffect(() => {
    let alive = true
    pending ??= import('./phone')
    void pending.then((m) => {
      if (alive) setTools(m)
    })
    return () => {
      alive = false
    }
  }, [])
  return tools
}
