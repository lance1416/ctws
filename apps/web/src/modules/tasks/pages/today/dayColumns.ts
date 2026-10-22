/**
 * TODAY ACROSS THE PAGE'S COLUMNS (DES-001 section 4, artboards 12 and 31): the three task blocks
 * take half the columns, two at least; the blocks beside them take the rest. With two columns or
 * fewer the task blocks take the whole row and the others go under them, as many across.
 */
export function todayColumns(columns: number): { tasks: number; side: number } {
  const tasks = Math.min(columns, Math.max(2, Math.ceil(columns / 2)))
  return { tasks, side: columns > tasks ? columns - tasks : columns }
}

/**
 * The blocks beside the task blocks, in order, across `columns`: one a column while they last, and
 * any left over under the last columns' (artboard 31: This week and Birthdays share the last). A
 * column left without a block is not returned.
 */
export function inColumns<T>(blocks: readonly T[], columns: number): T[][] {
  const each = Math.floor(blocks.length / columns)
  const over = blocks.length % columns
  const out: T[][] = []
  let from = 0
  for (let i = 0; i < columns; i++) {
    const n =
      blocks.length <= columns ? (i < blocks.length ? 1 : 0) : each + (i >= columns - over ? 1 : 0)
    if (n > 0) out.push(blocks.slice(from, from + n))
    from += n
  }
  return out
}
