import {
  extractSpotifyTrackId,
  parseSpotifyMetadataPayload,
} from '../utils/domain.ts';
import { getValidSpotifyAccessToken } from './spotifyAuth.ts';

export interface SpotifyTrackMetadata {
  trackUri: string;
  trackId: string;
  title: string;
  artist: string;
}

async function fetchJsonWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = 5000,
): Promise<{ ok: boolean; data: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, data: null };
    }
    const data: unknown = await response.json();
    return { ok: true, data };
  } catch {
    return { ok: false, data: null };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchSpotifyTrackMetadata(
  input: string,
  clientId?: string,
): Promise<SpotifyTrackMetadata | null> {
  const trackId = extractSpotifyTrackId(input);
  if (!trackId) {
    return null;
  }

  const trackUri = `spotify:track:${trackId}`;
  let partialFallback: { title: string; artist: string } | null = null;

  // Step 1: Spotify Web API (when a valid user OAuth token is available)
  try {
    const accessToken = await getValidSpotifyAccessToken(clientId);
    if (accessToken) {
      const res = await fetchJsonWithTimeout(
        `https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
        5000,
      );
      if (res.ok) {
        const parsed = parseSpotifyMetadataPayload(res.data);
        if (parsed) {
          if (parsed.artist) {
            return {
              trackUri,
              trackId,
              title: parsed.title,
              artist: parsed.artist,
            };
          }
          partialFallback = parsed;
        }
      }
    }
  } catch {
    // Calm Tech: fall through to local Vite proxy
  }

  // Step 2: Vite server middleware (/api/spotify-meta)
  try {
    const res = await fetchJsonWithTimeout(
      `/api/spotify-meta?id=${encodeURIComponent(trackId)}`,
      undefined,
      6000,
    );
    if (res.ok) {
      const parsed = parseSpotifyMetadataPayload(res.data);
      if (parsed) {
        if (parsed.artist) {
          return {
            trackUri,
            trackId,
            title: parsed.title,
            artist: parsed.artist,
          };
        }
        partialFallback = partialFallback ?? parsed;
      }
    }
  } catch {
    // Calm Tech: fall through to direct browser oEmbed fallback
  }

  // Step 3: Direct browser oEmbed fallback
  try {
    const trackUrl = `https://open.spotify.com/track/${trackId}`;
    const res = await fetchJsonWithTimeout(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(trackUrl)}`,
      undefined,
      5000,
    );
    if (res.ok) {
      const parsed = parseSpotifyMetadataPayload(res.data);
      if (parsed) {
        return {
          trackUri,
          trackId,
          title: parsed.title,
          artist: parsed.artist || partialFallback?.artist || '',
        };
      }
    }
  } catch {
    // Calm Tech: return partial result or null without throwing
  }

  if (partialFallback) {
    return {
      trackUri,
      trackId,
      title: partialFallback.title,
      artist: partialFallback.artist,
    };
  }

  return null;
}
