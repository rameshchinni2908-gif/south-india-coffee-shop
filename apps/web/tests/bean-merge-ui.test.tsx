import { ThemeProvider } from "@mui/material/styles";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BeanMergePage } from "../src/features/bean-merge/BeanMergePage.js";
import { CartProvider } from "../src/features/cart/CartProvider.js";
import {
  STORAGE_BEST_SCORE,
  STORAGE_SEEN_HOW_TO,
} from "../src/features/bean-merge/merge-contract.js";
import { theme } from "../src/theme.js";

const stubReducedMotion = (reduced: boolean): void => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? reduced : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
};

const renderPage = () =>
  render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={["/games/bean-merge"]}>
        <CartProvider>
          <BeanMergePage />
        </CartProvider>
      </MemoryRouter>
    </ThemeProvider>,
  );

/** How many cells currently hold a tile, read off the accessible names. */
const filledCellCount = (): number =>
  screen
    .getAllByRole("gridcell")
    .filter((cell) => !(cell.getAttribute("aria-label") ?? "").endsWith("empty")).length;

const scoreValue = (label: string): number => {
  const panel = screen.getByText(label).closest("div");

  return Number.parseInt(
    within(panel as HTMLElement).getAllByText(/^\d+$/)[0]?.textContent ?? "0",
    10,
  );
};

describe("Bean Merge UI", () => {
  beforeEach(() => {
    stubReducedMotion(false);
    window.localStorage.clear();
  });

  describe("how to play", () => {
    it("opens automatically on the first visit", async () => {
      renderPage();

      expect(
        await screen.findByRole("dialog", { name: /Bean Merge in three lines/i }),
      ).toBeInTheDocument();
    });

    it("stays closed once it has been seen", () => {
      window.localStorage.setItem(STORAGE_SEEN_HOW_TO, "true");
      renderPage();

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("records that it was seen when dismissed, and can be reopened", async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole("button", { name: "Got it" }));
      expect(window.localStorage.getItem(STORAGE_SEEN_HOW_TO)).toBe("true");

      // The dialog keeps the page behind it aria-hidden until it has finished
      // closing, so the reopen button only becomes reachable once it is gone.
      await user.click(await screen.findByRole("button", { name: "How to play" }));
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
    });
  });

  describe("the board", () => {
    beforeEach(() => {
      window.localStorage.setItem(STORAGE_SEEN_HOW_TO, "true");
    });

    it("opens a new game with exactly two tiles", () => {
      renderPage();

      expect(screen.getByRole("grid", { name: "Bean Merge board" })).toBeInTheDocument();
      expect(screen.getAllByRole("gridcell")).toHaveLength(16);
      expect(filledCellCount()).toBe(2);
    });

    it("labels every cell for a screen reader", () => {
      renderPage();

      const cells = screen.getAllByRole("gridcell");

      expect(cells[0]).toHaveAttribute("aria-label", expect.stringContaining("Row 1, column 1"));
      expect(cells[15]).toHaveAttribute("aria-label", expect.stringContaining("Row 4, column 4"));
    });

    /**
     * A move always spawns a tile, so after a keypress that changed the board the
     * count goes up. The engine test owns the merge rules; this only proves the
     * key handler is wired to it.
     */
    it("moves tiles with the arrow keys", async () => {
      const user = userEvent.setup();
      renderPage();

      const before = filledCellCount();

      await user.keyboard("{ArrowLeft}{ArrowUp}{ArrowRight}{ArrowDown}");

      expect(filledCellCount()).toBeGreaterThan(before);
    });

    it("also accepts WASD", async () => {
      const user = userEvent.setup();
      renderPage();

      const before = filledCellCount();

      await user.keyboard("aws d");

      expect(filledCellCount()).toBeGreaterThan(before);
    });
  });

  describe("controls", () => {
    beforeEach(() => {
      window.localStorage.setItem(STORAGE_SEEN_HOW_TO, "true");
    });

    it("disables undo until a move has been made, then enables it", async () => {
      const user = userEvent.setup();
      renderPage();

      expect(screen.getByRole("button", { name: /Undo/ })).toBeDisabled();

      await user.keyboard("{ArrowLeft}{ArrowUp}{ArrowRight}{ArrowDown}");

      expect(screen.getByRole("button", { name: /Undo/ })).toBeEnabled();
    });

    it("spends the undo step, so it cannot be used twice", async () => {
      const user = userEvent.setup();
      renderPage();

      await user.keyboard("{ArrowLeft}{ArrowUp}{ArrowRight}{ArrowDown}");
      await user.click(screen.getByRole("button", { name: /Undo/ }));

      expect(screen.getByRole("button", { name: /Undo/ })).toBeDisabled();
    });

    it("resets the score and the board on a new game", async () => {
      const user = userEvent.setup();
      renderPage();

      await user.keyboard("{ArrowLeft}{ArrowUp}{ArrowRight}{ArrowDown}");
      await user.click(screen.getByRole("button", { name: /New game/ }));

      expect(filledCellCount()).toBe(2);
      expect(scoreValue("Score")).toBe(0);
      expect(screen.getByRole("button", { name: /Undo/ })).toBeDisabled();
    });
  });

  describe("best score", () => {
    beforeEach(() => {
      window.localStorage.setItem(STORAGE_SEEN_HOW_TO, "true");
    });

    it("shows a stored best score on load", () => {
      window.localStorage.setItem(STORAGE_BEST_SCORE, "1234");
      renderPage();

      expect(scoreValue("Best")).toBe(1234);
    });

    it("ignores a corrupt stored value rather than rendering NaN", () => {
      window.localStorage.setItem(STORAGE_BEST_SCORE, "not-a-number");
      renderPage();

      expect(scoreValue("Best")).toBe(0);
    });

    it("survives localStorage being unavailable", () => {
      const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("blocked");
      });

      expect(() => renderPage()).not.toThrow();

      getItem.mockRestore();
    });
  });

  it("renders with reduced motion without throwing", () => {
    stubReducedMotion(true);
    window.localStorage.setItem(STORAGE_SEEN_HOW_TO, "true");
    renderPage();

    expect(screen.getByRole("grid", { name: "Bean Merge board" })).toBeInTheDocument();
  });
});
