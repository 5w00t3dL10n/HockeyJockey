import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { parseSpotifyMetadataPayload } from './src/utils/domain.ts';

const TRACK_ID_REGEX = /^[A-Za-z0-9]{22}$/;
const FETCH_TIMEOUT_MS = 5000;

function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  if (res.writableEnded) {
    return;
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

async function fetchTextWithTimeout(
  url: string,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<{ ok: boolean; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HockeyJockey/1.0)',
        Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, text: '' };
    }
    return { ok: true, text: await response.text() };
  } catch {
    return { ok: false, text: '' };
  } finally {
    clearTimeout(timer);
  }
}

function createSpotifyMetaMiddleware(): Connect.NextHandleFunction {
  return (
    req: IncomingMessage,
    res: ServerResponse,
    next: Connect.NextFunction,
  ) => {
    const rawUrl = req.url ?? '/';
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl, 'http://127.0.0.1');
    } catch {
      next();
      return;
    }

    if (parsedUrl.pathname !== '/api/spotify-meta') {
      next();
      return;
    }

    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    const trackId = parsedUrl.searchParams.get('id')?.trim() ?? '';
    if (!TRACK_ID_REGEX.test(trackId)) {
      sendJson(res, 400, { error: 'Invalid track id' });
      return;
    }

    void (async () => {
      try {
        let embedParsed: { title: string; artist: string } | null = null;
        const embedRes = await fetchTextWithTimeout(
          `https://open.spotify.com/embed/track/${trackId}`,
        );
        if (embedRes.ok) {
          embedParsed = parseSpotifyMetadataPayload(embedRes.text);
          if (embedParsed && embedParsed.title && embedParsed.artist) {
            sendJson(res, 200, {
              trackId,
              trackUri: `spotify:track:${trackId}`,
              title: embedParsed.title,
              artist: embedParsed.artist,
            });
            return;
          }
        }

        const trackUrl = `https://open.spotify.com/track/${trackId}`;
        const oembedRes = await fetchTextWithTimeout(
          `https://open.spotify.com/oembed?url=${encodeURIComponent(trackUrl)}`,
        );
        if (oembedRes.ok) {
          const oembedParsed = parseSpotifyMetadataPayload(oembedRes.text);
          if (oembedParsed) {
            sendJson(res, 200, {
              trackId,
              trackUri: `spotify:track:${trackId}`,
              title: oembedParsed.title || embedParsed?.title || '',
              artist: oembedParsed.artist || embedParsed?.artist || '',
            });
            return;
          }
        }

        if (embedParsed && embedParsed.title) {
          sendJson(res, 200, {
            trackId,
            trackUri: `spotify:track:${trackId}`,
            title: embedParsed.title,
            artist: embedParsed.artist,
          });
          return;
        }

        sendJson(res, 502, {
          error: 'Could not fetch Spotify track metadata',
        });
      } catch {
        sendJson(res, 502, {
          error: 'Failed to resolve Spotify track metadata',
        });
      }
    })();
  };
}

function spotifyMetadataProxyPlugin(): Plugin {
  const middleware = createSpotifyMetaMiddleware();
  return {
    name: 'spotify-metadata-proxy',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), spotifyMetadataProxyPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});
