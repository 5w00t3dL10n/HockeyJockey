import {
  buildEmbeddedMediaUri,
  createLocalAudioUri,
  inferAudioMimeType,
  isAcceptedAudioFileName,
  isLocalAudioUri,
  parseLocalAudioFilename,
} from '../utils/domain.ts';

export const LOCAL_AUDIO_DB_NAME = 'hockey_dj_local_audio_db';
export const LOCAL_AUDIO_STORE_NAME = 'audio_files';
const LOCAL_AUDIO_DB_VERSION = 1;

export interface StoredLocalAudio {
  trackUri: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  data: Blob | Uint8Array | ArrayBuffer;
  createdAt: string;
}

export type LocalAudioFileInput =
  | {
      name: string;
      type?: string;
      size?: number;
      arrayBuffer?: () => Promise<ArrayBuffer>;
    }
  | Blob;

export interface SavedLocalAudioMetadata {
  trackUri: string;
  fileName: string;
  mimeType: string;
  title: string;
  artist: string;
}

export interface EmbeddedMediaItem {
  trackUri: string;
  fileName: string;
  relativePath: string;
  title: string;
  artist: string;
  mimeType: string;
  sizeBytes?: number;
  streamUrl: string;
}

const memoryStore = new Map<string, StoredLocalAudio>();
const objectUrlCache = new Map<string, string>();
const embeddedMediaRegistry = new Map<string, EmbeddedMediaItem>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

export function registerEmbeddedMediaItems(items: EmbeddedMediaItem[]): void {
  if (!Array.isArray(items)) {
    return;
  }
  for (const item of items) {
    if (
      !item ||
      typeof item.trackUri !== 'string' ||
      !isLocalAudioUri(item.trackUri) ||
      typeof item.streamUrl !== 'string' ||
      !item.streamUrl.trim()
    ) {
      continue;
    }
    const cleanUri = item.trackUri.trim();
    embeddedMediaRegistry.set(cleanUri, {
      ...item,
      trackUri: cleanUri,
      streamUrl: item.streamUrl.trim(),
    });
  }
}

function normalizeServerMediaItem(raw: unknown): EmbeddedMediaItem | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const fileName = typeof obj.fileName === 'string' ? obj.fileName.trim() : '';
  const relativePath =
    typeof obj.relativePath === 'string' && obj.relativePath.trim()
      ? obj.relativePath.trim()
      : fileName;
  const streamUrl =
    typeof obj.streamUrl === 'string' ? obj.streamUrl.trim() : '';
  if (!fileName || !relativePath || !streamUrl) {
    return null;
  }

  const rawUri = typeof obj.trackUri === 'string' ? obj.trackUri.trim() : '';
  const trackUri = isLocalAudioUri(rawUri)
    ? rawUri
    : buildEmbeddedMediaUri(relativePath);
  const parsedName = parseLocalAudioFilename(fileName);
  const title =
    typeof obj.title === 'string' && obj.title.trim()
      ? obj.title.trim()
      : parsedName.title;
  const artist =
    typeof obj.artist === 'string' ? obj.artist.trim() : parsedName.artist;
  const mimeType =
    typeof obj.mimeType === 'string' && obj.mimeType.trim()
      ? obj.mimeType.trim()
      : inferAudioMimeType(fileName);
  const sizeBytes =
    typeof obj.sizeBytes === 'number' && Number.isFinite(obj.sizeBytes)
      ? Math.max(0, obj.sizeBytes)
      : undefined;

  return {
    trackUri,
    fileName,
    relativePath,
    title,
    artist,
    mimeType,
    ...(sizeBytes !== undefined ? { sizeBytes } : {}),
    streamUrl,
  };
}

function collectBundledEmbeddedMediaItems(): EmbeddedMediaItem[] {
  let globAssets: Record<string, unknown> = {};
  try {
    const matched = import.meta.glob(
      '/src/media/**/*.{mp3,wav,ogg,m4a,flac,aac,webm,opus}',
      { eager: true, query: '?url', import: 'default' },
    );
    if (matched && typeof matched === 'object') {
      globAssets = matched as Record<string, unknown>;
    }
  } catch {
    return [];
  }

  const items: EmbeddedMediaItem[] = [];
  for (const [assetPath, resolvedUrl] of Object.entries(globAssets)) {
    if (typeof resolvedUrl !== 'string' || !resolvedUrl.trim()) {
      continue;
    }
    const normalizedAssetPath = assetPath.replace(/\\/g, '/');
    const relativePath = normalizedAssetPath
      .replace(/^\/?src\/media\//, '')
      .replace(/^\/+/, '');
    const fileName = relativePath.split('/').pop() ?? relativePath;
    if (!relativePath || !isAcceptedAudioFileName(fileName)) {
      continue;
    }
    const { title, artist } = parseLocalAudioFilename(fileName);
    items.push({
      trackUri: buildEmbeddedMediaUri(relativePath),
      fileName,
      relativePath,
      title,
      artist,
      mimeType: inferAudioMimeType(fileName),
      streamUrl: resolvedUrl.trim(),
    });
  }

  items.sort(
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
  return items;
}

export async function syncEmbeddedMediaArchive(): Promise<EmbeddedMediaItem[]> {
  if (typeof fetch === 'function') {
    try {
      const response = await fetch('/api/media-archive', { cache: 'no-store' });
      if (response.ok) {
        const payload = (await response.json()) as unknown;
        if (
          typeof payload === 'object' &&
          payload !== null &&
          Array.isArray((payload as Record<string, unknown>).files)
        ) {
          const rawFiles = (payload as { files: unknown[] }).files;
          const serverItems = rawFiles
            .map(normalizeServerMediaItem)
            .filter((item): item is EmbeddedMediaItem => item !== null);
          registerEmbeddedMediaItems(serverItems);
          return serverItems;
        }
      }
    } catch {
      // Calm Tech: fall back to bundled Vite glob assets or empty list in headless Node.js
    }
  }

  const bundledItems = collectBundledEmbeddedMediaItems();
  registerEmbeddedMediaItems(bundledItems);
  return bundledItems;
}

function revokeCachedPlaybackUrl(trackUri: string): void {
  const cached = objectUrlCache.get(trackUri);
  if (!cached) {
    return;
  }
  if (
    cached.startsWith('blob:') &&
    !cached.startsWith('blob:local-memory/') &&
    typeof URL !== 'undefined' &&
    typeof URL.revokeObjectURL === 'function'
  ) {
    try {
      URL.revokeObjectURL(cached);
    } catch {
      // Calm Tech: ignore revoke errors
    }
  }
  objectUrlCache.delete(trackUri);
}

function openLocalAudioDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }

  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = indexedDB.open(
        LOCAL_AUDIO_DB_NAME,
        LOCAL_AUDIO_DB_VERSION,
      );

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(LOCAL_AUDIO_STORE_NAME)) {
          db.createObjectStore(LOCAL_AUDIO_STORE_NAME, {
            keyPath: 'trackUri',
          });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        dbPromise = null;
        resolve(null);
      };

      request.onblocked = () => {
        resolve(null);
      };
    } catch {
      dbPromise = null;
      resolve(null);
    }
  });

  return dbPromise;
}

function runIdbRequest<T>(
  mode: IDBTransactionMode,
  executor: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<{ ok: true; result: T } | { ok: false }> {
  return openLocalAudioDb().then((db) => {
    if (!db) {
      return { ok: false };
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(LOCAL_AUDIO_STORE_NAME, mode);
        const store = tx.objectStore(LOCAL_AUDIO_STORE_NAME);
        const req = executor(store);

        let settled = false;
        req.onsuccess = () => {
          if (!settled) {
            settled = true;
            resolve({ ok: true, result: req.result });
          }
        };
        req.onerror = () => {
          if (!settled) {
            settled = true;
            resolve({ ok: false });
          }
        };
        tx.onerror = () => {
          if (!settled) {
            settled = true;
            resolve({ ok: false });
          }
        };
        tx.onabort = () => {
          if (!settled) {
            settled = true;
            resolve({ ok: false });
          }
        };
      } catch {
        resolve({ ok: false });
      }
    });
  });
}

function stripRecordData(
  record: StoredLocalAudio,
): Omit<StoredLocalAudio, 'data'> {
  return {
    trackUri: record.trackUri,
    fileName: record.fileName,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    createdAt: record.createdAt,
  };
}

export async function saveLocalAudioFile(
  file: LocalAudioFileInput,
  customUri?: string,
): Promise<SavedLocalAudioMetadata> {
  const rawName =
    'name' in file && typeof file.name === 'string' ? file.name.trim() : '';
  const fileName = rawName || 'Lokal ljudfil';
  const rawType =
    'type' in file && typeof file.type === 'string' ? file.type.trim() : '';
  const mimeType = rawType || inferAudioMimeType(fileName);

  let data: Blob | Uint8Array | ArrayBuffer;
  let sizeBytes =
    'size' in file && typeof file.size === 'number' && Number.isFinite(file.size)
      ? Math.max(0, file.size)
      : 0;

  if (typeof Blob !== 'undefined' && file instanceof Blob) {
    data = file;
    sizeBytes = Number.isFinite(file.size) ? Math.max(0, file.size) : sizeBytes;
  } else if (
    'arrayBuffer' in file &&
    typeof file.arrayBuffer === 'function'
  ) {
    const buffer = await file.arrayBuffer();
    data = buffer;
    if (sizeBytes === 0 && buffer instanceof ArrayBuffer) {
      sizeBytes = buffer.byteLength;
    }
  } else {
    data = new Uint8Array(0);
  }

  const trimmedCustomUri =
    typeof customUri === 'string' ? customUri.trim() : '';
  const trackUri = trimmedCustomUri
    ? isLocalAudioUri(trimmedCustomUri)
      ? trimmedCustomUri
      : createLocalAudioUri(trimmedCustomUri)
    : createLocalAudioUri();

  revokeCachedPlaybackUrl(trackUri);

  const record: StoredLocalAudio = {
    trackUri,
    fileName,
    mimeType,
    sizeBytes,
    data,
    createdAt: new Date().toISOString(),
  };

  const idbResult = await runIdbRequest('readwrite', (store) =>
    store.put(record),
  );
  if (!idbResult.ok) {
    memoryStore.set(trackUri, record);
  } else {
    memoryStore.delete(trackUri);
  }

  const { title, artist } = parseLocalAudioFilename(fileName);
  return {
    trackUri,
    fileName,
    mimeType,
    title,
    artist,
  };
}

export async function getLocalAudioRecord(
  trackUri: string,
): Promise<StoredLocalAudio | null> {
  const trimmed = typeof trackUri === 'string' ? trackUri.trim() : '';
  if (!isLocalAudioUri(trimmed)) {
    return null;
  }

  const embedded = embeddedMediaRegistry.get(trimmed);
  if (embedded) {
    return {
      trackUri: embedded.trackUri,
      fileName: embedded.fileName,
      mimeType: embedded.mimeType || inferAudioMimeType(embedded.fileName),
      sizeBytes: embedded.sizeBytes ?? 0,
      data: new Uint8Array(0),
      createdAt: 'embedded-media-archive',
    };
  }

  const idbResult = await runIdbRequest<StoredLocalAudio | undefined>(
    'readonly',
    (store) => store.get(trimmed),
  );
  if (idbResult.ok && idbResult.result) {
    return idbResult.result;
  }

  return memoryStore.get(trimmed) ?? null;
}

export async function getLocalAudioPlaybackUrl(
  trackUri: string,
): Promise<string | null> {
  const trimmed = typeof trackUri === 'string' ? trackUri.trim() : '';
  if (!isLocalAudioUri(trimmed)) {
    return null;
  }

  const embedded = embeddedMediaRegistry.get(trimmed);
  if (embedded && embedded.streamUrl) {
    return embedded.streamUrl;
  }

  const cached = objectUrlCache.get(trimmed);
  if (cached) {
    return cached;
  }

  const record = await getLocalAudioRecord(trimmed);
  if (!record) {
    return null;
  }

  if (
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function' &&
    typeof Blob !== 'undefined'
  ) {
    let blob: Blob;
    if (record.data instanceof Blob) {
      blob = record.data;
    } else if (record.data instanceof Uint8Array) {
      const copy = new Uint8Array(record.data.byteLength);
      copy.set(record.data);
      blob = new Blob([copy], {
        type: record.mimeType || 'application/octet-stream',
      });
    } else {
      blob = new Blob([record.data], {
        type: record.mimeType || 'application/octet-stream',
      });
    }

    const url = URL.createObjectURL(blob);
    objectUrlCache.set(trimmed, url);
    return url;
  }

  const localId = trimmed.slice('local:audio:'.length);
  const headlessUrl = `blob:local-memory/${localId}`;
  objectUrlCache.set(trimmed, headlessUrl);
  return headlessUrl;
}

export async function deleteLocalAudioFile(trackUri: string): Promise<void> {
  const trimmed = typeof trackUri === 'string' ? trackUri.trim() : '';
  if (!trimmed) {
    return;
  }

  revokeCachedPlaybackUrl(trimmed);
  memoryStore.delete(trimmed);

  await runIdbRequest('readwrite', (store) => store.delete(trimmed));
}

export async function listLocalAudioFiles(): Promise<
  Array<Omit<StoredLocalAudio, 'data'>>
> {
  const idbResult = await runIdbRequest<StoredLocalAudio[]>(
    'readonly',
    (store) => store.getAll(),
  );

  const byUri = new Map<string, Omit<StoredLocalAudio, 'data'>>();

  if (idbResult.ok && Array.isArray(idbResult.result)) {
    for (const record of idbResult.result) {
      if (record && typeof record.trackUri === 'string') {
        byUri.set(record.trackUri, stripRecordData(record));
      }
    }
  }

  for (const record of memoryStore.values()) {
    if (!byUri.has(record.trackUri)) {
      byUri.set(record.trackUri, stripRecordData(record));
    }
  }

  return Array.from(byUri.values());
}
