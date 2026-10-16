/**
 * The app's line glyphs, each a path on one 16px canvas, stroked in the text's colour with round
 * ends. Glyph characters like ▸ and ⋮⋮ differ in size and baseline from one OS font to the next.
 */
const GLYPHS = {
  /** The ✕ of every close and remove button. */
  close: 'M4 4l8 8M12 4l-8 8',
  /** The + of an "add" beside other controls. */
  plus: 'M8 3.5v9M3.5 8h9',
  /**
   * The + that stands alone as a row's or a block's add. Half a unit longer each way than `plus`;
   * merging the two would move pixels, so it waits for a design pass.
   */
  plusLong: 'M8 3v10M3 8h10',
  /** A menu's or a folded section's ⌄. */
  chevronDown: 'M4 6.5l4 4 4-4',
  /** The tree's open (⌄) and folded (›) chevrons, a size up. */
  treeOpen: 'M3.5 6l4.5 4.5L12.5 6',
  treeFolded: 'M6 3.5l4.5 4.5L6 12.5',
} as const

export function Icon({
  glyph,
  className,
  strokeWidth = 1.5,
  size,
}: {
  glyph: keyof typeof GLYPHS
  className?: string
  strokeWidth?: number
  /** In px, when no class sizes it. */
  size?: number
}) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width={size} height={size} className={className}>
      <path
        d={GLYPHS[glyph]}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
