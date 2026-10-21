import { HANG } from '../../platform/ui/hang'

/** Said where a link's item would open: a list left on its own reads like a broken link. */
export function GoneNotice({ kind }: { kind: string }) {
  return (
    <p role="alert" className={`mt-4 ${HANG} text-ui text-muted`}>
      This {kind} is not here any more.
    </p>
  )
}
