import { lazy, Suspense } from 'react'

/**
 * THE SEAM THAT KEEPS MARKDOWN OFF EVERY PAGE LOAD.
 *
 * D73's second decision is 「按需加载」, and the first thing that has to be on demand is the
 * renderer itself. This app is opened twenty times a day, usually to look at 今天 and close it
 * again; a visit that never opens a task must not pay for `react-markdown` at all. So the whole
 * Markdown pipeline sits behind this one dynamic import, and the three costs are now staged:
 *
 *   app load                -> nothing
 *   a task with a note open -> the Markdown core chunk
 *   a note containing maths -> + KaTeX
 *   a note containing a diagram -> + mermaid
 *
 * THE FALLBACK IS THE OLD READING MODE, exactly: the note's own text with its own line breaks.
 * That is not a placeholder chosen for looks -- it means a note is READABLE the instant the pane
 * opens, with no spinner and no empty box, and that Markdown only ever replaces prose with better
 * prose. It is also why `data-detail-notes` contains the note's words on the first frame, which is
 * what `pane.spec.ts` has always asserted.
 */
const NoteMarkdown = lazy(() => import('./NoteMarkdown'))

export function NoteBody({ source }: { source: string }) {
  return (
    <Suspense fallback={<p className="whitespace-pre-wrap text-fg">{source}</p>}>
      <NoteMarkdown source={source} />
    </Suspense>
  )
}
