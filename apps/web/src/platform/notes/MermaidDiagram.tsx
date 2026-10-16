import { problemText } from '../http/api'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { onSchemeChange, shownScheme } from '../ui/theme'
import { purifyDiagram, scopeDiagramStyles, sizeDiagram } from './mermaidSvg'

/** A counter, not `useId`: mermaid builds CSS selectors from the id, and `useId` emits `:`. */
let seq = 0

/** The app's theme, read off its custom properties; only mermaid's `base` theme takes these. */
function themeVariables(): Record<string, string> {
  const css = getComputedStyle(document.documentElement)
  const token = (name: string) => css.getPropertyValue(name).trim()
  return {
    background: token('--color-desk'),
    primaryColor: token('--color-sheet'),
    primaryTextColor: token('--color-ink'),
    primaryBorderColor: token('--color-rule-strong'),
    secondaryColor: token('--color-hover'),
    tertiaryColor: token('--color-chrome'),
    lineColor: token('--color-rule-strong'),
    textColor: token('--color-ink'),
    mainBkg: token('--color-sheet'),
    nodeBorder: token('--color-rule-strong'),
    clusterBkg: token('--color-chrome'),
    clusterBorder: token('--color-rule'),
    edgeLabelBackground: token('--color-desk'),
    fontFamily: token('--font-sans'),
    fontSize: '14px',
  }
}

export default function MermaidDiagram({ source }: { source: string }) {
  const host = useRef<HTMLDivElement | null>(null)
  const [state, setState] = useState<'drawing' | 'ready' | 'failed'>('drawing')
  const [failure, setFailure] = useState('')
  // Colours are baked into the svg, so the scheme the page shows (picked in the menu, else the
  // system's) is a render input.
  const scheme = useSyncExternalStore(onSchemeChange, shownScheme)

  useEffect(() => {
    let live = true
    const id = `ctws-diagram-${++seq}`
    void (async () => {
      try {
        const { default: mermaid } = await import('mermaid')
        mermaid.initialize({
          // Mermaid's default, written out so it cannot drift.
          securityLevel: 'strict',
          startOnLoad: false,
          // An HTML label is a `<foreignObject>`, which the sanitiser drops; SVG `<text>` survives.
          htmlLabels: false,
          flowchart: { htmlLabels: false },
          class: { htmlLabels: false },
          // Bounds on one note's work. Both keys are in mermaid's `secure` list, so a diagram
          // cannot raise them.
          maxTextSize: 20000,
          maxEdges: 200,
          theme: 'base',
          themeVariables: themeVariables(),
        })
        const { svg } = await mermaid.render(id, source)
        // `bindFunctions` is never called: it turns a diagram's `click` directives into listeners.
        if (!live) return
        const node = host.current
        if (!node) return
        // Adopted as nodes, never re-parsed from a string; styles are scoped once in the document.
        node.replaceChildren(purifyDiagram(svg))
        scopeDiagramStyles(node, id)
        sizeDiagram(node)
        setState('ready')
      } catch (err) {
        if (!live) return
        setFailure(problemText(err) ?? "Couldn't draw the diagram")
        setState('failed')
      }
    })()
    return () => {
      live = false
    }
  }, [source, scheme])

  return (
    <>
      {state === 'drawing' && <p className="my-3 text-sm text-ink-subtle">Drawing…</p>}
      {state === 'failed' && (
        <div className="my-3">
          <p className="text-sm text-missed">Couldn't draw the diagram: {failure}</p>
          <pre className="mt-1 overflow-x-auto rounded-md bg-desk p-3 text-sm">
            <code>{source}</code>
          </pre>
        </div>
      )}
      {/* Empty to React: the effect fills it, so the two never fight over it. */}
      <div
        ref={host}
        data-note-diagram={state}
        className={`overflow-x-auto ${state === 'ready' ? 'my-3' : 'hidden'}`}
      />
    </>
  )
}
