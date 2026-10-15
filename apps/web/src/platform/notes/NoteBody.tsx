import { lazy, Suspense } from 'react'

/**
 * Markdown sits behind this import, so a visit that opens no note never pays for it. The fallback
 * is the note's own text, readable on the first frame.
 */
const NoteMarkdown = lazy(() => import('./NoteMarkdown'))

export function NoteBody({ source }: { source: string }) {
  return (
    <Suspense fallback={<p className="whitespace-pre-wrap text-ink">{source}</p>}>
      <NoteMarkdown source={source} />
    </Suspense>
  )
}
