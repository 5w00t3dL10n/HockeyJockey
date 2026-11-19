import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {
  buildEmbeddedMediaUri,
  inferAudioMimeType,
  isAcceptedAudioFileName,
  parseLocalAudioFilename,
  parseSpotifyMetadataPayload,
} from './src/utils/domain.ts';

const TRACK_ID_REGEX = /^[A-Za-z0-9]{22}$/;
const FETCH_TIMEOUT_MS = 5000;
const MEDIA_ARCHIVE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'src/media',
);

interface ScannedMediaArchiveItem {
  trackUri: string;
  fileName: string;
  relativePath: string;
  title: string;
  artist: string;
  mimeType: string;
  sizeBytes: number;
  streamUrl: string;
}

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

async function scanMediaArchiveDirectory(): Promise<ScannedMediaArchiveItem[]> {
  let rootStat: fs.Stats;
  try {
    rootStat = await fs.promises.stat(MEDIA_ARCHIVE_DIR);
  } catch {
    return [];
  }
  if (!rootStat.isDirectory()) {
    return [];
  }

  let realRoot: string;
  try {
    realRoot = await fs.promises.realpath(MEDIA_ARCHIVE_DIR);
  } catch {
    return [];
  }

  const collected: ScannedMediaArchiveItem[] = [];

  async function walk(currentDir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) =>
      a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    );

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      let isDir = entry.isDirectory();
      let isFile = entry.isFile();
      let sizeBytes = 0;

      if (entry.isSymbolicLink()) {
        try {
          const targetReal = await fs.promises.realpath(fullPath);
          const relReal = path.relative(realRoot, targetReal);
          if (
            relReal === '' ||
            relReal.startsWith('..') ||
            path.isAbsolute(relReal)
          ) {
            continue;
          }
          const targetStat = await fs.promises.stat(fullPath);
          isDir = targetStat.isDirectory();
          isFile = targetStat.isFile();
          sizeBytes = targetStat.size;
        } catch {
          continue;
        }
      } else if (isFile) {
        try {
          const fileStat = await fs.promises.stat(fullPath);
          sizeBytes = fileStat.size;
        } catch {
          continue;
        }
      }

      if (isDir) {
        await walk(fullPath);
      } else if (isFile && isAcceptedAudioFileName(entry.name)) {
        const relativePath = path
          .relative(MEDIA_ARCHIVE_DIR, fullPath)
          .split(path.sep)
          .join('/');
        const { title, artist } = parseLocalAudioFilename(entry.name);
        collected.push({
          trackUri: buildEmbeddedMediaUri(relativePath),
          fileName: entry.name,
          relativePath,
          title,
          artist,
          mimeType: inferAudioMimeType(entry.name),
          sizeBytes,
          streamUrl: `/api/media-archive/file?path=${encodeURIComponent(relativePath)}`,
        });
      }
    }
  }

  await walk(MEDIA_ARCHIVE_DIR);
  collected.sort(
    (a, b) =>
      a.relativePath.localeCompare(b.relativePath, 'en', {
        sensitivity: 'base',
      }) ||
      (a.relativePath < b.relativePath
        ? -1
        : a.relativePath > b.relativePath
          ? 1
          : 0),
  );
  return collected;
}

function isPathStrictlyInsideRoot(rootDir: string, candidatePath: string): boolean {
  const rel = path.relative(rootDir, candidatePath);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function parseByteRangeHeader(
  rangeHeader: string,
  totalSize: number,
):
  | { kind: 'ok'; start: number; end: number }
  | { kind: 'invalid' } {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) {
    return { kind: 'invalid' };
  }
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) {
    return { kind: 'invalid' };
  }
  if (totalSize <= 0) {
    return { kind: 'invalid' };
  }

  let start: number;
  let end: number;

  if (!rawStart) {
    const suffixLength = Number.parseInt(rawEnd, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return { kind: 'invalid' };
    }
    start = Math.max(0, totalSize - suffixLength);
    end = totalSize - 1;
  } else {
    start = Number.parseInt(rawStart, 10);
    end = rawEnd ? Number.parseInt(rawEnd, 10) : totalSize - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return { kind: 'invalid' };
    }
    end = Math.min(end, totalSize - 1);
  }

  if (start < 0 || start >= totalSize || end < start) {
    return { kind: 'invalid' };
  }

  return { kind: 'ok', start, end };
}

function pipeFileStream(
  res: ServerResponse,
  filePath: string,
  options?: { start?: number; end?: number },
): void {
  const stream = fs.createReadStream(filePath, options);
  stream.on('error', () => {
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Failed to read audio file' });
    } else if (!res.writableEnded) {
      res.destroy();
    }
  });
  stream.pipe(res);
}

function createMediaArchiveMiddleware(): Connect.NextHandleFunction {
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

    if (parsedUrl.pathname === '/api/media-archive') {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return;
      }

      void (async () => {
        try {
          const files = await scanMediaArchiveDirectory();
          sendJson(res, 200, {
            archiveDir: 'HockeyJockey/src/media',
            files,
          });
        } catch {
          sendJson(res, 500, { error: 'Failed to scan media archive' });
        }
      })();
      return;
    }

    if (parsedUrl.pathname === '/api/media-archive/file') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return;
      }

      const rawPath = parsedUrl.searchParams.get('path') ?? '';
      if (!rawPath.trim() || rawPath.includes('\0')) {
        sendJson(res, 403, { error: 'Forbidden path' });
        return;
      }

      const normalizedInput = rawPath.replace(/\\/g, '/').trim();
      if (path.posix.isAbsolute(normalizedInput) || /^[A-Za-z]:/.test(normalizedInput)) {
        sendJson(res, 403, { error: 'Forbidden path' });
        return;
      }

      const resolvedPath = path.resolve(MEDIA_ARCHIVE_DIR, normalizedInput);
      if (!isPathStrictlyInsideRoot(MEDIA_ARCHIVE_DIR, resolvedPath)) {
        sendJson(res, 403, { error: 'Path traversal forbidden' });
        return;
      }

      const relSegments = path
        .relative(MEDIA_ARCHIVE_DIR, resolvedPath)
        .split(path.sep);
      if (relSegments.some((segment) => segment.startsWith('.'))) {
        sendJson(res, 403, { error: 'Hidden path forbidden' });
        return;
      }

      if (!isAcceptedAudioFileName(path.basename(resolvedPath))) {
        sendJson(res, 403, { error: 'Disallowed file extension' });
        return;
      }

      void (async () => {
        let stat: fs.Stats;
        try {
          stat = await fs.promises.stat(resolvedPath);
        } catch {
          sendJson(res, 404, { error: 'Audio file not found' });
          return;
        }

        if (!stat.isFile()) {
          sendJson(res, 404, { error: 'Audio file not found' });
          return;
        }

        try {
          const [realRoot, realTarget] = await Promise.all([
            fs.promises.realpath(MEDIA_ARCHIVE_DIR),
            fs.promises.realpath(resolvedPath),
          ]);
          if (!isPathStrictlyInsideRoot(realRoot, realTarget)) {
            sendJson(res, 403, { error: 'Path traversal forbidden' });
            return;
          }
        } catch {
          sendJson(res, 404, { error: 'Audio file not found' });
          return;
        }

        const totalSize = stat.size;
        const mimeType = inferAudioMimeType(resolvedPath);
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-cache');

        const rangeHeader =
          typeof req.headers.range === 'string' ? req.headers.range.trim() : '';

        if (rangeHeader) {
          const parsedRange = parseByteRangeHeader(rangeHeader, totalSize);
          if (parsedRange.kind === 'invalid') {
            res.statusCode = 416;
            res.setHeader('Content-Range', `bytes */${totalSize}`);
            res.end();
            return;
          }

          const { start, end } = parsedRange;
          const chunkSize = end - start + 1;
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
          res.setHeader('Content-Length', String(chunkSize));

          if (req.method === 'HEAD') {
            res.end();
            return;
          }

          pipeFileStream(res, resolvedPath, { start, end });
          return;
        }

        res.statusCode = 200;
        res.setHeader('Content-Length', String(totalSize));

        if (req.method === 'HEAD' || totalSize === 0) {
          res.end();
          return;
        }

        pipeFileStream(res, resolvedPath);
      })();
      return;
    }

    next();
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

function embeddedMediaArchivePlugin(): Plugin {
  const middleware = createMediaArchiveMiddleware();
  return {
    name: 'embedded-media-archive',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    spotifyMetadataProxyPlugin(),
    embeddedMediaArchivePlugin(),
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});
