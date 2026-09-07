import { Component, type ReactNode } from "react";

import { CoffeeCup } from "./CoffeeCup.js";

export class RouteErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  public override state = { hasError: false };

  public static getDerivedStateFromError() {
    return { hasError: true };
  }

  public override render() {
    if (this.state.hasError) {
      return (
        <main className="page-loading page-load-error">
          <CoffeeCup />
          <div role="alert">
            <h1>We couldn’t open this page</h1>
            <p>Check your connection, then try loading it again.</p>
          </div>
          <button type="button" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}
