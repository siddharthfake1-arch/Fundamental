import { Component } from 'react';

// Top-level error boundary: a single render throw used to white-screen the whole
// SPA. Now it shows a recoverable fallback instead.
export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('Render error:', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-ink-950">
          <div className="card p-8 max-w-md text-center">
            <div className="text-3xl mb-3">⚠️</div>
            <h1 className="h-display text-xl text-mist-100">Something went wrong</h1>
            <p className="text-sm text-mist-400 mt-2">An unexpected error occurred while rendering this page. Reloading usually fixes it.</p>
            <div className="flex gap-2 justify-center mt-5">
              <button className="btn-primary btn-sm" onClick={() => window.location.reload()}>Reload</button>
              <a href="/" className="btn-ghost btn-sm">Go home</a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
