import { Component } from 'react';
import { reportError } from '../lib/errorReport.js';

/** If a page crashes, show a friendly message instead of a blank screen, and tell us. Reset by navigating (see `resetKey`). */
export default class ErrorBoundary extends Component {
  state = { failed: false, key: this.props.resetKey };
  static getDerivedStateFromProps(props, state) { return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err) { reportError(`Page crashed: ${err?.message || err}`); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main id="main" className="page" style={{ paddingTop: 120, textAlign: 'center' }} role="alert">
        <div className="container" style={{ maxWidth: 480 }}>
          <h1 style={{ fontSize: 'clamp(32px, 6vw, 48px)', marginBottom: 12 }}>Something went wrong</h1>
          <p style={{ color: 'var(--muted)', marginBottom: 24 }}>Sorry, this page hit a problem. Your bag is safe. Try again, or go back to the shop.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={() => window.location.reload()}>Try again</button>
            <a className="btn" href="/">Back to Home</a>
          </div>
        </div>
      </main>
    );
  }
}
