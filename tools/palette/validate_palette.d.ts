// Types for the vendored validator beside this file, which is plain JS and not edited here.

/** One check: its name, `pass`, `fail` or another state, and what it found. */
type Check = [name: string, state: string, detail: string]

export function validate(
  palette: readonly string[],
  options?: { mode?: 'light' | 'dark'; surface?: string; pairs?: 'adjacent' | 'all' },
): { report: Check[]; ok: boolean }

/** The WCAG contrast ratio of two hex colours. */
export function contrast(a: string, b: string): number
