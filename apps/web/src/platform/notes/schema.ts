import { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize'

/**
 * The allowlist for rendered notes: GitHub's `defaultSchema`, unwidened. Raw HTML never reaches it
 * (there is no `rehype-raw`); it runs before KaTeX, which typesets with `trust: false`.
 */
export const noteSchema: SanitizeSchema = {
  ...defaultSchema,
  // A mention's address (FR-042) survives, to be drawn as a chip: `NoteMarkdown` never makes it a
  // link, so it cannot be followed.
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), 'ctws'],
  },
  // Dropped with their text: an element merely missing from `tagNames` is unwrapped, which would
  // print a `<style>`'s CSS as prose.
  strip: ['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript'],
}
