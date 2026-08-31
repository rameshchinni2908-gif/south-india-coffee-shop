import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClientError, apiGet } from "../src/lib/api-client.js";

describe("api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a safe error when a hosting service sends a non-JSON failure page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response("<html>Service unavailable</html>", {
          status: 503,
          headers: { "Content-Type": "text/html" },
        }),
      ),
    );

    await expect(apiGet("/api/health")).rejects.toEqual(
      new ApiClientError(
        503,
        "REQUEST_FAILED",
        "The service is temporarily unavailable. Please try again.",
      ),
    );
  });
});
