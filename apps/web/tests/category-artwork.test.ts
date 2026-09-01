import { describe, expect, it } from "vitest";

import { getCategoryArtwork } from "../src/features/menu/category-artwork.js";

describe("category fallback artwork", () => {
  it.each([
    ["coffee", "Coffee", "/images/categories/coffee.jpg"],
    ["tea", "Tea", "/images/categories/tea.jpg"],
    ["breakfast", "Breakfast", "/images/categories/breakfast.jpg"],
    ["snacks", "Snacks", "/images/categories/snacks.jpg"],
    ["packaged-products", "Packaged Products", "/images/categories/packaged-products.jpg"],
  ])("maps %s to its own artwork", (slug, name, expectedSource) => {
    expect(getCategoryArtwork(slug, name)).toBe(expectedSource);
  });

  it("keeps the generic placeholder for unknown categories", () => {
    expect(getCategoryArtwork("seasonal", "Seasonal specials")).toBeUndefined();
  });
});
