import { timingSafeEqual } from "node:crypto";

// Constant-time comparison, so response timing does not reveal how much of a token matched.
export const hasBearerToken = (
  request: { get(name: string): string | undefined },
  token: string,
): boolean => {
  const provided = request.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!provided) return false;
  const expected = Buffer.from(token);
  const actual = Buffer.from(provided);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};
