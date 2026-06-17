import { Component } from 'react';

// Error boundary with two recovery paths:
//  1. `resetKey` — when the route changes, the parent passes a new key and the
//     boundary clears its error automatically. This stops a single page-level
//     render crash from poisoning the whole session (the user just navigates away
//     and the app recovers without a reload).
//  2. "Try again" — re-renders the current subtree in place without a full reload.
//
// It still logs the full error + component stack + path to the console so the
// failing component is identifiable in production.
export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }

  componentDidCatch(error, info) {
    console.error('Render error:', {
      message: error?.message,
      stack: error?.stack,
      componentStack: info?.componentStack,
      path: typeof window !== 'undefined' ? window.location.pathname + window.location.search : '',
    });
  }

  componentDidUpdate(prevProps) {
    // Clear the error when the route (resetKey) changes so navigation recovers.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="card p-8 max-w-md text-center">
            <div className="text-3xl mb-3">⚠️</div>
            <h1 className="h-display text-xl text-mist-100">Something went wrong</h1>
            <p className="text-sm text-mist-400 mt-2">An unexpected error occurred while rendering this page. Try again, or head back to safety.</p>
            <div className="flex gap-2 justify-center mt-5">
              <button className="btn-primary btn-sm" onClick={() => this.setState({ error: null })}>Try again</button>
              <button className="btn-ghost btn-sm" onClick={() => window.location.reload()}>Reload</button>
              <a href="/" className="btn-ghost btn-sm">Go home</a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
