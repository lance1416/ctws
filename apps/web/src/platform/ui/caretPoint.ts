/** What a copy of the box has to share with it for its text to wrap the same way. */
const COPIED = [
  'boxSizing',
  'width',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'tabSize',
  'textIndent',
  'textTransform',
  'wordSpacing',
] as const

/**
 * Where in a text box a position of its text is drawn, from the box's top left and after its
 * scroll: the top and bottom of that line, and its left. A box does not say where its caret is, so
 * an unseen copy of it, wrapping the text the same way, is measured instead.
 */
export function caretPoint(
  box: HTMLTextAreaElement,
  at: number,
): { left: number; top: number; bottom: number } {
  const style = getComputedStyle(box)
  const copy = document.createElement('div')
  for (const p of COPIED) copy.style[p] = style[p]
  copy.style.position = 'absolute'
  copy.style.visibility = 'hidden'
  copy.style.whiteSpace = 'pre-wrap'
  copy.style.overflowWrap = 'break-word'
  copy.style.top = '0'
  copy.style.left = '-9999px'
  copy.textContent = box.value.slice(0, at)
  const mark = document.createElement('span')
  // Something to measure even at the end of a line.
  mark.textContent = box.value.slice(at) || '.'
  copy.appendChild(mark)
  document.body.appendChild(copy)
  const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5
  const point = {
    left: mark.offsetLeft - box.scrollLeft,
    top: mark.offsetTop - box.scrollTop,
    bottom: mark.offsetTop - box.scrollTop + line,
  }
  copy.remove()
  return point
}
