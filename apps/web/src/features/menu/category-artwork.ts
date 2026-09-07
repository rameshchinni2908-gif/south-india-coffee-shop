import breakfastSmall from "../../assets/categories/breakfast-480.jpg";
import breakfast from "../../assets/categories/breakfast-768.jpg";
import coffeeSmall from "../../assets/categories/coffee-480.jpg";
import coffee from "../../assets/categories/coffee-768.jpg";
import packagedSmall from "../../assets/categories/packaged-products-480.jpg";
import packaged from "../../assets/categories/packaged-products-768.jpg";
import snacksSmall from "../../assets/categories/snacks-480.jpg";
import snacks from "../../assets/categories/snacks-768.jpg";
import teaSmall from "../../assets/categories/tea-480.jpg";
import tea from "../../assets/categories/tea-768.jpg";

const CATEGORY_ARTWORK = [
  {
    keywords: ["coffee", "kaapi"],
    source: coffee,
    smallSource: coffeeSmall,
  },
  {
    keywords: ["tea", "chai"],
    source: tea,
    smallSource: teaSmall,
  },
  {
    keywords: ["breakfast", "idli", "dosa"],
    source: breakfast,
    smallSource: breakfastSmall,
  },
  {
    keywords: ["snack", "vada", "bajji"],
    source: snacks,
    smallSource: snacksSmall,
  },
  {
    keywords: ["packaged", "pantry", "powder"],
    source: packaged,
    smallSource: packagedSmall,
  },
] as const;

const normalizeCategory = (value: string): string => value.trim().toLowerCase();

export const getCategoryArtworkSrcSet = (source: string | undefined): string | undefined => {
  const artwork = CATEGORY_ARTWORK.find((item) => item.source === source);
  return artwork ? `${artwork.smallSource} 480w, ${artwork.source} 768w` : undefined;
};

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
