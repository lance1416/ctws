import { Link } from 'react-router-dom'
import { useRegistry } from '../registry'
import { KeyHint } from '../../platform/ui/KeyHint'
import { HANG_WIDTH } from '../../platform/ui/hang'
import { ProjectRail, ROW_BODY } from '../rows/RowParts'
import { HANG } from '../../platform/ui/hang'

/**
 * Every kind of thing, one row each with its `g` key in the margin. Empty kinds are listed too,
 * or nobody would learn they exist.
 */
export function Things() {
  const registry = useRegistry()
  const keys = new Map(registry.chords.map((c) => [c.id, c.key]))
  return (
    <>
      <h1 className={`${HANG} text-2xl font-semibold tracking-[-0.02em]`}>Things</h1>
      <ul className="mt-7 flex max-w-[48rem] flex-col">
        {registry.kinds.map(({ label, to, Count, Status, chord }) => {
          const key = chord ? keys.get(chord) : undefined
          return (
            <li key={label} data-kind={label} className="flex min-h-19 min-w-0">
              <span
                className={`flex shrink-0 items-start justify-end pt-3.5 pr-2 sm:pr-3.5 ${HANG_WIDTH}`}
              >
                {key && (
                  <KeyHint className="rounded border border-rule-strong px-1.5 text-xs whitespace-nowrap text-ink-subtle">
                    g {key}
                  </KeyHint>
                )}
              </span>
              <ProjectRail projectId={null} />
              <Link to={to} className={`${ROW_BODY} flex-col py-3 pr-2 hover:bg-hover`}>
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
