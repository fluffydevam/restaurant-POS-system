import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/**
 * Catches render errors so a single broken page never blanks the whole app.
 * Full reloads keep the fix simple; state here is not worth preserving when
 * the tree failed to render.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack)
  }

  render() {
    const { error } = this.state

    if (!error) return this.props.children

    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 px-4">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6">
          <p className="text-xs uppercase tracking-widest text-red-300">Something went wrong</p>
          <h1 className="mt-2 text-lg font-semibold">This page could not be displayed.</h1>
          <p className="mt-2 text-sm text-slate-400">
            The rest of your data is safe. Reload the page to get back to work.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-lg border border-white/5 bg-slate-950/60 p-3 text-xs text-red-200">
            {error.message}
          </pre>
          <button
            type="button"
            className="mt-4 w-full rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
            onClick={() => window.location.reload()}
          >
            Reload the page
          </button>
        </div>
      </div>
    )
  }
}
