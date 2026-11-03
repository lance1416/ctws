/**
 * A whole page's text at a readable length (REQ-002 FR-109, artboard 37), centred: 45 of the
 * drawn text's em. The source stops at eighty of its own mono characters (FR-116, artboard 39),
 * counted in the face's own `ch`, so a system that draws them narrower or wider still gets eighty;
 * the half rem either side is the content's own padding.
 */
export const readableWidth = (source: boolean) =>
  source
    ? 'mx-auto max-w-[45em] text-prose [&_.cm-src_.cm-content]:max-w-[calc(80ch+1rem)]'
    : 'mx-auto max-w-[45em] text-prose'
