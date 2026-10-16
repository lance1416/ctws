import { useNavigate } from 'react-router-dom'
import { BUTTON } from '../../platform/ui/buttonStyles'

/**
 * What a route shows when it throws while drawing, instead of a blank page: what happened in plain
 * words, and two ways on. Inside the frame for a page, on its own for the frame itself.
 */
export function RouteError() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-1 items-start justify-center bg-sheet p-6 sm:pt-16">
      <div role="alert" className="max-w-prose">
        <h1 className="text-lg font-semibold text-ink">Something went wrong on this page</h1>
        <p className="mt-2 text-sm text-ink-muted">
          This page could not be drawn. Reloading usually fixes it.
        </p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => navigate(-1)} className={BUTTON.secondary}>
            Go back
          </button>
          <button type="button" onClick={() => window.location.reload()} className={BUTTON.primary}>
            Reload
          </button>
        </div>
      </div>
    </div>
  )
}
