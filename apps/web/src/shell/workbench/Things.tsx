import { Link } from 'react-router-dom'
import { allChords, kinds } from '../registry'
import { useCrumbs } from '../layout/Location'
import { KeyHint } from '../../platform/ui/KeyHint'
import { MARGIN } from '../rows/RowLead'
import { BODY_GUTTER, ProjectRail } from '../rows/RowParts'

/**
 * THINGS: every kind of thing, one row each.
 *
 * This is where the kinds live instead of the rail. The rail would otherwise grow by a row with
 * every kind added until it stopped being scannable; here a new kind is one more row on a page
 * that is about nothing else. A kind with nothing in it is listed all the same, because a kind
 * hidden until it has content is a kind nobody learns they have.
 *
 * On the app's row: the key that goes there in the margin, a thread in the hairline's colour (a
 * kind is no line of work), and the body -- the name, how many, and what is current -- one link.
 */
export function Things() {
  useCrumbs([{ label: 'Things' }])
  const keys = new Map(allChords().map((c) => [c.id, c.key]))
  return (
    <>
      <h1 className="ml-15 text-2xl font-semibold tracking-[-0.02em] sm:ml-18">Things</h1>
      <ul className="mt-7 flex max-w-[48rem] flex-col">
        {kinds().map(({ label, to, Count, Status, chord }) => {
          const key = chord ? keys.get(chord) : undefined
          return (
            <li key={label} data-kind={label} className="flex min-h-19 min-w-0">
              <span
                className={`flex shrink-0 items-start justify-end pt-3.5 pr-2 sm:pr-3.5 ${MARGIN}`}
              >
                {key && (
                  <KeyHint className="rounded border border-rule-strong px-1.5 text-xs whitespace-nowrap text-ink-subtle">
                    g {key}
                  </KeyHint>
                )}
              </span>
              <ProjectRail projectId={null} />
              <Link
                to={to}
                className={`flex min-w-0 flex-1 flex-col py-3 pr-2 pl-[var(--gutter)] hover:bg-hover ${BODY_GUTTER}`}
              >
                <span className="flex items-baseline gap-2.5">
                  <span className="text-lg font-semibold text-ink">{label}</span>
                  {Count && (
                    <span className="text-sm text-ink-muted tabular-nums">
                      <Count />
                    </span>
                  )}
                </span>
                {Status && (
                  <span className="text-sm text-ink-subtle">
                    <Status />
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}
