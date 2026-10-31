/**
 * A downloaded note's file name (FR-111): what it is called, without what a file system forbids,
 * then `.md`. Chinese and spaces stay: they are the name.
 */
export function fileNameOf(title: string): string {
  const name = title
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 120)
    .trim()
  return `${name || 'Note'}.md`
}
