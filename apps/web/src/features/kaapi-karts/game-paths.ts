/**
 * Route paths for the Kaapi Karts feature.
 *
 * Kept in their own module so pages and the route subtree can both import them
 * without creating an import cycle.
 */

export const GAMES_PATH = "/games";
export const KAAPI_KARTS_PATH = `${GAMES_PATH}/kaapi-karts`;

export const kaapiKartsInvitePath = (code: string): string =>
  `${KAAPI_KARTS_PATH}/r/${encodeURIComponent(code)}`;

export const kaapiKartsLobbyPath = (code: string): string =>
  `${KAAPI_KARTS_PATH}/lobby/${encodeURIComponent(code)}`;

export const kaapiKartsRacePath = (code: string): string =>
  `${KAAPI_KARTS_PATH}/race/${encodeURIComponent(code)}`;

export const kaapiKartsResultsPath = (code: string): string =>
  `${KAAPI_KARTS_PATH}/results/${encodeURIComponent(code)}`;

export const kaapiKartsInviteUrl = (code: string): string => {
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return `${origin}${kaapiKartsInvitePath(code)}`;
};
