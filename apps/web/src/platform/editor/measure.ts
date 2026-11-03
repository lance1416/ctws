/**
 * The source width is counted in the face's own `ch`, so a system that draws it narrower or wider
 * still gets eighty characters; the half rem either side is the content's own padding.
 */
export const readableWidth = (source: boolean) =>
  source
    ? 'mx-auto max-w-[45em] text-prose [&_.cm-src_.cm-content]:max-w-[calc(80ch+1rem)]'
    : 'mx-auto max-w-[45em] text-prose'
