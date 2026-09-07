/**
 * Route paths for the Bean Blasters feature.
 *
 * Kept in their own module so pages and the route subtree can both import them
 * without creating an import cycle. Deliberately independent of the Kaapi Karts
 * path module (BEAN-BLASTERS.md §3.3).
 */

export const GAMES_PATH = "/games";
export const BEAN_BLASTERS_PATH = `${GAMES_PATH}/bean-blasters`;

export const beanBlastersInvitePath = (code: string): string =>
  `${BEAN_BLASTERS_PATH}/r/${encodeURIComponent(code)}`;

export const beanBlastersLobbyPath = (code: string): string =>
  `${BEAN_BLASTERS_PATH}/lobby/${encodeURIComponent(code)}`;

export const beanBlastersBattlePath = (code: string): string =>
  `${BEAN_BLASTERS_PATH}/battle/${encodeURIComponent(code)}`;

export const beanBlastersResultsPath = (code: string): string =>
  `${BEAN_BLASTERS_PATH}/results/${encodeURIComponent(code)}`;

export const beanBlastersInviteUrl = (code: string): string => {
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return `${origin}${beanBlastersInvitePath(code)}`;
};
