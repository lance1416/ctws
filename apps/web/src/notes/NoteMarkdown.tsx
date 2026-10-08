import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import Markdown, { type Components } from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import type { PluggableList } from 'unified'
import { MERMAID_LANG, noteFeatures } from './features'
import { noteSchema } from './schema'

/**
 * A NOTE, RENDERED. Reading mode's half of D73.
 *
 * WHAT IS IN THIS CHUNK AND WHAT IS NOT. This module is itself behind a dynamic import (see
 * `NoteBody`), so the app's first paint pays nothing for Markdown. Opening a task pays for THIS:
 * `react-markdown`, `remark-gfm`, `remark-math`'s parser and `rehype-sanitize`. The two expensive
 * renderers are held back one level further and are fetched per NOTE, not per app:
 *
 *   - `rehype-katex` + `katex` + KaTeX's stylesheet: only when `noteFeatures` finds maths.
 *   - `mermaid`: only when `noteFeatures` finds a `mermaid` fence.
 *   - `rehype-highlight` (highlight.js's common grammars): only when a fence carries a language.
 *
 * That split is D73's second decision and it is asserted on the NETWORK in `notes.spec.ts`, not on
 * a flag -- a boolean that says "lazy" is exactly the thing that can be true while the bytes still
 * ship.
 *
 * `remark-math` is in the always-loaded half on purpose. It is the micromark extension (the
 * grammar), not the typesetter, and having it here is what lets `noteFeatures` answer "does this
 * note contain maths" with the SAME parser that will render it, instead of with a regex that would
 * drift. See `features.ts`.
 */

const MermaidDiagram = lazy(() => import('./MermaidDiagram'))

/** `rehype-sanitize` first, ALWAYS, and KaTeX after it. The order is argued in `schema.ts`. */
const BASE_REHYPE: PluggableList = [[rehypeSanitize, noteSchema]]
const REMARK: PluggableList = [remarkGfm, remarkMath]

const components: Components = {
  /**
   * A FENCE. `pre` and not `code`, because a diagram replaces the whole block: a `<div>` returned
   * from the `code` slot would be flow content inside `<pre>`, which is phrasing-only.
   *
   * The fence's text is read off the hast node rather than from `children`, because `children` is
   * already React elements by the time this runs and mermaid needs the source.
   */
  pre({ node, children }) {
    const first = node?.children?.[0]
    if (first?.type === 'element' && first.tagName === 'code') {
      const className = first.properties?.className
      const classes = Array.isArray(className) ? className.map(String) : []
      if (classes.includes(`language-${MERMAID_LANG}`)) {
        const source = first.children
          .map((child) => (child.type === 'text' ? child.value : ''))
          .join('')
        return (
          <Suspense fallback={<p className="my-3 text-sm text-fg-subtle">Drawing…</p>}>
            <MermaidDiagram source={source} />
          </Suspense>
        )
      }
    }
    return <pre>{children}</pre>
  },
  /**
   * GFM'S TASK-LIST CHECKBOX, AS A MARK RATHER THAN A CONTROL.
   *
   * GFM renders `- [x]` as `<input type="checkbox" disabled>`, and reading mode is pinned by
   * `pane.spec.ts` to contain NOT ONE control: 「编辑和信息显示在同一个地方，容易误触」 is the
   * complaint that invariant answers, and a disabled checkbox would make it conditional on what a
   * note happens to contain. It is also a control that does nothing, which is worse for a screen
   * reader than a labelled image. Shape plus an accessible name, like `StatusMark`.
   *
   * 「已勾选 / 未勾选」 and not 「已完成 / 未完成」: accessible names share one flat namespace and
   * are matched by substring, and 已完成 is already a task STATUS on this very panel.
   */
  input({ checked }) {
    return (
      <span
        role="img"
        aria-label={checked ? 'Checked' : 'Empty'}
        className="relative top-px mr-1.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border border-border-strong align-text-top"
      >
        {checked && (
          <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" className="text-fg">
            <path
              d="M2 5.2 4 7.2 8 3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        )}
      </span>
    )
  },
  /** A link in a note goes OUT of the app, so it opens beside it and carries no referrer. The
   * schema has already refused anything but http/https/mailto/irc/xmpp. */
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    )
  },
  /** A wide table scrolls itself rather than the pane: the pane's own measure must not grow, and
   * 375px零横向滚动 is pinned app-wide. */
  table({ children }) {
    return (
      <div className="max-w-full overflow-x-auto">
        <table>{children}</table>
      </div>
    )
  },
}

export default function NoteMarkdown({ source }: { source: string }): ReactNode {
  const features = useMemo(() => noteFeatures(source), [source])
  const [katex, setKatex] = useState<PluggableList | null>(null)
  const [hljs, setHljs] = useState<PluggableList | null>(null)

  useEffect(() => {
    if (!features.math || katex !== null) return
    let live = true
    void (async () => {
      const [mod] = await Promise.all([
        import('rehype-katex'),
        // KaTeX's own stylesheet, self-hosted like every other asset in this app: Vite emits it (and
        // its faces) as content-hashed files served from this origin, never from a CDN. It is a
        // dynamic import so it lands in THIS chunk and is requested with it.
        import('katex/dist/katex.min.css'),
      ])
      if (live) setKatex([mod.default])
    })()
    return () => {
      live = false
    }
  }, [features.math, katex])

  useEffect(() => {
    if (!features.highlight || hljs !== null) return
    let live = true
    void (async () => {
      const mod = await import('rehype-highlight')
      if (live) {
        setHljs([
          [
            mod.default,
            {
              // Never guess. A fence with no language stays plain text (`features.ts` does not
              // even flag it), and one whose language highlight.js does not know stays plain
              // rather than being painted as whatever scored highest.
              detect: false,
              // An unknown info string is not an error worth throwing a note's rendering away for.
              ignoreMissing: true,
            },
          ],
        ])
      }
    })()
    return () => {
      live = false
    }
  }, [features.highlight, hljs])

  // Until a renderer arrives, the block shows the author's own characters -- a flicker of plain
  // text, which is honest and cheaper than a spinner. Sanitise FIRST in both cases: see schema.ts.
  const rehypePlugins = [...BASE_REHYPE, ...(katex ?? []), ...(hljs ?? [])]

  return (
    <div data-note-md className="max-w-full">
      <Markdown remarkPlugins={REMARK} rehypePlugins={rehypePlugins} components={components}>
        {source}
      </Markdown>
    </div>
  )
}
