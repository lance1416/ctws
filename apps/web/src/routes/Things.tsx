import { Link } from 'react-router-dom'
import { allChords, kinds } from '../modules/registry'
import { useCrumbs } from '../components/Location'

/**
 * THINGS: every kind of thing, one row each.
 *
 * This is where the kinds live instead of the rail. The rail would otherwise grow by a row with
 * every kind added until it stopped being scannable; here a new kind is one more row on a page
 * that is about nothing else. A kind with nothing in it is listed all the same, because a kind
 * hidden until it has content is a kind nobody learns they have.
 */
export function Things() {
  useCrumbs([{ label: 'Things' }])
  const keys = new Map(allChords().map((c) => [c.id, c.key]))
  return (
    <>
      <h1 className="text-xl font-semibold">Things</h1>
      <ul className="mt-4 flex max-w-[48rem] flex-col">
        {kinds().map(({ label, to, Count, Status, chord }) => {
          const key = chord ? keys.get(chord) : undefined
          return (
            <li key={label} data-kind={label} className="flex items-start gap-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-baseline gap-2.5">
                  <Link to={to} className="text-lg font-semibold text-fg hover:underline">
                    {label}
                  </Link>
                  {Count && (
                    <span className="text-sm text-fg-muted tabular-nums">
                      <Count />
                    </span>
                  )}
                </div>
                {Status && (
                  <span className="text-sm text-fg-subtle">
                    <Status />
                  </span>
                )}
              </div>
              {key && (
                <kbd className="mt-1 shrink-0 rounded border border-border-strong px-1.5 text-xs text-fg-subtle">
                  g {key}
                </kbd>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
