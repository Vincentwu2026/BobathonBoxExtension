import { Component, type ErrorInfo, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}
interface State {
  failed: boolean;
}

/** Last line of defence so a rendering bug shows a message instead of a blank page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('UI error:', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-auto mt-16 max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm">
        <TriangleAlert className="mx-auto h-8 w-8 text-warning" aria-hidden="true" />
        <h2 className="mt-3 text-lg font-semibold">Something went wrong</h2>
        <p className="mt-1 text-sm text-muted-foreground">The page hit an unexpected error. Your data is unaffected.</p>
        <Button className="mt-4" onClick={() => this.setState({ failed: false })}>
          Try again
        </Button>
      </div>
    );
  }
}
