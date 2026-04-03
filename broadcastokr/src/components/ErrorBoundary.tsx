import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { PRIMARY_COLOR } from '../constants/config';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16, padding: 40, background: '#0F1729', color: '#E8EDF5' }}>
          <span style={{ fontSize: 48 }}>{'\u26A0\uFE0F'}</span>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: '#7A8BA5', textAlign: 'center', maxWidth: 400, margin: 0 }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: PRIMARY_COLOR, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: '10px 20px', borderRadius: 8, border: `1px solid ${PRIMARY_COLOR}`, background: 'transparent', color: PRIMARY_COLOR, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              Reload App
            </button>
            <button
              onClick={() => {
                const data = localStorage.getItem('broadcastokr-data');
                if (!data) return;
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `broadcastokr-backup-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #2A3855', background: 'transparent', color: '#7A8BA5', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              Export Data
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
