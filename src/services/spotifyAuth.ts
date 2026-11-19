import { DEFAULT_SPOTIFY_CLIENT_ID } from '../data/defaults.ts';
import type { SpotifyTokenState } from '../types/models.ts';
import { generatePkceChallenge, generatePkceVerifier } from '../utils/domain.ts';

export const SPOTIFY_AUTH_STORAGE_KEY = 'hockey_dj_spotify_auth';
const SPOTIFY_PKCE_STORAGE_KEY = 'hockey_dj_spotify_pkce';
const SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

export const SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
].join(' ');

export interface StoredSpotifyAuth extends SpotifyTokenState {
  clientId: string;
}

interface PendingPkceState {
  verifier: string;
  state: string;
  clientId: string;
  redirectUri: string;
}

let proactiveRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let inFlightRefresh: Promise<StoredSpotifyAuth | null> | null = null;

function hasBrowserStorage(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.localStorage !== 'undefined'
  );
}

function readJsonStorage<T>(key: string): T | null {
  if (!hasBrowserStorage()) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJsonStorage(key: string, value: unknown): void {
  if (!hasBrowserStorage()) {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Calm Tech: ignore storage quota/privacy mode failures
  }
}

function removeStorageItem(key: string): void {
  if (!hasBrowserStorage()) {
    return;
  }
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore
  }
}

function resolveSpotifyClientId(
  clientIdOverride?: string,
  stored?: { clientId?: unknown } | null,
): string {
  const storedClientId =
    typeof stored?.clientId === 'string' ? stored.clientId.trim() : '';
  return (
    clientIdOverride?.trim() || storedClientId || DEFAULT_SPOTIFY_CLIENT_ID
  );
}

function getEffectivePort(protocol: string, port: string): string {
  if (port) {
    return port;
  }
  if (protocol === 'http:') {
    return '80';
  }
  if (protocol === 'https:') {
    return '443';
  }
  return '';
}

export function ensureConsistentLoopbackOrigin(redirectUri: string): boolean {
  if (typeof window === 'undefined' || !window.location) {
    return false;
  }

  const trimmedRedirect = redirectUri.trim();
  if (!trimmedRedirect) {
    return false;
  }

  let parsedRedirect: URL;
  try {
    parsedRedirect = new URL(trimmedRedirect);
  } catch {
    return false;
  }

  const currentHostname = window.location.hostname;
  if (currentHostname !== 'localhost' || parsedRedirect.hostname !== '127.0.0.1') {
    return false;
  }

  const currentProtocol = window.location.protocol || parsedRedirect.protocol;
  const currentPort = getEffectivePort(currentProtocol, window.location.port || '');
  const redirectPort = getEffectivePort(
    parsedRedirect.protocol,
    parsedRedirect.port,
  );
  if (currentPort !== redirectPort) {
    return false;
  }

  let targetHref: string;
  try {
    const currentUrl = new URL(window.location.href);
    currentUrl.hostname = '127.0.0.1';
    targetHref = currentUrl.toString();
  } catch {
    const portSuffix = window.location.port ? `:${window.location.port}` : '';
    const pathname = window.location.pathname || '/';
    const search = window.location.search || '';
    const hash = window.location.hash || '';
    targetHref = `${currentProtocol}//127.0.0.1${portSuffix}${pathname}${search}${hash}`;
  }

  try {
    if (typeof window.location.replace === 'function') {
      window.location.replace(targetHref);
      return true;
    }
    if (typeof window.location.assign === 'function') {
      window.location.assign(targetHref);
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export function clearProactiveRefreshTimer(): void {
  if (proactiveRefreshTimer !== null) {
    clearTimeout(proactiveRefreshTimer);
    proactiveRefreshTimer = null;
  }
}

export function scheduleProactiveRefresh(
  auth: StoredSpotifyAuth,
  onRefreshed?: (updated: StoredSpotifyAuth | null) => void,
  clientIdOverride?: string,
): void {
  clearProactiveRefreshTimer();
  if (typeof window === 'undefined' || !auth.refreshToken) {
    return;
  }

  const refreshAheadMs = 120_000;
  const delayMs = Math.max(10_000, auth.expiresAt - Date.now() - refreshAheadMs);
  const effectiveClientId = resolveSpotifyClientId(clientIdOverride, auth);

  proactiveRefreshTimer = setTimeout(() => {
    void refreshSpotifyToken(effectiveClientId).then((updated) => {
      onRefreshed?.(updated);
    });
  }, delayMs);
}

export function getStoredSpotifyAuth(): StoredSpotifyAuth | null {
  const parsed = readJsonStorage<Partial<StoredSpotifyAuth>>(
    SPOTIFY_AUTH_STORAGE_KEY,
  );
  if (
    !parsed ||
    typeof parsed.accessToken !== 'string' ||
    !parsed.accessToken ||
    typeof parsed.expiresAt !== 'number'
  ) {
    return null;
  }

  return {
    accessToken: parsed.accessToken,
    refreshToken:
      typeof parsed.refreshToken === 'string' ? parsed.refreshToken : '',
    expiresAt: parsed.expiresAt,
    tokenType:
      typeof parsed.tokenType === 'string' ? parsed.tokenType : 'Bearer',
    scope: typeof parsed.scope === 'string' ? parsed.scope : SPOTIFY_SCOPES,
    clientId: resolveSpotifyClientId(undefined, parsed),
  };
}

export function isTokenExpiringSoon(
  auth: StoredSpotifyAuth,
  bufferMs = 60_000,
): boolean {
  return Date.now() + bufferMs >= auth.expiresAt;
}

export async function buildSpotifyAuthorizeUrl(
  clientId: string,
  redirectUri: string,
): Promise<string> {
  const cleanClientId = clientId.trim();
  const cleanRedirectUri = redirectUri.trim();
  if (!cleanClientId) {
    throw new Error('Spotify Client ID saknas. Konfigurera det i Förberedelseläget.');
  }
  if (!cleanRedirectUri) {
    throw new Error('Spotify Redirect URI saknas.');
  }

  const verifier = generatePkceVerifier(64);
  const challenge = await generatePkceChallenge(verifier);
  const state = generatePkceVerifier(43).slice(0, 24);

  const pending: PendingPkceState = {
    verifier,
    state,
    clientId: cleanClientId,
    redirectUri: cleanRedirectUri,
  };
  writeJsonStorage(SPOTIFY_PKCE_STORAGE_KEY, pending);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cleanClientId,
    scope: SPOTIFY_SCOPES,
    redirect_uri: cleanRedirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  });

  return `${SPOTIFY_AUTHORIZE_URL}?${params.toString()}`;
}

export async function startSpotifyLogin(
  clientId: string,
  redirectUri: string,
): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('Spotify-inloggning kräver webbläsarmiljö.');
  }
  if (ensureConsistentLoopbackOrigin(redirectUri)) {
    return;
  }
  const url = await buildSpotifyAuthorizeUrl(clientId, redirectUri);
  window.location.assign(url);
}

interface SpotifyTokenEndpointResponse {
  access_token: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

export async function handleSpotifyCallback(
  searchParamsInput: string | URLSearchParams,
  fallbackClientId = '',
  fallbackRedirectUri = '',
): Promise<StoredSpotifyAuth> {
  const params =
    typeof searchParamsInput === 'string'
      ? new URLSearchParams(searchParamsInput)
      : searchParamsInput;

  const oauthError = params.get('error');
  if (oauthError) {
    removeStorageItem(SPOTIFY_PKCE_STORAGE_KEY);
    throw new Error(`Spotify-inloggning avbröts eller nekades (${oauthError}).`);
  }

  const code = params.get('code');
  if (!code) {
    throw new Error('Ingen auktoriseringskod mottogs från Spotify.');
  }

  const pending = readJsonStorage<PendingPkceState>(SPOTIFY_PKCE_STORAGE_KEY);
  const returnedState = params.get('state');
  if (pending && returnedState && pending.state !== returnedState) {
    removeStorageItem(SPOTIFY_PKCE_STORAGE_KEY);
    throw new Error('Ogiltig OAuth state-parameter vid Spotify-callback.');
  }

  const clientId = resolveSpotifyClientId(fallbackClientId, pending);
  const redirectUri = pending?.redirectUri || fallbackRedirectUri.trim();
  const verifier = pending?.verifier || '';

  if (!clientId || !redirectUri || !verifier) {
    removeStorageItem(SPOTIFY_PKCE_STORAGE_KEY);
    throw new Error(
      'PKCE-session saknas eller har löpt ut. Försök logga in med Spotify igen.',
    );
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier,
  });

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const data = (await response.json()) as SpotifyTokenEndpointResponse;
  removeStorageItem(SPOTIFY_PKCE_STORAGE_KEY);

  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error_description ||
        data.error ||
        `Spotify token-utbyte misslyckades (HTTP ${response.status}).`,
    );
  }

  const expiresInSec =
    typeof data.expires_in === 'number' && data.expires_in > 0
      ? data.expires_in
      : 3600;

  const auth: StoredSpotifyAuth = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? '',
    expiresAt: Date.now() + expiresInSec * 1000,
    tokenType: data.token_type ?? 'Bearer',
    scope: data.scope ?? SPOTIFY_SCOPES,
    clientId,
  };

  writeJsonStorage(SPOTIFY_AUTH_STORAGE_KEY, auth);
  scheduleProactiveRefresh(auth);
  return auth;
}

export async function refreshSpotifyToken(
  clientIdOverride?: string,
): Promise<StoredSpotifyAuth | null> {
  if (inFlightRefresh) {
    return inFlightRefresh;
  }

  inFlightRefresh = (async () => {
    const existing = getStoredSpotifyAuth();
    const clientId = resolveSpotifyClientId(clientIdOverride, existing);
    if (!existing?.refreshToken) {
      return null;
    }

    try {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: existing.refreshToken,
        client_id: clientId,
      });

      const response = await fetch(SPOTIFY_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as SpotifyTokenEndpointResponse;
      if (!data.access_token) {
        return null;
      }

      const expiresInSec =
        typeof data.expires_in === 'number' && data.expires_in > 0
          ? data.expires_in
          : 3600;

      const updated: StoredSpotifyAuth = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || existing.refreshToken,
        expiresAt: Date.now() + expiresInSec * 1000,
        tokenType: data.token_type ?? existing.tokenType,
        scope: data.scope ?? existing.scope,
        clientId,
      };

      writeJsonStorage(SPOTIFY_AUTH_STORAGE_KEY, updated);
      scheduleProactiveRefresh(updated, undefined, clientId);
      return updated;
    } catch {
      return null;
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}

export async function getValidSpotifyAccessToken(
  clientIdOverride?: string,
): Promise<string | null> {
  const stored = getStoredSpotifyAuth();
  if (!stored) {
    return null;
  }

  const effectiveClientId = resolveSpotifyClientId(clientIdOverride, stored);
  if (!isTokenExpiringSoon(stored)) {
    scheduleProactiveRefresh(stored, undefined, effectiveClientId);
    return stored.accessToken;
  }

  const refreshed = await refreshSpotifyToken(effectiveClientId);
  return refreshed ? refreshed.accessToken : null;
}

export function logoutSpotify(): void {
  clearProactiveRefreshTimer();
  removeStorageItem(SPOTIFY_AUTH_STORAGE_KEY);
  removeStorageItem(SPOTIFY_PKCE_STORAGE_KEY);
}
