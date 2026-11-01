import { Component, type ReactNode } from 'react';
import { translate } from './i18n';
import { uiStore } from '../stores/ui-store';
import { downloadProject } from './actions';

/** Last line of defence: shows what failed and still lets the operator rescue their work. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const lang = uiStore.get().lang;
    return (
      <main className="crash" role="alert">
        <h1>{translate(lang, 'toast.failed', { why: error.message })}</h1>
        <div className="btn-row">
          <button type="button" className="btn" onClick={downloadProject}>{translate(lang, 'export.project')}</button>
          <button type="button" className="btn primary" onClick={() => location.reload()}>↻</button>
        </div>
      </main>
    );
  }
}
