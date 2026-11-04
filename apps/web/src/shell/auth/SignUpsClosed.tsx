import { LINK } from '../../platform/ui/buttonStyles'

/** Where someone who cannot sign up here is sent instead: the guide to running a copy of their own. */
export const DEPLOY_GUIDE = 'https://github.com/lance1416/ctws/blob/main/DEPLOY.md'

/** Why "Create an account" is greyed, said under it; the button names this by its id. */
export function SignUpsClosed({ id, className = '' }: { id: string; className?: string }) {
  return (
    <p id={id} className={`text-meta text-muted ${className}`}>
      Sign-ups are closed on this server. CTWS is open source, so you can{' '}
      <a className={LINK} href={DEPLOY_GUIDE}>
        run your own
      </a>
      .
    </p>
  )
}
