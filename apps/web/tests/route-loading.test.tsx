import { render, screen } from "@testing-library/react";
import { lazy, Suspense } from "react";
import { describe, expect, it, vi } from "vitest";

import { PageLoading } from "../src/components/PageLoading.js";
import { RouteErrorBoundary } from "../src/components/RouteErrorBoundary.js";

describe("page code loading", () => {
  it("offers a reload when a lazy page download fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const FailedPage = lazy(() =>
      Promise.reject(new Error("Failed to fetch dynamically imported module")),
    );
    render(
      <RouteErrorBoundary>
        <Suspense fallback={<PageLoading />}>
          <FailedPage />
        </Suspense>
      </RouteErrorBoundary>,
    );
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading menu");
    expect(await screen.findByRole("alert")).toHaveTextContent(/Check your connection/);
    expect(screen.getByRole("button", { name: "Reload page" })).toBeVisible();
    expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
  });
});
