import { useEffect, useRef, useState } from 'react'
import { purifyDiagram, scopeDiagramStyles, sizeDiagram } from './mermaidSvg'

/**
 * ONE MERMAID FENCE, RENDERED.
 *
 * This module is the LAZY half of the diagram feature: nothing here, and nothing it imports, is
 * reachable from the app's entry graph except through `import('./MermaidDiagram')`, which
 * `NoteMarkdown` only ever evaluates for a note that really contains a `mermaid` fence. The
 * containment story -- all four layers of it, and the one layer that is missing -- is written at the
 * top of `mermaidSvg.ts`.
 */

/** Ids have to be valid CSS selectors (mermaid builds its own stylesheet out of them), so this is
 * a plain counter rather than `useId`, whose output contains `:` and `«»`. */
let seq = 0

/** The app's own theme, read off the live custom properties, so a diagram is not the one thing on
 * the page that ignores light/dark. `theme: 'base'` is the only mermaid theme that takes these. */
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
  // A diagram drawn in light-mode colours and then looked at in dark mode is unreadable, and the
  // colours are baked into the svg at render time, so the scheme is a render input.
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    let live = true
    const id = `ctws-diagram-${++seq}`
    void (async () => {
      try {
        const { default: mermaid } = await import('mermaid')
        mermaid.initialize({
          // Layer 2 of the containment. `strict` is mermaid's own default, and it is written out
          // here because this is the one setting whose default must never drift silently.
          securityLevel: 'strict',
          startOnLoad: false,
          // `htmlLabels: false` on every family that offers it: a label rendered as HTML is a
          // `<foreignObject>` full of markup, and DOMPurify's svg profile drops `foreignObject`
          // outright -- so a label asked for in HTML would simply vanish. SVG `<text>` survives.
          htmlLabels: false,
          flowchart: { htmlLabels: false },
          class: { htmlLabels: false },
          // Bounds on how much work one note can ask for. Mermaid's own defaults are 50000/500, and
          // both keys are in mermaid's `secure` list, so a diagram cannot raise them back.
          maxTextSize: 20000,
          maxEdges: 200,
          theme: 'base',
          themeVariables: themeVariables(),
        })
        const { svg } = await mermaid.render(id, source)
        // `bindFunctions` is NOT called, on purpose: that is what turns a diagram's `click`
        // directives into live listeners. See mermaidSvg.ts, layer 2.
        if (!live) return
        const node = host.current
        if (!node) return
        // Adopted as NODES, never as a string: `purifyDiagram` returns the fragment DOMPurify
        // built, so nothing is serialised and re-parsed between sanitising and displaying. The
        // stylesheet is narrowed once the fragment is in the document, which is when it has a
        // `.sheet` to narrow.
        node.replaceChildren(purifyDiagram(svg))
        scopeDiagramStyles(node, id)
        sizeDiagram(node)
        setState('ready')
      } catch (err) {
        // A diagram that does not parse is a typo in a note, not a broken app. Say so, and keep
        // the source visible so the typo can be found.
        if (!live) return
        setFailure(err instanceof Error ? err.message : "Couldn't draw the diagram")
        setState('failed')
      }
    })()
    return () => {
      live = false
    }
  }, [source, dark])

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
      {/* Always mounted, and always empty as far as React is concerned: its children are the
          sanitised fragment, put there by the effect above. React never renders into it, so the
          two cannot fight over it. */}
      <div
        ref={host}
        data-note-diagram={state}
        className={`overflow-x-auto ${state === 'ready' ? 'my-3' : 'hidden'}`}
      />
    </>
  )
}
