import { spawn } from 'node:child_process';
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type {
  PiperVoiceId,
  TtsStatusResponse,
  TtsVoiceStatus,
} from './src/types/models.ts';
import {
  buildEmbeddedMediaUri,
  calculatePiperProsodyParams,
  inferAudioMimeType,
  isAcceptedAudioFileName,
  isValidPiperVoiceId,
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

const PIPER_MAX_TEXT_LENGTH = 1500;
const PIPER_LRU_MAX_ENTRIES = 30;
const PIPER_SPAWN_TIMEOUT_MS = 20000;
const PIPER_POST_BODY_LIMIT_BYTES = 64 * 1024;

interface PiperVoiceCatalogEntry {
  id: PiperVoiceId;
  label: string;
  onnxFilename: string;
  configFilename: string;
}

const PIPER_VOICE_CATALOG: ReadonlyArray<PiperVoiceCatalogEntry> = [
  {
    id: 'sv_SE-nst-medium',
    label: 'NST – Svensk Speakerröst (Man/Neutral)',
    onnxFilename: 'sv_SE-nst-medium.onnx',
    configFilename: 'sv_SE-nst-medium.onnx.json',
  },
  {
    id: 'sv_SE-lisa-medium',
    label: 'Lisa – Svensk Speakerröst (Kvinna)',
    onnxFilename: 'sv_SE-lisa-medium.onnx',
    configFilename: 'sv_SE-lisa-medium.onnx.json',
  },
  {
    id: 'sv_SE-alma-medium',
    label: 'Alma – Svensk Speakerröst (Kvinna/Mjuk)',
    onnxFilename: 'sv_SE-alma-medium.onnx',
    configFilename: 'sv_SE-alma-medium.onnx.json',
  },
];

const PIPER_VOICE_MAP = new Map<PiperVoiceId, PiperVoiceCatalogEntry>(
  PIPER_VOICE_CATALOG.map((entry) => [entry.id, entry]),
);

function getPiperRootDir(): string {
  const override = process.env.PIPER_HOME?.trim();
  return override || path.join(os.homedir(), '.local', 'share', 'piper');
}

async function checkFileExists(
  filePath: string,
  requireExecutable = false,
): Promise<boolean> {
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) {
      return false;
    }
    if (requireExecutable) {
      await fs.promises.access(filePath, fs.constants.X_OK);
    }
    return true;
  } catch {
    return false;
  }
}

async function inspectPiperEnvironment(piperRoot: string): Promise<{
  status: TtsStatusResponse;
  binPath: string;
  libDir: string;
  voicesDir: string;
  binaryExists: boolean;
}> {
  const binPath = path.join(piperRoot, 'piper', 'piper');
  const libDir = path.join(piperRoot, 'piper');
  const voicesDir = path.join(piperRoot, 'voices');

  const binaryExists = await checkFileExists(binPath, true);
  const voices: TtsVoiceStatus[] = await Promise.all(
    PIPER_VOICE_CATALOG.map(async (entry) => {
      const onnxPath = path.join(voicesDir, entry.onnxFilename);
      const configPath = path.join(voicesDir, entry.configFilename);
      const available =
        (await checkFileExists(onnxPath)) && (await checkFileExists(configPath));
      return {
        id: entry.id,
        label: entry.label,
        available,
      };
    }),
  );

  return {
    status: {
      available: binaryExists && voices.some((voice) => voice.available),
      engine: 'piper',
      voices,
    },
    binPath,
    libDir,
    voicesDir,
    binaryExists,
  };
}

function readJsonBody(
  req: IncomingMessage,
  maxBytes = PIPER_POST_BODY_LIMIT_BYTES,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    const finish = (
      result:
        | { ok: true; data: Record<string, unknown> }
        | { ok: false; status: number; error: string },
    ) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    req.on('data', (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.length;
      if (totalBytes > maxBytes) {
        finish({
          ok: false,
          status: 413,
          error: 'Förfrågan är för stor.',
        });
        req.destroy();
        return;
      }
      chunks.push(buf);
    });

    req.on('end', () => {
      if (settled) {
        return;
      }
      const rawText = Buffer.concat(chunks).toString('utf8').trim();
      if (!rawText) {
        finish({
          ok: false,
          status: 400,
          error: 'Text får inte vara tom.',
        });
        return;
      }
      try {
        const parsed: unknown = JSON.parse(rawText);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          finish({
            ok: false,
            status: 400,
            error: 'Ogiltig JSON-kropp.',
          });
          return;
        }
        finish({ ok: true, data: parsed as Record<string, unknown> });
      } catch {
        finish({
          ok: false,
          status: 400,
          error: 'Ogiltig JSON-syntax.',
        });
      }
    });

    req.on('error', () => {
      finish({
        ok: false,
        status: 400,
        error: 'Kunde inte läsa förfrågningsdata.',
      });
    });
  });
}

function toOptionalNumericInput(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return Number(value);
  }
  return undefined;
}

function synthesizeWithPiper(params: {
  binPath: string;
  libDir: string;
  onnxPath: string;
  configPath: string;
  lengthScale: number;
  noiseScale: number;
  noiseW: number;
  sentenceSilence: number;
  text: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const prevLd = process.env.LD_LIBRARY_PATH ?? '';
    const ldLibraryPath = prevLd
      ? `${params.libDir}:${prevLd}`
      : params.libDir;

    const args = [
      '--model',
      params.onnxPath,
      '--config',
      params.configPath,
      '--length_scale',
      String(params.lengthScale),
      '--noise_scale',
      String(params.noiseScale),
      '--noise_w',
      String(params.noiseW),
      '--sentence_silence',
      String(params.sentenceSilence),
      '--output_file',
      '-',
      '-q',
    ];

    const child = spawn(params.binPath, args, {
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        LD_LIBRARY_PATH: ldLibraryPath,
      },
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, PIPER_SPAWN_TIMEOUT_MS);

    const finalize = (err: Error | null, wav?: Buffer) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (err) {
        reject(err);
      } else if (wav) {
        resolve(wav);
      }
    };

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.stdin.on('error', () => {
      // Ignore EPIPE if Piper terminates before reading full stdin
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      finalize(err);
    });

    child.on('close', (code) => {
      if (timedOut) {
        finalize(new Error('Piper TTS överskred tidsgränsen.'));
        return;
      }
      const wavBuffer = Buffer.concat(stdoutChunks);
      if (code !== 0 || wavBuffer.length === 0) {
        const stderrText = Buffer.concat(stderrChunks).toString('utf8').trim();
        finalize(
          new Error(
            stderrText || `Piper TTS avslutades med kod ${String(code)}.`,
          ),
        );
        return;
      }
      finalize(null, wavBuffer);
    });

    child.stdin.end(`${params.text}\n`);
  });
}

export function createPiperTtsMiddleware(): Connect.NextHandleFunction {
  const wavLruCache = new Map<string, Buffer>();

  const getCachedWav = (key: string): Buffer | undefined => {
    const hit = wavLruCache.get(key);
    if (!hit) {
      return undefined;
    }
    wavLruCache.delete(key);
    wavLruCache.set(key, hit);
    return hit;
  };

  const setCachedWav = (key: string, wav: Buffer): void => {
    if (wavLruCache.has(key)) {
      wavLruCache.delete(key);
    } else if (wavLruCache.size >= PIPER_LRU_MAX_ENTRIES) {
      const oldestKey = wavLruCache.keys().next().value;
      if (oldestKey !== undefined) {
        wavLruCache.delete(oldestKey);
      }
    }
    wavLruCache.set(key, wav);
  };

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

    if (parsedUrl.pathname === '/api/tts/status') {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return;
      }

      void (async () => {
        try {
          const env = await inspectPiperEnvironment(getPiperRootDir());
          sendJson(res, 200, env.status);
        } catch {
          sendJson(res, 500, { error: 'Kunde inte kontrollera Piper-status.' });
        }
      })();
      return;
    }

    if (parsedUrl.pathname === '/api/tts') {
      if (req.method !== 'GET' && req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return;
      }

      void (async () => {
        let rawText: unknown;
        let rawVoiceId: unknown;
        let rawRate: unknown;
        let rawSentenceSilence: unknown;
        let rawNoiseScale: unknown;
        let rawNoiseW: unknown;
        let rawExpressiveness: unknown;

        if (req.method === 'GET') {
          rawText = parsedUrl.searchParams.get('text') ?? '';
          rawVoiceId = parsedUrl.searchParams.get('voiceId');
          rawRate = parsedUrl.searchParams.get('rate');
          rawSentenceSilence = parsedUrl.searchParams.get('sentenceSilence');
          rawNoiseScale = parsedUrl.searchParams.get('noiseScale');
          rawNoiseW = parsedUrl.searchParams.get('noiseW');
          rawExpressiveness = parsedUrl.searchParams.get('expressiveness');
        } else {
          const bodyRes = await readJsonBody(req);
          if (!bodyRes.ok) {
            sendJson(res, bodyRes.status, { error: bodyRes.error });
            return;
          }
          rawText = bodyRes.data.text;
          rawVoiceId = bodyRes.data.voiceId;
          rawRate = bodyRes.data.rate;
          rawSentenceSilence = bodyRes.data.sentenceSilence;
          rawNoiseScale = bodyRes.data.noiseScale;
          rawNoiseW = bodyRes.data.noiseW;
          rawExpressiveness = bodyRes.data.expressiveness;
        }

        const trimmedText =
          typeof rawText === 'string' ? rawText.trim() : '';
        if (!trimmedText) {
          sendJson(res, 400, { error: 'Text får inte vara tom.' });
          return;
        }
        if (trimmedText.length > PIPER_MAX_TEXT_LENGTH) {
          sendJson(res, 400, {
            error: `Texten är för lång (max ${PIPER_MAX_TEXT_LENGTH} tecken).`,
          });
          return;
        }

        let voiceId: PiperVoiceId = 'sv_SE-nst-medium';
        if (rawVoiceId !== undefined && rawVoiceId !== null) {
          if (
            typeof rawVoiceId !== 'string' ||
            !isValidPiperVoiceId(rawVoiceId.trim())
          ) {
            sendJson(res, 400, { error: 'Ogiltig röstmodell.' });
            return;
          }
          voiceId = rawVoiceId.trim() as PiperVoiceId;
        }

        const parsedRate = toOptionalNumericInput(rawRate) ?? 1.0;
        const parsedSentenceSilence = toOptionalNumericInput(rawSentenceSilence);
        const parsedNoiseScale = toOptionalNumericInput(rawNoiseScale);
        const parsedExpressiveness = toOptionalNumericInput(rawExpressiveness);
        const parsedNoiseW = toOptionalNumericInput(rawNoiseW);

        const baseProsody = calculatePiperProsodyParams({
          rate: parsedRate,
          sentenceSilenceSec: parsedSentenceSilence,
          expressiveness: parsedNoiseScale ?? parsedExpressiveness,
        });
        const noiseW =
          parsedNoiseW !== undefined && !Number.isNaN(parsedNoiseW)
            ? Number(
                (
                  !Number.isFinite(parsedNoiseW)
                    ? parsedNoiseW > 0
                      ? 1.1
                      : 0.5
                    : Math.min(1.1, Math.max(0.5, parsedNoiseW))
                ).toFixed(3),
              )
            : baseProsody.noiseW;
        const lengthScale = baseProsody.lengthScale;
        const sentenceSilence = baseProsody.sentenceSilence;
        const noiseScale = baseProsody.noiseScale;

        const piperRoot = getPiperRootDir();
        const voiceEntry = PIPER_VOICE_MAP.get(voiceId);
        if (!voiceEntry) {
          sendJson(res, 400, { error: 'Ogiltig röstmodell.' });
          return;
        }

        const binPath = path.join(piperRoot, 'piper', 'piper');
        const libDir = path.join(piperRoot, 'piper');
        const voicesDir = path.join(piperRoot, 'voices');
        const onnxPath = path.join(voicesDir, voiceEntry.onnxFilename);
        const configPath = path.join(voicesDir, voiceEntry.configFilename);

        const [binaryExists, onnxExists, configExists] = await Promise.all([
          checkFileExists(binPath, true),
          checkFileExists(onnxPath),
          checkFileExists(configPath),
        ]);

        if (!binaryExists || !onnxExists || !configExists) {
          sendJson(res, 503, {
            error: 'Piper TTS är inte tillgänglig på servern.',
          });
          return;
        }

        const cacheKey = `${piperRoot}|${voiceId}|${lengthScale}|${sentenceSilence}|${noiseScale}|${noiseW}|${trimmedText}`;
        let wavBuffer = getCachedWav(cacheKey);

        if (!wavBuffer) {
          try {
            wavBuffer = await synthesizeWithPiper({
              binPath,
              libDir,
              onnxPath,
              configPath,
              lengthScale,
              noiseScale,
              noiseW,
              sentenceSilence,
              text: trimmedText,
            });
            setCachedWav(cacheKey, wavBuffer);
          } catch (err) {
            const code =
              typeof err === 'object' && err !== null && 'code' in err
                ? String((err as NodeJS.ErrnoException).code)
                : '';
            if (code === 'ENOENT' || code === 'EACCES') {
              sendJson(res, 503, {
                error: 'Piper TTS är inte tillgänglig på servern.',
              });
            } else {
              sendJson(res, 500, {
                error: 'Kunde inte syntetisera tal med Piper TTS.',
              });
            }
            return;
          }
        }

        if (res.writableEnded) {
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('Content-Length', String(wavBuffer.length));
        res.setHeader('Cache-Control', 'no-store');
        res.end(wavBuffer);
      })();
      return;
    }

    next();
  };
}

export function piperTtsPlugin(): Plugin {
  const middleware = createPiperTtsMiddleware();
  return {
    name: 'piper-tts-offline',
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
    piperTtsPlugin(),
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});
