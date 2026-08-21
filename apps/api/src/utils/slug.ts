import { HttpError } from "../middleware/http-error.js";

export const createSlug = (value: string): string => {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    throw new HttpError(400, "INVALID_SLUG", "A valid URL slug could not be generated");
  }

  return slug;
};
