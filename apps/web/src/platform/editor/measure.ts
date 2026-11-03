/**
 * A whole page's text at a readable length (REQ-002 FR-109, artboard 37), centred: 45 of the
 * drawn text's em; the source, eighty of its mono characters (FR-116, artboard 39), each 0.6 of
 * its 14, 672, and 4 to spare, as a character's width rounds differently from one system to
 * another: eighty-one would take 680.
 */
export const readableWidth = (source: boolean) =>
  source ? 'mx-auto max-w-[42.25rem]' : 'mx-auto max-w-[45em] text-prose'
