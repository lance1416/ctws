import { useNavigate } from 'react-router-dom'
import { Button } from '../../platform/ui/Button'

/**
 * THE PAGE COULD NOT BE DRAWN (FR-032): what happened in plain words and two ways on, in the
 * main area only, so the icon bar and the sidebar still work. On its own when the frame itself
 * or sign-in threw.
 */
export function RouteError() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-1 items-start justify-center p-6 sm:pt-16">
      <div
        role="alert"
        className="flex max-w-xl flex-col gap-2 rounded-block border border-line bg-panel p-5"
      >
        <h1 className="text-subject text-ink">Something went wrong on this page</h1>
        <p className="text-ui text-muted">
          This page could not be drawn. Reloading usually fixes it.
        </p>
        <div className="mt-1.5 flex gap-2">
          <Button look="secondary" onClick={() => navigate(-1)}>
            Go back
          </Button>
          <Button look="primary" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    </div>
  )
}
