import type { Page } from '@playwright/test'

/**
 * WHAT A FINGER PRESSES, MEASURED (DES-001 "44 和看起来的大小", FR-082): every target that shows
 * on the page, scrolled out of view or not, by what takes the press: the element, the label round
 * an input, the card a link is stretched over, or the unseen square `tap` puts under it,
 * whichever is largest. QA's sweep measures the same way (BUG-071).
 */
export const PHONE = { width: 390, height: 844 }

/** What may be under 44: a link or a mention inside a note's own text. */
const INLINE = ['[data-note-md] *']

const TARGETS =
  'button, a[href], [role=tab], [role=radio], [role=option], input:not([type=hidden]), select, textarea'

/** Every target on the page that shows and is under 44 either way, by its name and size. */
export async function undersized(page: Page): Promise<string[]> {
  return page.evaluate(
    ({ targets, inline }) => {
      const out: string[] = []
      for (const el of document.querySelectorAll<HTMLElement>(targets)) {
        if (inline.some((s) => el.matches(s))) continue
        // An input is pressed through what is drawn for it: its label, or, hidden with none (a
        // radio drawn as a chip, a swatch), the control it sits in. Measured there, not skipped.
        let hit: Element = el
        if (el.tagName === 'INPUT') {
          const input = el as HTMLInputElement
          const label = input.closest('label') ?? input.labels?.[0] ?? null
          const r0 = input.getBoundingClientRect()
          const hidden =
            input.closest('.sr-only') !== null ||
            getComputedStyle(input).opacity === '0' ||
            r0.width <= 2 ||
            r0.height <= 2
          // A field that shows its own box is pressed there; the label counts round it.
          const wrapping = input.closest('label')
          if (!hidden) {
            if (wrapping) hit = wrapping
          } else if (label) hit = label
          else
            for (let up = input.parentElement; up; up = up.parentElement) {
              const r = up.getBoundingClientRect()
              if (r.width > 2 && r.height > 2) {
                hit = up
                break
              }
            }
        }
        const shown = hit === el ? el : (hit as HTMLElement)
        if (!shown.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue
        if (shown.closest('[aria-hidden="true"]')) continue
        if (hit === el && el.closest('.sr-only')) continue
        // A link stretched over its card by an `after:inset-0` is pressed as the card.
        const after = getComputedStyle(el, '::after')
        if (after.content !== 'none' && after.position === 'absolute') {
          for (let up = el.parentElement; up; up = up.parentElement)
            if (getComputedStyle(up).position !== 'static') {
              hit = up
              break
            }
        }
        const r = hit.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        // `tap`: an unseen square under the target, pressed for it.
        const before = getComputedStyle(hit, '::before')
        const pad =
          before.content !== 'none' && before.position === 'absolute'
            ? [parseFloat(before.width), parseFloat(before.height)]
            : [0, 0]
        const [w, h] = [Math.max(r.width, pad[0]!), Math.max(r.height, pad[1]!)]
        if (w >= 43.5 && h >= 43.5) continue
        const name = (el.getAttribute('aria-label') ?? hit.textContent ?? '').trim().slice(0, 40)
        out.push(`${el.tagName.toLowerCase()} "${name}" ${Math.round(w)}×${Math.round(h)}`)
      }
      return out
    },
    { targets: TARGETS, inline: INLINE },
  )
}
