import { lazy, Suspense, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import Markdown, { defaultUrlTransform, type Components } from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import type { PluggableList } from 'unified'
import { MERMAID_LANG, noteFeatures } from './features'
import { MentionContext, mentionOf } from './mention'
import { noteSchema } from './schema'
import './notes.css'

/**
 * A note in reading mode. KaTeX, mermaid and highlight.js are fetched per note, only when
 * `noteFeatures` finds maths, a mermaid fence or a fenced language.
 */

const MermaidDiagram = lazy(() => import('./MermaidDiagram'))

/** `rehype-sanitize` always runs first, before KaTeX and highlight.js. */
const BASE_REHYPE: PluggableList = [[rehypeSanitize, noteSchema]]
const REMARK: PluggableList = [remarkGfm, remarkMath]

/** The library's own URL check, letting a mention's address through to `NoteLink` (FR-042). */
const keepMentions = (url: string) => (mentionOf(url) ? url : defaultUrlTransform(url))

/** A link in a note: a mention drawn as the reader draws them, else a way out of the app. */
function NoteLink({ href, children }: { href: string | undefined; children: ReactNode }) {
  const draw = useContext(MentionContext)
  const mention = mentionOf(href)
  if (mention) {
    const words = typeof children === 'string' ? children : String(children ?? '')
    // Without a reader to draw it, the words alone: its address goes nowhere outside the app.
    return draw ? draw({ ...mention, words }) : <span>{children}</span>
  }
  return (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  )
}

const components: Components = {
  /**
   * `pre`, not `code`: a diagram replaces the whole block, and a `<div>` inside `<pre>` is invalid.
   * The source is read off the hast node because `children` are already React elements.
   */
  pre({ node, children }) {
    const first = node?.children?.[0]
    if (first?.type === 'element' && first.tagName === 'code') {
      const className = first.properties?.className
      const classes = Array.isArray(className) ? className.map(String) : []
      // In any case: ```Mermaid is a diagram too.
      if (classes.some((c) => c.toLowerCase() === `language-${MERMAID_LANG}`)) {
        const source = first.children
          .map((child) => (child.type === 'text' ? child.value : ''))
          .join('')
        return (
          <Suspense fallback={<p className="my-3 text-ui text-subtle">Drawing…</p>}>
            <MermaidDiagram source={source} />
          </Suspense>
        )
      }
    }
    return <pre>{children}</pre>
  },
  /**
   * GFM's task-list checkbox, drawn as a mark: reading mode holds no controls. Named Checked/Empty
   * because accessible names match by substring, and Done is already a task status on this panel.
   */
  input({ checked }) {
    return (
      <span
        role="img"
        aria-label={checked ? 'Checked' : 'Empty'}
        className="relative top-px mr-1.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-key border border-line-strong align-text-top"
      >
        {checked && (
          <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" className="text-ink">
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
  /**
   * A mention (FR-042) is drawn by whoever reads the note, a chip in the app; any other link
   * leaves the app, so it opens in a new tab with no referrer.
   */
  a({ href, children }) {
    return <NoteLink href={href}>{children}</NoteLink>
  },
  /** A wide table scrolls itself, so the pane never scrolls sideways. */
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
        // KaTeX's self-hosted stylesheet, fetched only with this chunk.
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
              // Never guess: an unknown language stays plain text.
              detect: false,
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

  // Until a renderer arrives, the block shows the note's plain text.
  const rehypePlugins = [...BASE_REHYPE, ...(katex ?? []), ...(hljs ?? [])]

  return (
    <div data-note-md className="max-w-full">
      <Markdown
        remarkPlugins={REMARK}
        rehypePlugins={rehypePlugins}
        components={components}
        urlTransform={keepMentions}
      >
        {source}
      </Markdown>
    </div>
  )
}
