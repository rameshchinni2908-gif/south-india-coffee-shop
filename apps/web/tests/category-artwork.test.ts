import { describe, expect, it } from "vitest";

import {
  getCategoryArtwork,
  getCategoryArtworkSrcSet,
} from "../src/features/menu/category-artwork.js";

describe("category fallback artwork", () => {
  it.each([
    ["coffee", "Coffee", "coffee-768.jpg"],
    ["tea", "Tea", "tea-768.jpg"],
    ["breakfast", "Breakfast", "breakfast-768.jpg"],
    ["snacks", "Snacks", "snacks-768.jpg"],
    ["packaged-products", "Packaged Products", "packaged-products-768.jpg"],
  ])("maps %s to its own artwork", (slug, name, expectedSource) => {
    const source = getCategoryArtwork(slug, name);
    expect(source).toContain(expectedSource);
    expect(getCategoryArtworkSrcSet(source)).toContain(`${slug}-480.jpg 480w`);
    expect(getCategoryArtworkSrcSet(source)).toContain(`${expectedSource} 768w`);
  });

  it("keeps the generic placeholder for unknown categories", () => {
    expect(getCategoryArtwork("seasonal", "Seasonal specials")).toBeUndefined();
    expect(getCategoryArtworkSrcSet(undefined)).toBeUndefined();
  });
});
