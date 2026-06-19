import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * App-level error boundary. Without one, any render error anywhere unmounts the
 * whole React tree and the user sees a blank white screen with no information.
 * This catches such errors and shows a recoverable fallback that also surfaces
 * the underlying message so problems can be diagnosed instead of silently
 * blanking the page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep a console trail for debugging in addition to the on-screen message.
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
        <div className="flex max-w-md flex-col items-center gap-3">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            The page hit an unexpected error and couldn&apos;t be displayed. You
            can reload to try again. If it keeps happening, share the message
            below.
          </p>
          <pre className="max-h-40 w-full overflow-auto rounded-md border bg-muted/40 p-3 text-left text-xs text-destructive">
            {error.message || String(error)}
          </pre>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Reload
            </button>
            <a
              href="/"
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Go to start
            </a>
          </div>
        </div>
      </div>
    );
  }
}
