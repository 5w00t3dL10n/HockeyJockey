import {
  createLocalAudioUri,
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

const memoryStore = new Map<string, StoredLocalAudio>();
const objectUrlCache = new Map<string, string>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function inferAudioMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.ogg') || lower.endsWith('.oga')) return 'audio/ogg';
  if (lower.endsWith('.m4a') || lower.endsWith('.mp4')) return 'audio/mp4';
  if (lower.endsWith('.flac')) return 'audio/flac';
  if (lower.endsWith('.aac')) return 'audio/aac';
  if (lower.endsWith('.webm')) return 'audio/webm';
  if (lower.endsWith('.opus')) return 'audio/opus';
  return 'application/octet-stream';
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
