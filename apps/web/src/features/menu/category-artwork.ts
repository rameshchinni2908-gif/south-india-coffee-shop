const CATEGORY_ARTWORK = [
  {
    keywords: ["coffee", "kaapi"],
    source: "/images/categories/coffee.jpg",
  },
  {
    keywords: ["tea", "chai"],
    source: "/images/categories/tea.jpg",
  },
  {
    keywords: ["breakfast", "idli", "dosa"],
    source: "/images/categories/breakfast.jpg",
  },
  {
    keywords: ["snack", "vada", "bajji"],
    source: "/images/categories/snacks.jpg",
  },
  {
    keywords: ["packaged", "pantry", "powder"],
    source: "/images/categories/packaged-products.jpg",
  },
] as const;

const normalizeCategory = (value: string): string => value.trim().toLowerCase();

export const getCategoryArtwork = (
  categorySlug: string | undefined,
  categoryName: string | undefined,
): string | undefined => {
  const candidates = [categorySlug, categoryName]
    .filter((value): value is string => Boolean(value))
    .map(normalizeCategory);

  return CATEGORY_ARTWORK.find(({ keywords }) =>
    keywords.some((keyword) => candidates.some((candidate) => candidate.includes(keyword))),
  )?.source;
};
