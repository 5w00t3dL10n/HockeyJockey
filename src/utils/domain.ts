import {
  DEFAULT_KEY_BINDINGS,
  DEFAULT_MATCH_PROFILES,
  DEFAULT_SAVED_ROSTERS,
  DEFAULT_SETTINGS,
  DEFAULT_SOUNDBOARD_GROUPS,
  DEFAULT_SOUND_PADS,
  DEFAULT_SPOTIFY_CLIENT_ID,
  DEFAULT_TEAMS,
  EVENT_PAD_CATEGORIES,
  MATCH_ACTION_IDS,
  PAD_CATEGORY_LABELS,
} from '../data/defaults.ts';
import type {
  AppSettings,
  BuiltinPadCategory,
  KeyBindings,
  MatchActionId,
  MatchConfigSnapshot,
  MatchProfile,
  PadCategory,
  PiperVoiceId,
  SavedRoster,
  SoundboardGroup,
  SoundPad,
  Team,
  TrackCue,
  TrackSourceType,
  TtsEngineType,
} from '../types/models.ts';

const SPOTIFY_ID_REGEX = /^[A-Za-z0-9]{22}$/;
const SPOTIFY_URI_REGEX = /^spotify:track:([A-Za-z0-9]{22})$/;
const SPOTIFY_URL_REGEX =
  /^https?:\/\/open\.spotify\.com\/(?:intl-[A-Za-z0-9-]+\/)?track\/([A-Za-z0-9]{22})(?:[/?#].*)?$/i;
export const LOCAL_AUDIO_URI_REGEX = /^local:audio:([A-Za-z0-9_-]{3,120})$/;
const MM_SS_REGEX = /^\d+:[0-5]\d$/;
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const PKCE_CHARSET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

const EVENT_CATEGORY_SET = new Set<string>(EVENT_PAD_CATEGORIES);
const BUILTIN_GROUP_ID_SET = new Set<string>(
  DEFAULT_SOUNDBOARD_GROUPS.map((group) => group.id),
);
const VALID_TRIGGER_FLOWS = new Set([
  'penalty_home',
  'penalty_away',
  'goal_home',
  'goal_away',
]);

export const PIPER_VOICE_IDS = [
  'sv_SE-nst-medium',
  'sv_SE-lisa-medium',
] as const;

export function isValidPiperVoiceId(id: string): id is PiperVoiceId {
  return (
    typeof id === 'string' &&
    (PIPER_VOICE_IDS as readonly string[]).includes(id)
  );
}

export function isValidTtsEngine(engine: unknown): engine is TtsEngineType {
  return engine === 'piper' || engine === 'webspeech';
}

export function calculatePiperLengthScale(rate: number): number {
  const safeRate =
    typeof rate === 'number' && Number.isFinite(rate) && rate > 0
      ? Math.min(2.0, Math.max(0.5, rate))
      : 1.0;
  return Number((1 / safeRate).toFixed(3));
}

function toNumericInput(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return Number(value);
  }
  return Number.NaN;
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  if (!Number.isFinite(value)) {
    return value > 0 ? max : min;
  }
  return Math.min(max, Math.max(min, value));
}

function clampVolume(value: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }
  if (!Number.isFinite(value)) {
    return value > 0 ? 1 : 0;
  }
  return Math.min(1, Math.max(0, value));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneKeyBindings(kb?: KeyBindings): KeyBindings {
  const source = kb ?? DEFAULT_KEY_BINDINGS;
  return {
    actions: {
      ...DEFAULT_KEY_BINDINGS.actions,
      ...(source.actions ?? {}),
    },
    pads: { ...(source.pads ?? {}) },
  };
}

function cloneSoundPads(pads: SoundPad[]): SoundPad[] {
  return pads.map((pad) => ({
    ...pad,
    tracks: pad.tracks.map((track) => ({ ...track })),
  }));
}

function cloneSavedRoster(roster: SavedRoster): SavedRoster {
  return {
    ...roster,
    roster: { ...roster.roster },
  };
}

function cloneSoundboardGroups(groups: SoundboardGroup[]): SoundboardGroup[] {
  return groups.map((group) => ({ ...group }));
}

function cloneMatchProfile(profile: MatchProfile): MatchProfile {
  return {
    ...profile,
    soundPads: cloneSoundPads(profile.soundPads),
    ...(profile.teams
      ? {
          teams: {
            home: {
              ...profile.teams.home,
              roster: { ...profile.teams.home.roster },
            },
            away: {
              ...profile.teams.away,
              roster: { ...profile.teams.away.roster },
            },
          },
        }
      : {}),
    ...(profile.settings
      ? {
          settings: {
            ...profile.settings,
            ...(profile.settings.scriptTemplates
              ? { scriptTemplates: { ...profile.settings.scriptTemplates } }
              : {}),
            ...(profile.settings.keyBindings
              ? { keyBindings: cloneKeyBindings(profile.settings.keyBindings) }
              : {}),
            ...(profile.settings.soundboardGroups
              ? {
                  soundboardGroups: cloneSoundboardGroups(
                    profile.settings.soundboardGroups,
                  ),
                }
              : {}),
          },
        }
      : {}),
  };
}

function cloneDefaultSnapshot(): MatchConfigSnapshot {
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    spotifyClientId: DEFAULT_SETTINGS.spotifyClientId || DEFAULT_SPOTIFY_CLIENT_ID,
    keyBindings: cloneKeyBindings(DEFAULT_KEY_BINDINGS),
    soundboardGroups: cloneSoundboardGroups(DEFAULT_SOUNDBOARD_GROUPS),
    scriptTemplates: { ...DEFAULT_SETTINGS.scriptTemplates },
  };

  return {
    version: 1,
    teams: {
      home: {
        ...DEFAULT_TEAMS.home,
        roster: { ...DEFAULT_TEAMS.home.roster },
      },
      away: {
        ...DEFAULT_TEAMS.away,
        roster: { ...DEFAULT_TEAMS.away.roster },
      },
    },
    soundPads: syncPadsWithKeyBindings(
      cloneSoundPads(DEFAULT_SOUND_PADS),
      settings.keyBindings,
    ),
    settings,
    savedRosters: DEFAULT_SAVED_ROSTERS.map(cloneSavedRoster),
    matchProfiles: DEFAULT_MATCH_PROFILES.map(cloneMatchProfile),
    activeProfileId: DEFAULT_MATCH_PROFILES[0]?.id ?? null,
  };
}

export function extractSpotifyTrackId(input: string): string | null {
  const trimmed = typeof input === 'string' ? input.trim() : '';
  if (!trimmed) {
    return null;
  }

  const uriMatch = SPOTIFY_URI_REGEX.exec(trimmed);
  if (uriMatch && SPOTIFY_ID_REGEX.test(uriMatch[1])) {
    return uriMatch[1];
  }

  const urlMatch = SPOTIFY_URL_REGEX.exec(trimmed);
  if (urlMatch && SPOTIFY_ID_REGEX.test(urlMatch[1])) {
    return urlMatch[1];
  }

  return null;
}

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    })
    .replace(/&([a-zA-Z]+);/g, (full, name: string) => {
      const mapped = NAMED_HTML_ENTITIES[name.toLowerCase()];
      return mapped ?? full;
    });
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function extractArtistsList(rawArtists: unknown): string {
  if (!Array.isArray(rawArtists)) {
    return '';
  }
  return rawArtists
    .map((artist) =>
      isPlainObject(artist) ? nonEmptyString(artist.name) : null,
    )
    .filter((name): name is string => name !== null)
    .join(', ');
}

function extractMetaContent(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      'i',
    ),
  ];
  for (const regex of patterns) {
    const match = regex.exec(html);
    if (match?.[1]) {
      const decoded = decodeHtmlEntities(match[1]).trim();
      if (decoded) {
        return decoded;
      }
    }
  }
  return null;
}

function extractArtistFromOgDescription(description: string): string {
  const withoutPrefix = description
    .trim()
    .replace(/^Listen to .+?\s+on Spotify\.\s*/i, '');
  if (!withoutPrefix) {
    return '';
  }

  if (withoutPrefix.includes('·') || withoutPrefix.includes('•')) {
    const parts = withoutPrefix
      .split(/[·•]/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      const firstLower = parts[0].toLowerCase();
      const secondLower = parts[1].toLowerCase();
      if (
        secondLower === 'song' ||
        secondLower === 'single' ||
        secondLower === 'track' ||
        secondLower === 'låt'
      ) {
        return parts[0];
      }
      if (
        firstLower === 'song' ||
        firstLower === 'single' ||
        firstLower === 'track' ||
        firstLower === 'låt'
      ) {
        return parts[1];
      }
      return parts[0];
    }
  }

  return '';
}

function splitTitleBySeparator(
  rawTitle: string,
): { title: string; artist: string } | null {
  const dashMatch = /^(.+?)\s+-\s+(.+)$/.exec(rawTitle);
  if (dashMatch) {
    const title = dashMatch[1].trim();
    const artist = dashMatch[2].trim();
    if (title && artist) {
      return { title, artist };
    }
  }

  const byMatch = /^(.+?)\s+by\s+(.+)$/i.exec(rawTitle);
  if (byMatch) {
    const title = byMatch[1].trim();
    const artist = byMatch[2].trim();
    if (title && artist) {
      return { title, artist };
    }
  }

  return null;
}

function parseSpotifyHtmlMetadata(
  html: string,
): { title: string; artist: string } | null {
  const nextDataMatch =
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(
      html,
    );
  if (nextDataMatch?.[1]) {
    try {
      const parsedJson: unknown = JSON.parse(nextDataMatch[1]);
      if (typeof parsedJson !== 'string') {
        const result = parseSpotifyMetadataPayload(parsedJson);
        if (result) {
          return result;
        }
      }
    } catch {
      // Ignore malformed __NEXT_DATA__ and fall back to title/meta tags
    }
  }

  const titleTagMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  let titleTagParsed: { title: string; artist: string } | null = null;
  let titleTagPlain: string | null = null;

  if (titleTagMatch?.[1]) {
    const cleanedTitleTag = decodeHtmlEntities(titleTagMatch[1])
      .replace(/\s*[|\-–—]\s*Spotify\s*$/i, '')
      .trim();

    if (
      cleanedTitleTag &&
      !/^spotify(?:\s*[–-]\s*web player.*)?$/i.test(cleanedTitleTag)
    ) {
      const songAndLyricsMatch =
        /^(.+?)\s+-\s+(?:song(?:\s+and\s+lyrics)?\s+by|låt(?:\s+och\s+text)?\s+av)\s+(.+)$/i.exec(
          cleanedTitleTag,
        );
      if (songAndLyricsMatch) {
        titleTagParsed = {
          title: songAndLyricsMatch[1].trim(),
          artist: songAndLyricsMatch[2].trim(),
        };
      } else {
        const split = splitTitleBySeparator(cleanedTitleTag);
        if (split) {
          titleTagParsed = split;
        } else {
          titleTagPlain = cleanedTitleTag;
        }
      }
    }
  }

  if (titleTagParsed && titleTagParsed.title) {
    return titleTagParsed;
  }

  const ogTitleRaw = extractMetaContent(html, 'og:title');
  const ogTitle =
    ogTitleRaw && !/^spotify(?:\s*[–-]\s*web player.*)?$/i.test(ogTitleRaw)
      ? ogTitleRaw
      : null;
  const ogDesc = extractMetaContent(html, 'og:description');
  const ogArtist = ogDesc ? extractArtistFromOgDescription(ogDesc) : '';

  if (ogTitle) {
    if (ogArtist) {
      return { title: ogTitle, artist: ogArtist };
    }
    const split = splitTitleBySeparator(ogTitle);
    if (split) {
      return split;
    }
    return { title: ogTitle, artist: '' };
  }

  if (titleTagPlain) {
    return { title: titleTagPlain, artist: ogArtist };
  }

  return null;
}

export function parseSpotifyMetadataPayload(
  payload: unknown,
): { title: string; artist: string } | null {
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.startsWith('{')) {
      try {
        const parsedJson: unknown = JSON.parse(trimmed);
        if (isPlainObject(parsedJson)) {
          return parseSpotifyMetadataPayload(parsedJson);
        }
      } catch {
        // Not valid JSON, continue with HTML parsing
      }
    }
    return parseSpotifyHtmlMetadata(payload);
  }

  if (!isPlainObject(payload)) {
    return null;
  }

  // 1. Spotify Embed __NEXT_DATA__
  if (
    isPlainObject(payload.props) &&
    isPlainObject(payload.props.pageProps) &&
    isPlainObject(payload.props.pageProps.state) &&
    isPlainObject(payload.props.pageProps.state.data) &&
    isPlainObject(payload.props.pageProps.state.data.entity)
  ) {
    const entity = payload.props.pageProps.state.data.entity;
    const title = nonEmptyString(entity.name) ?? nonEmptyString(entity.title);
    if (title) {
      const artist =
        extractArtistsList(entity.artists) ||
        nonEmptyString(entity.subtitle) ||
        '';
      return { title, artist };
    }
  }

  // 2. Normalized metadata payload ({ title, artist })
  const directTitle = nonEmptyString(payload.title);
  if (directTitle && typeof payload.artist === 'string') {
    return {
      title: directTitle,
      artist: payload.artist.trim(),
    };
  }

  // 3. Spotify Web API /v1/tracks/{id} ({ name, artists })
  const apiTitle = nonEmptyString(payload.name);
  if (apiTitle && Array.isArray(payload.artists)) {
    return {
      title: apiTitle,
      artist: extractArtistsList(payload.artists),
    };
  }

  // 4. Spotify /oembed ({ title, author_name? })
  if (directTitle) {
    const authorName = nonEmptyString(payload.author_name) ?? '';
    if (authorName && authorName.toLowerCase() !== 'spotify') {
      return {
        title: directTitle,
        artist: authorName,
      };
    }

    const split = splitTitleBySeparator(directTitle);
    if (split) {
      return split;
    }

    return {
      title: directTitle,
      artist: authorName.toLowerCase() === 'spotify' ? '' : authorName,
    };
  }

  return null;
}

export const ACCEPTED_AUDIO_EXTENSIONS = [
  '.mp3',
  '.wav',
  '.ogg',
  '.m4a',
  '.flac',
  '.aac',
  '.webm',
  '.opus',
] as const;

export function isAcceptedAudioFileName(fileName: string): boolean {
  if (typeof fileName !== 'string') {
    return false;
  }
  const trimmed = fileName.trim();
  if (!trimmed || trimmed.endsWith('/') || trimmed.endsWith('\\')) {
    return false;
  }
  const baseName = (trimmed.split(/[\\/]/).pop() ?? '').trim();
  if (!baseName || baseName.startsWith('.')) {
    return false;
  }
  const lower = baseName.toLowerCase();
  return ACCEPTED_AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function inferAudioMimeType(fileName: string): string {
  const lower = typeof fileName === 'string' ? fileName.trim().toLowerCase() : '';
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

function hashMediaPathHex(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 = Math.imul(h2 ^ (ch + i), 0x85ebca6b);
  }
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${part1}${part2}`.slice(0, 10);
}

export function buildEmbeddedMediaUri(relativePathOrName: string): string {
  const raw =
    typeof relativePathOrName === 'string' ? relativePathOrName.trim() : '';
  const normalized = raw
    .replace(/\\/g, '/')
    .replace(/^(\.\/)+/, '')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/');

  const slug = normalized
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');

  const hash = hashMediaPathHex(normalized || 'file');
  const suffix = slug ? `media-${slug}-${hash}` : `media-file-${hash}`;
  return `local:audio:${suffix}`;
}

export function isLocalAudioUri(input: string): boolean {
  if (typeof input !== 'string') {
    return false;
  }
  return LOCAL_AUDIO_URI_REGEX.test(input.trim());
}

export function createLocalAudioUri(id?: string): string {
  if (typeof id === 'string') {
    const trimmed = id.trim();
    if (LOCAL_AUDIO_URI_REGEX.test(trimmed)) {
      return trimmed;
    }
    const sanitized = trimmed
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120);
    if (sanitized.length >= 3) {
      return `local:audio:${sanitized}`;
    }
  }

  const timePart = Date.now().toString(36);
  let randomPart = '';
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.getRandomValues === 'function'
  ) {
    const bytes = new Uint8Array(6);
    globalThis.crypto.getRandomValues(bytes);
    randomPart = Array.from(bytes, (b) => b.toString(36).padStart(2, '0'))
      .join('')
      .slice(0, 8);
  } else {
    randomPart = Math.random().toString(36).slice(2, 10);
  }

  return `local:audio:${timePart}_${randomPart || 'track'}`;
}

export function parseLocalAudioFilename(fileName: string): {
  title: string;
  artist: string;
} {
  const rawBase =
    typeof fileName === 'string'
      ? (fileName.split(/[\\/]/).pop() ?? '')
      : '';
  const withoutExtension = rawBase.trim().replace(/\.[A-Za-z0-9]{2,5}$/, '');
  const cleaned = withoutExtension
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return {
      title: 'Lokal ljudfil',
      artist: 'Lokal ljudfil',
    };
  }

  const sepMatch = /^(.+?)\s+[-–]\s+(.+)$/.exec(cleaned);
  if (sepMatch) {
    const artist = sepMatch[1].trim();
    const title = sepMatch[2].trim();
    if (artist && title) {
      return { title, artist };
    }
  }

  return {
    title: cleaned,
    artist: 'Lokal ljudfil',
  };
}

export function tryParseSpotifyUri(
  input: string,
): { ok: true; uri: string } | { ok: false; error: string } {
  const trimmed = typeof input === 'string' ? input.trim() : '';
  if (!trimmed) {
    return {
      ok: false,
      error: 'Spotify-länk, URI eller lokal ljud-URI får inte vara tom.',
    };
  }

  const trackId = extractSpotifyTrackId(trimmed);
  if (trackId) {
    return { ok: true, uri: `spotify:track:${trackId}` };
  }

  if (isLocalAudioUri(trimmed)) {
    return { ok: true, uri: trimmed };
  }

  return {
    ok: false,
    error:
      'Ogiltig ljudlänk. Ange spotify:track:<id>, https://open.spotify.com/track/... eller local:audio:<id>.',
  };
}

export function parseSpotifyUri(input: string): string {
  const result = tryParseSpotifyUri(input);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.uri;
}

export function isValidMmSs(mmss: string): boolean {
  if (typeof mmss !== 'string') {
    return false;
  }
  return MM_SS_REGEX.test(mmss.trim());
}

export function parseTimeMmSsToMs(
  mmss: string,
  options?: { strict?: boolean },
): number {
  const trimmed = typeof mmss === 'string' ? mmss.trim() : '';
  if (!isValidMmSs(trimmed)) {
    if (options?.strict) {
      throw new Error(
        `Ogiltigt tidsformat "${mmss}". Ange tid i formatet MM:SS (t.ex. 00:45).`,
      );
    }
    return 0;
  }

  const [minPart, secPart] = trimmed.split(':');
  const minutes = Number.parseInt(minPart, 10);
  const seconds = Number.parseInt(secPart, 10);

  if (
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    minutes < 0 ||
    seconds < 0 ||
    seconds >= 60
  ) {
    if (options?.strict) {
      throw new Error(`Ogiltiga tidsvärden i "${mmss}".`);
    }
    return 0;
  }

  const ms = (minutes * 60 + seconds) * 1000;
  return Number.isFinite(ms) && ms >= 0 ? ms : 0;
}

export function formatMsToMmSs(ms: number): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) {
    return '00:00';
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function normalizeJerseyNumber(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  let cleaned = input.trim();
  if (!cleaned) {
    return '';
  }

  let prev: string;
  do {
    prev = cleaned;
    cleaned = cleaned
      .replace(/^#+\s*/, '')
      .replace(/^(?:nr|no)(?=$|[\s.:,\-–—#\d])\.?\s*/i, '')
      .replace(/^[\s.:,\-–—]+/, '')
      .replace(/[\s.:,\-–—]+$/, '')
      .trim();
  } while (cleaned !== prev);

  cleaned = cleaned.replace(/[\s.:,]+/g, '');
  return cleaned;
}

export function lookupPlayerName(
  roster: Record<string, string> | undefined,
  jerseyNumber: string,
): string | undefined {
  if (!roster || typeof jerseyNumber !== 'string') {
    return undefined;
  }

  const trimmed = jerseyNumber.trim();
  if (!trimmed) {
    return undefined;
  }

  const nonEmptyName = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined;

  if (Object.prototype.hasOwnProperty.call(roster, trimmed)) {
    const exactMatch = nonEmptyName(roster[trimmed]);
    if (exactMatch) {
      return exactMatch;
    }
  }

  const normalized = normalizeJerseyNumber(trimmed);
  if (!normalized) {
    return undefined;
  }

  if (
    normalized !== trimmed &&
    Object.prototype.hasOwnProperty.call(roster, normalized)
  ) {
    const normalizedMatch = nonEmptyName(roster[normalized]);
    if (normalizedMatch) {
      return normalizedMatch;
    }
  }

  const entries = Object.entries(roster);
  for (const [key, value] of entries) {
    if (normalizeJerseyNumber(key) === normalized) {
      const scanMatch = nonEmptyName(value);
      if (scanMatch) {
        return scanMatch;
      }
    }
  }

  if (/^\d+$/.test(normalized)) {
    const targetInt = Number.parseInt(normalized, 10);
    if (Number.isFinite(targetInt) && targetInt > 0) {
      for (const [key, value] of entries) {
        const normKey = normalizeJerseyNumber(key);
        if (/^\d+$/.test(normKey)) {
          const keyInt = Number.parseInt(normKey, 10);
          if (Number.isFinite(keyInt) && keyInt > 0 && keyInt === targetInt) {
            const intMatch = nonEmptyName(value);
            if (intMatch) {
              return intMatch;
            }
          }
        }
      }
    }
  }

  return undefined;
}

export function parseRosterText(text: string): Record<string, string> {
  if (typeof text !== 'string' || !text.trim()) {
    return {};
  }

  const roster: Record<string, string> = {};
  const lines = text.split(/\r?\n/);

  const prefixPattern =
    /^(?:(?:nr|no)\.?\s*[:.\-#]*|#\s*)*(\d+)\s*[.\s,;:\-–—\t]+\s*(.+)$/i;
  const suffixParenPattern =
    /^(.+?)\s*\(\s*(?:#\s*|(?:nr|no)\.?\s*[:.\-#]*\s*)?(\d+)\s*\)\s*$/i;
  const suffixTagPattern =
    /^(.+?)[\s,;:\-–—\t]+(?:#\s*|(?:nr|no)\.?\s*[:.\-#]*\s*)(\d+)\s*[.,:]?\s*$/i;
  const suffixBarePattern = /^(.+?)[\s,;:\-–—\t]+(\d{1,3})\s*$/;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    let rawNumber = '';
    let rawName = '';

    const prefixMatch = prefixPattern.exec(line);
    if (prefixMatch) {
      rawNumber = prefixMatch[1];
      rawName = prefixMatch[2];
    } else {
      const parenMatch = suffixParenPattern.exec(line);
      if (parenMatch) {
        rawName = parenMatch[1];
        rawNumber = parenMatch[2];
      } else {
        const tagMatch = suffixTagPattern.exec(line);
        if (tagMatch) {
          rawName = tagMatch[1];
          rawNumber = tagMatch[2];
        } else {
          const bareMatch = suffixBarePattern.exec(line);
          if (bareMatch) {
            rawName = bareMatch[1];
            rawNumber = bareMatch[2];
          }
        }
      }
    }

    if (!rawNumber || !rawName) {
      continue;
    }

    const jerseyNumber = normalizeJerseyNumber(rawNumber);
    const playerName = rawName
      .replace(/\t+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s\-–—:,;]+/, '')
      .trim();

    if (
      !jerseyNumber ||
      !playerName ||
      /^(?:nr|no)\.?$/i.test(playerName) ||
      !/[a-zA-ZåäöÅÄÖ]/.test(playerName)
    ) {
      continue;
    }

    roster[jerseyNumber] = playerName;
  }

  return roster;
}

export function selectNextTrack(pad: SoundPad): {
  track: TrackCue | null;
  nextIndex: number;
} {
  if (!pad.tracks || pad.tracks.length === 0) {
    return { track: null, nextIndex: -1 };
  }

  const current = pad.lastPlayedIndex;
  const hasValidCurrent =
    typeof current === 'number' &&
    Number.isInteger(current) &&
    current >= 0 &&
    current < pad.tracks.length;

  const nextIndex = hasValidCurrent ? (current + 1) % pad.tracks.length : 0;
  return {
    track: pad.tracks[nextIndex],
    nextIndex,
  };
}

export function calculateVolumeSteps(
  fromVolume: number,
  toVolume: number,
  durationMs: number,
  intervalMs = 50,
): number[] {
  const from = clampVolume(fromVolume);
  const to = clampVolume(toVolume);

  if (
    typeof durationMs !== 'number' ||
    typeof intervalMs !== 'number' ||
    !Number.isFinite(durationMs) ||
    !Number.isFinite(intervalMs) ||
    durationMs <= 0 ||
    intervalMs <= 0
  ) {
    return [to];
  }

  const stepsCount = Math.max(1, Math.round(durationMs / intervalMs));
  const steps: number[] = [];

  for (let i = 1; i <= stepsCount; i += 1) {
    if (i === stepsCount) {
      steps.push(to);
    } else {
      const interpolated = from + (to - from) * (i / stepsCount);
      steps.push(Number(clampVolume(interpolated).toFixed(4)));
    }
  }

  return steps;
}

function cleanScriptPunctuation(text: string): string {
  return text
    .replace(/,\s*,+/g, ',')
    .replace(/\s+,/g, ',')
    .replace(/,\s*\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function generatePenaltyScript(
  settings: AppSettings,
  params: {
    teamName: string;
    penaltyLabel: string;
    duration: string;
    playerNumber?: string;
    playerName?: string;
    isTeamPenalty?: boolean;
    roster?: Record<string, string>;
  },
): string {
  const team = params.teamName.trim() || 'Laget';
  const duration = params.duration.trim() || '2 minuter';
  const reason = params.penaltyLabel.trim() || 'utvisning';
  const rawPlayerNumber = params.playerNumber?.trim() ?? '';
  const playerNumber =
    normalizeJerseyNumber(rawPlayerNumber) || rawPlayerNumber;
  const playerName =
    params.playerName?.trim() ||
    (playerNumber ? lookupPlayerName(params.roster, playerNumber) : undefined) ||
    '';

  if (params.isTeamPenalty || !playerNumber) {
    const template =
      settings.scriptTemplates.penaltyTeam ||
      DEFAULT_SETTINGS.scriptTemplates.penaltyTeam;
    return cleanScriptPunctuation(
      template
        .replaceAll('{team}', team)
        .replaceAll('{duration}', duration)
        .replaceAll('{reason}', reason),
    );
  }

  let template =
    settings.scriptTemplates.penalty || DEFAULT_SETTINGS.scriptTemplates.penalty;

  if (!playerName) {
    template = template.replace(/,?\s*\{(?:name|playerName|scorerName)\}/g, '');
  }

  return cleanScriptPunctuation(
    template
      .replaceAll('{team}', team)
      .replaceAll('{number}', playerNumber)
      .replaceAll('{playerNumber}', playerNumber)
      .replaceAll('{scorerNumber}', playerNumber)
      .replaceAll('{name}', playerName)
      .replaceAll('{playerName}', playerName)
      .replaceAll('{scorerName}', playerName)
      .replaceAll('{duration}', duration)
      .replaceAll('{reason}', reason),
  );
}

export function generateGoalScript(
  settings: AppSettings,
  params: {
    teamName: string;
    scorerNumber: string;
    scorerName?: string;
    assists?: Array<{ number: string; name?: string }>;
    roster?: Record<string, string>;
  },
): string {
  const team = params.teamName.trim() || 'Laget';
  const rawScorerNumber = params.scorerNumber?.trim() ?? '';
  const scorerNumber =
    normalizeJerseyNumber(rawScorerNumber) || rawScorerNumber || '?';
  const scorerName =
    params.scorerName?.trim() ||
    (scorerNumber !== '?'
      ? lookupPlayerName(params.roster, scorerNumber)
      : undefined) ||
    '';

  const validAssists = (params.assists ?? [])
    .map((assist) => {
      const rawAssistNum = assist.number?.trim() ?? '';
      const number = normalizeJerseyNumber(rawAssistNum) || rawAssistNum;
      const name =
        assist.name?.trim() ||
        (number ? lookupPlayerName(params.roster, number) : undefined) ||
        '';
      return { number, name };
    })
    .filter((assist) => assist.number.length > 0);

  const formattedAssists = validAssists.map((assist) =>
    assist.name
      ? `nummer ${assist.number} ${assist.name}`
      : `nummer ${assist.number}`,
  );

  let assistsText = '';
  if (formattedAssists.length === 1) {
    assistsText = formattedAssists[0];
  } else if (formattedAssists.length === 2) {
    assistsText = `${formattedAssists[0]} och ${formattedAssists[1]}`;
  } else if (formattedAssists.length > 2) {
    const last = formattedAssists[formattedAssists.length - 1];
    const head = formattedAssists.slice(0, -1).join(', ');
    assistsText = `${head} och ${last}`;
  }

  let template =
    validAssists.length > 0
      ? settings.scriptTemplates.goalWithAssist ||
        DEFAULT_SETTINGS.scriptTemplates.goalWithAssist
      : settings.scriptTemplates.goal || DEFAULT_SETTINGS.scriptTemplates.goal;

  const hasGoalNamePlaceholder =
    template.includes('{scorerName}') ||
    template.includes('{name}') ||
    template.includes('{playerName}');

  if (scorerName) {
    if (!hasGoalNamePlaceholder && template.includes('{scorerNumber}')) {
      template = template.replaceAll(
        '{scorerNumber}',
        '{scorerNumber}, {scorerName}',
      );
    }
  } else {
    template = template.replace(
      /,?\s*\{(?:scorerName|name|playerName)\}/g,
      '',
    );
  }

  return cleanScriptPunctuation(
    template
      .replaceAll('{team}', team)
      .replaceAll('{scorerNumber}', scorerNumber)
      .replaceAll('{number}', scorerNumber)
      .replaceAll('{playerNumber}', scorerNumber)
      .replaceAll('{scorerName}', scorerName)
      .replaceAll('{name}', scorerName)
      .replaceAll('{playerName}', scorerName)
      .replaceAll('{assists}', assistsText),
  );
}

function bytesToBase64Url(bytes: Uint8Array): string {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let base64 = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const hasB1 = i + 1 < bytes.length;
    const hasB2 = i + 2 < bytes.length;
    const b1 = hasB1 ? bytes[i + 1] : 0;
    const b2 = hasB2 ? bytes[i + 2] : 0;

    const triplet = (b0 << 16) | (b1 << 8) | b2;
    base64 += alphabet[(triplet >> 18) & 0x3f];
    base64 += alphabet[(triplet >> 12) & 0x3f];
    base64 += hasB1 ? alphabet[(triplet >> 6) & 0x3f] : '=';
    base64 += hasB2 ? alphabet[triplet & 0x3f] : '=';
  }

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function generatePkceVerifier(length = 64): string {
  const safeLength = Math.min(128, Math.max(43, Math.floor(length)));
  const randomBytes = new Uint8Array(safeLength);
  globalThis.crypto.getRandomValues(randomBytes);

  let verifier = '';
  for (let i = 0; i < safeLength; i += 1) {
    verifier += PKCE_CHARSET[randomBytes[i] % PKCE_CHARSET.length];
  }
  return verifier;
}

export async function generatePkceChallenge(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  return bytesToBase64Url(new Uint8Array(digest));
}

const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const;

const MODIFIER_ALIASES: Record<string, (typeof MODIFIER_ORDER)[number]> = {
  ctrl: 'Ctrl',
  control: 'Ctrl',
  ctrlkey: 'Ctrl',
  alt: 'Alt',
  option: 'Alt',
  altkey: 'Alt',
  altgr: 'Alt',
  shift: 'Shift',
  shiftkey: 'Shift',
  meta: 'Meta',
  cmd: 'Meta',
  command: 'Meta',
  super: 'Meta',
  win: 'Meta',
  windows: 'Meta',
  os: 'Meta',
  metakey: 'Meta',
};

const STANDALONE_MODIFIER_KEYS = new Set([
  'shift',
  'shiftleft',
  'shiftright',
  'control',
  'controlleft',
  'controlright',
  'ctrl',
  'alt',
  'altleft',
  'altright',
  'altgraph',
  'meta',
  'metaleft',
  'metaright',
  'os',
  'osleft',
  'osright',
  'super',
  'win',
  'cmd',
  'command',
  'option',
  'dead',
  'unidentified',
  'process',
]);

const NAMED_KEY_MAP: Record<string, string> = {
  space: 'Space',
  spacebar: 'Space',
  esc: 'Escape',
  escape: 'Escape',
  enter: 'Enter',
  return: 'Enter',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  del: 'Delete',
  insert: 'Insert',
  ins: 'Insert',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  arrowup: 'ArrowUp',
  up: 'ArrowUp',
  arrowdown: 'ArrowDown',
  down: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  left: 'ArrowLeft',
  arrowright: 'ArrowRight',
  right: 'ArrowRight',
  plus: 'Plus',
};

function normalizeBaseKeyToken(rawToken: string): string {
  if (rawToken === ' ') {
    return 'Space';
  }
  const trimmed = rawToken.trim();
  if (!trimmed) {
    return '';
  }

  const lower = trimmed.toLowerCase();
  if (STANDALONE_MODIFIER_KEYS.has(lower) || lower in MODIFIER_ALIASES) {
    return '';
  }

  if (lower in NAMED_KEY_MAP) {
    return NAMED_KEY_MAP[lower];
  }

  const keyLetterMatch = /^key([a-z])$/i.exec(trimmed);
  if (keyLetterMatch) {
    return keyLetterMatch[1].toUpperCase();
  }

  const digitMatch = /^digit([0-9])$/i.exec(trimmed);
  if (digitMatch) {
    return digitMatch[1];
  }

  const numpadDigitMatch = /^numpad([0-9])$/i.exec(trimmed);
  if (numpadDigitMatch) {
    return `Numpad${numpadDigitMatch[1]}`;
  }

  const fnMatch = /^f([1-9]|1[0-9]|2[0-4])$/i.exec(trimmed);
  if (fnMatch) {
    return `F${fnMatch[1]}`;
  }

  if (/^[a-zåäö]$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  if (/^[0-9]$/.test(trimmed)) {
    return trimmed;
  }

  if (trimmed === '+') {
    return 'Plus';
  }

  if (trimmed.length === 1 && !/\s/.test(trimmed)) {
    return trimmed;
  }

  return '';
}

export function normalizeHotkeyString(input: string): string {
  if (typeof input !== 'string' || input.length === 0) {
    return '';
  }

  if (input === ' ') {
    return 'Space';
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed === '+') {
    return 'Plus';
  }

  const parts = trimmed
    .split('+')
    .map((part) => (part === ' ' ? 'Space' : part.trim()))
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return '';
  }

  const modifiers = new Set<(typeof MODIFIER_ORDER)[number]>();
  const keys: string[] = [];

  for (const part of parts) {
    const lower = part.toLowerCase();
    const mappedModifier = MODIFIER_ALIASES[lower];
    if (mappedModifier) {
      modifiers.add(mappedModifier);
    } else {
      keys.push(part);
    }
  }

  if (keys.length !== 1) {
    return '';
  }

  const normalizedKey = normalizeBaseKeyToken(keys[0]);
  if (!normalizedKey) {
    return '';
  }

  const orderedModifiers = MODIFIER_ORDER.filter((mod) => modifiers.has(mod));
  return [...orderedModifiers, normalizedKey].join('+');
}

export function formatHotkeyFromEvent(event: {
  key: string;
  code?: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}): string {
  if (!event || typeof event.key !== 'string') {
    return '';
  }

  const lowerKey = event.key.toLowerCase();
  const lowerCode = typeof event.code === 'string' ? event.code.toLowerCase() : '';
  if (
    STANDALONE_MODIFIER_KEYS.has(lowerKey) ||
    (lowerCode && STANDALONE_MODIFIER_KEYS.has(lowerCode))
  ) {
    return '';
  }

  let baseKey = '';
  const code = typeof event.code === 'string' ? event.code : '';
  if (code) {
    if (code === 'Space') {
      baseKey = 'Space';
    } else {
      const codeKeyMatch = /^Key([A-Z])$/i.exec(code);
      const codeDigitMatch = /^Digit([0-9])$/i.exec(code);
      const codeFnMatch = /^F([1-9]|1[0-9]|2[0-4])$/i.exec(code);
      const codeNumpadMatch = /^Numpad([0-9])$/i.exec(code);

      if (codeKeyMatch) {
        baseKey = codeKeyMatch[1].toUpperCase();
      } else if (codeDigitMatch) {
        baseKey = codeDigitMatch[1];
      } else if (codeFnMatch) {
        baseKey = `F${codeFnMatch[1]}`;
      } else if (codeNumpadMatch) {
        baseKey = `Numpad${codeNumpadMatch[1]}`;
      }
    }
  }

  if (!baseKey) {
    baseKey = normalizeBaseKeyToken(event.key);
  }

  if (!baseKey) {
    return '';
  }

  const parts: string[] = [];
  if (event.ctrlKey) {
    parts.push('Ctrl');
  }
  if (event.altKey) {
    parts.push('Alt');
  }
  if (event.shiftKey) {
    parts.push('Shift');
  }
  if (event.metaKey) {
    parts.push('Meta');
  }
  parts.push(baseKey);

  return normalizeHotkeyString(parts.join('+'));
}

export function assignHotkey(
  bindings: KeyBindings,
  target: { type: 'action'; id: MatchActionId } | { type: 'pad'; id: string },
  hotkey: string,
): { keyBindings: KeyBindings; replacedTarget: string | null } {
  const base = cloneKeyBindings(bindings);
  const normalized = normalizeHotkeyString(hotkey);

  if (!normalized) {
    if (target.type === 'action') {
      base.actions[target.id] = '';
    } else {
      delete base.pads[target.id];
    }
    return {
      keyBindings: base,
      replacedTarget: null,
    };
  }

  let replacedTarget: string | null = null;

  for (const actionId of MATCH_ACTION_IDS) {
    if (target.type === 'action' && actionId === target.id) {
      continue;
    }
    const existing = normalizeHotkeyString(base.actions[actionId] ?? '');
    if (existing && existing === normalized) {
      base.actions[actionId] = '';
      if (!replacedTarget) {
        replacedTarget = `action:${actionId}`;
      }
    }
  }

  for (const padId of Object.keys(base.pads)) {
    if (target.type === 'pad' && padId === target.id) {
      continue;
    }
    const existing = normalizeHotkeyString(base.pads[padId] ?? '');
    if (existing && existing === normalized) {
      delete base.pads[padId];
      if (!replacedTarget) {
        replacedTarget = `pad:${padId}`;
      }
    }
  }

  if (target.type === 'action') {
    base.actions[target.id] = normalized;
  } else {
    base.pads[target.id] = normalized;
  }

  return {
    keyBindings: base,
    replacedTarget,
  };
}

export function resolveHotkeyMatch(
  bindings: KeyBindings,
  hotkey: string,
): { type: 'action'; id: MatchActionId } | { type: 'pad'; id: string } | null {
  const normalized = normalizeHotkeyString(hotkey);
  if (!normalized || !bindings) {
    return null;
  }

  for (const actionId of MATCH_ACTION_IDS) {
    const bound = normalizeHotkeyString(bindings.actions?.[actionId] ?? '');
    if (bound && bound === normalized) {
      return { type: 'action', id: actionId };
    }
  }

  for (const [padId, rawBound] of Object.entries(bindings.pads ?? {})) {
    const bound = normalizeHotkeyString(rawBound ?? '');
    if (bound && bound === normalized) {
      return { type: 'pad', id: padId };
    }
  }

  return null;
}

export function sanitizeKeyBindings(
  rawBindings: unknown,
  fallback?: KeyBindings,
  validPadIds?: Set<string>,
): KeyBindings {
  const base = cloneKeyBindings(fallback ?? DEFAULT_KEY_BINDINGS);
  const rawActions =
    isPlainObject(rawBindings) && isPlainObject(rawBindings.actions)
      ? rawBindings.actions
      : null;
  const rawPads =
    isPlainObject(rawBindings) && isPlainObject(rawBindings.pads)
      ? rawBindings.pads
      : null;

  const usedHotkeys = new Set<string>();
  const actions = {} as Record<MatchActionId, string>;

  for (const actionId of MATCH_ACTION_IDS) {
    let candidate = '';
    if (rawActions && actionId in rawActions) {
      const rawVal = rawActions[actionId];
      candidate = typeof rawVal === 'string' ? normalizeHotkeyString(rawVal) : '';
    } else {
      candidate = normalizeHotkeyString(base.actions[actionId] ?? '');
    }

    if (candidate && !usedHotkeys.has(candidate)) {
      usedHotkeys.add(candidate);
      actions[actionId] = candidate;
    } else {
      actions[actionId] = '';
    }
  }

  const pads: Record<string, string> = {};
  const padSource = rawPads ?? base.pads;
  for (const [rawPadId, rawVal] of Object.entries(padSource)) {
    const padId = rawPadId.trim();
    if (!padId) {
      continue;
    }
    if (validPadIds && !validPadIds.has(padId)) {
      continue;
    }
    if (typeof rawVal !== 'string') {
      continue;
    }
    const normalized = normalizeHotkeyString(rawVal);
    if (!normalized || usedHotkeys.has(normalized)) {
      continue;
    }
    usedHotkeys.add(normalized);
    pads[padId] = normalized;
  }

  return {
    actions,
    pads,
  };
}

export function syncPadsWithKeyBindings(
  pads: SoundPad[],
  keyBindings: KeyBindings,
): SoundPad[] {
  return pads.map((pad) => {
    const bound = normalizeHotkeyString(keyBindings.pads[pad.id] ?? '');
    if (bound) {
      return { ...pad, hotkey: bound };
    }
    const { hotkey: _removed, ...rest } = pad;
    return rest;
  });
}

function sanitizeRosterRecord(rawRoster: Record<string, unknown>): Record<string, string> {
  const roster: Record<string, string> = {};
  for (const [key, val] of Object.entries(rawRoster)) {
    const num = normalizeJerseyNumber(key);
    if (num && typeof val === 'string' && val.trim()) {
      roster[num] = val.trim();
    }
  }
  return roster;
}

function sanitizeTeam(
  rawTeam: unknown,
  id: 'home' | 'away',
  fallback: Team,
): Team {
  if (!isPlainObject(rawTeam)) {
    return { ...fallback, roster: { ...fallback.roster } };
  }

  const name =
    typeof rawTeam.name === 'string' && rawTeam.name.trim()
      ? rawTeam.name.trim()
      : fallback.name;

  const color =
    typeof rawTeam.color === 'string' && HEX_COLOR_REGEX.test(rawTeam.color.trim())
      ? rawTeam.color.trim()
      : fallback.color;

  const roster = isPlainObject(rawTeam.roster)
    ? sanitizeRosterRecord(rawTeam.roster)
    : { ...fallback.roster };

  return {
    id,
    name,
    color,
    roster,
  };
}

function sanitizeTrackCue(rawTrack: unknown): TrackCue | null {
  if (!isPlainObject(rawTrack)) {
    return null;
  }

  const rawUri = typeof rawTrack.trackUri === 'string' ? rawTrack.trackUri : '';
  const parsedUri = tryParseSpotifyUri(rawUri);
  if (!parsedUri.ok) {
    return null;
  }

  const title =
    typeof rawTrack.title === 'string' && rawTrack.title.trim()
      ? rawTrack.title.trim()
      : 'Okänd låt';
  const artist =
    typeof rawTrack.artist === 'string' ? rawTrack.artist.trim() : '';
  const startTimeMs = clampNumber(
    Number(rawTrack.startTimeMs),
    0,
    3_600_000,
    0,
  );

  const isLocal = isLocalAudioUri(parsedUri.uri);
  const sourceType: TrackSourceType | undefined = isLocal
    ? 'local'
    : rawTrack.sourceType === 'spotify'
      ? 'spotify'
      : undefined;
  const localFileName = isLocal ? nonEmptyString(rawTrack.localFileName) : null;
  const mimeType = isLocal ? nonEmptyString(rawTrack.mimeType) : null;

  return {
    trackUri: parsedUri.uri,
    title,
    artist,
    startTimeMs: Math.round(startTimeMs),
    ...(sourceType ? { sourceType } : {}),
    ...(localFileName ? { localFileName } : {}),
    ...(mimeType ? { mimeType } : {}),
  };
}

function formatGroupLabelFromId(groupId: string): string {
  const words = groupId
    .split(/[-_\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
  return words.length > 0 ? words.join(' ') : groupId;
}

function normalizeSoundboardGroupList(rawList: unknown): SoundboardGroup[] {
  if (!Array.isArray(rawList)) {
    return [];
  }
  const seenIds = new Set<string>();
  const normalized: SoundboardGroup[] = [];

  for (const item of rawList) {
    if (!isPlainObject(item)) {
      continue;
    }
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    if (!id || !label || EVENT_CATEGORY_SET.has(id) || seenIds.has(id)) {
      continue;
    }
    seenIds.add(id);
    const isBuiltin =
      typeof item.isBuiltin === 'boolean'
        ? item.isBuiltin
        : BUILTIN_GROUP_ID_SET.has(id)
          ? true
          : undefined;
    normalized.push({
      id,
      label,
      ...(isBuiltin !== undefined ? { isBuiltin } : {}),
    });
  }

  return normalized;
}

export function sanitizeSoundboardGroups(
  rawGroups: unknown,
  fallback?: SoundboardGroup[],
  soundPads?: SoundPad[],
): SoundboardGroup[] {
  const fromRaw =
    Array.isArray(rawGroups) && rawGroups.length > 0
      ? normalizeSoundboardGroupList(rawGroups)
      : [];

  let groups = fromRaw;
  if (groups.length === 0) {
    const fromFallback =
      Array.isArray(fallback) && fallback.length > 0
        ? normalizeSoundboardGroupList(fallback)
        : [];
    groups =
      fromFallback.length > 0
        ? fromFallback
        : cloneSoundboardGroups(DEFAULT_SOUNDBOARD_GROUPS);
  }

  if (Array.isArray(soundPads)) {
    const seenIds = new Set(groups.map((group) => group.id));
    for (const pad of soundPads) {
      const categoryId =
        typeof pad?.category === 'string' ? pad.category.trim() : '';
      if (
        !categoryId ||
        EVENT_CATEGORY_SET.has(categoryId) ||
        seenIds.has(categoryId)
      ) {
        continue;
      }
      seenIds.add(categoryId);
      const isBuiltin = Object.prototype.hasOwnProperty.call(
        PAD_CATEGORY_LABELS,
        categoryId,
      );
      const label = isBuiltin
        ? PAD_CATEGORY_LABELS[categoryId as BuiltinPadCategory]
        : formatGroupLabelFromId(categoryId);
      groups.push({
        id: categoryId,
        label,
        ...(isBuiltin ? { isBuiltin: true } : {}),
      });
    }
  }

  return groups;
}

function sanitizeSoundPads(
  rawPads: unknown,
  fallback: SoundPad[],
): SoundPad[] {
  if (!Array.isArray(rawPads)) {
    return cloneSoundPads(fallback);
  }

  const sanitized: SoundPad[] = [];
  rawPads.forEach((rawPad, index) => {
    if (!isPlainObject(rawPad)) {
      return;
    }

    const id =
      typeof rawPad.id === 'string' && rawPad.id.trim()
        ? rawPad.id.trim()
        : `pad-imported-${index + 1}`;
    const label =
      typeof rawPad.label === 'string' && rawPad.label.trim()
        ? rawPad.label.trim()
        : `Ljudknapp ${index + 1}`;
    const rawCategory =
      typeof rawPad.category === 'string' ? rawPad.category.trim() : '';
    const category: PadCategory = rawCategory || 'misc';
    const color =
      typeof rawPad.color === 'string' && HEX_COLOR_REGEX.test(rawPad.color.trim())
        ? rawPad.color.trim()
        : '#334155';

    const tracks = Array.isArray(rawPad.tracks)
      ? rawPad.tracks
          .map(sanitizeTrackCue)
          .filter((track): track is TrackCue => track !== null)
      : [];

    const volume =
      rawPad.volume !== undefined
        ? clampVolume(Number(rawPad.volume))
        : 1.0;

    let lastPlayedIndex: number | undefined;
    if (
      typeof rawPad.lastPlayedIndex === 'number' &&
      Number.isInteger(rawPad.lastPlayedIndex) &&
      rawPad.lastPlayedIndex >= 0 &&
      rawPad.lastPlayedIndex < tracks.length
    ) {
      lastPlayedIndex = rawPad.lastPlayedIndex;
    }

    const triggerFlow =
      typeof rawPad.triggerFlow === 'string' &&
      VALID_TRIGGER_FLOWS.has(rawPad.triggerFlow)
        ? (rawPad.triggerFlow as SoundPad['triggerFlow'])
        : null;

    const hotkey =
      typeof rawPad.hotkey === 'string'
        ? normalizeHotkeyString(rawPad.hotkey)
        : '';

    sanitized.push({
      id,
      label,
      category,
      color,
      tracks,
      lastPlayedIndex,
      volume,
      triggerFlow,
      ...(hotkey ? { hotkey } : {}),
    });
  });

  return sanitized;
}

function sanitizeSettings(
  rawSettings: unknown,
  fallback: AppSettings,
  validPadIds?: Set<string>,
  soundPads?: SoundPad[],
): AppSettings {
  const defaultClientId = fallback.spotifyClientId || DEFAULT_SPOTIFY_CLIENT_ID;
  const fallbackAwayGoalSilence =
    typeof fallback.awayGoalSilence === 'boolean'
      ? fallback.awayGoalSilence
      : DEFAULT_SETTINGS.awayGoalSilence;
  const fallbackCrossfadeEnabled =
    typeof fallback.crossfadeEnabled === 'boolean'
      ? fallback.crossfadeEnabled
      : DEFAULT_SETTINGS.crossfadeEnabled;
  const fallbackCrossfadeDurationMs = Math.round(
    clampNumber(
      Number(fallback.crossfadeDurationMs),
      0,
      5000,
      DEFAULT_SETTINGS.crossfadeDurationMs,
    ),
  );
  const fallbackTtsEnabled =
    typeof fallback.ttsEnabled === 'boolean'
      ? fallback.ttsEnabled
      : DEFAULT_SETTINGS.ttsEnabled;
  const fallbackTtsEngine = isValidTtsEngine(fallback.ttsEngine)
    ? fallback.ttsEngine
    : DEFAULT_SETTINGS.ttsEngine;
  const fallbackTtsVoiceId =
    typeof fallback.ttsVoiceId === 'string' &&
    isValidPiperVoiceId(fallback.ttsVoiceId)
      ? fallback.ttsVoiceId
      : DEFAULT_SETTINGS.ttsVoiceId;
  const fallbackTtsRate = clampNumber(
    toNumericInput(fallback.ttsRate),
    0.5,
    2.0,
    DEFAULT_SETTINGS.ttsRate,
  );
  const fallbackTtsVolume = clampNumber(
    toNumericInput(fallback.ttsVolume),
    0.0,
    1.0,
    DEFAULT_SETTINGS.ttsVolume,
  );
  const fallbackTtsAutoRead =
    typeof fallback.ttsAutoRead === 'boolean'
      ? fallback.ttsAutoRead
      : DEFAULT_SETTINGS.ttsAutoRead;
  const fallbackTtsRestoreMusicAfter =
    typeof fallback.ttsRestoreMusicAfter === 'boolean'
      ? fallback.ttsRestoreMusicAfter
      : DEFAULT_SETTINGS.ttsRestoreMusicAfter;

  if (!isPlainObject(rawSettings)) {
    return {
      ...fallback,
      crossfadeEnabled: fallbackCrossfadeEnabled,
      crossfadeDurationMs: fallbackCrossfadeDurationMs,
      awayGoalSilence: fallbackAwayGoalSilence,
      ttsEnabled: fallbackTtsEnabled,
      ttsEngine: fallbackTtsEngine,
      ttsVoiceId: fallbackTtsVoiceId,
      ttsRate: fallbackTtsRate,
      ttsVolume: fallbackTtsVolume,
      ttsAutoRead: fallbackTtsAutoRead,
      ttsRestoreMusicAfter: fallbackTtsRestoreMusicAfter,
      spotifyClientId: defaultClientId,
      keyBindings: sanitizeKeyBindings(
        undefined,
        fallback.keyBindings,
        validPadIds,
      ),
      soundboardGroups: sanitizeSoundboardGroups(
        undefined,
        fallback.soundboardGroups,
        soundPads,
      ),
      scriptTemplates: { ...fallback.scriptTemplates },
    };
  }

  const rawTemplates = isPlainObject(rawSettings.scriptTemplates)
    ? rawSettings.scriptTemplates
    : {};

  const rawClientId =
    typeof rawSettings.spotifyClientId === 'string'
      ? rawSettings.spotifyClientId.trim()
      : '';

  const rawCrossfadeDuration =
    typeof rawSettings.crossfadeDurationMs === 'number'
      ? rawSettings.crossfadeDurationMs
      : typeof rawSettings.crossfadeDurationMs === 'string' &&
          rawSettings.crossfadeDurationMs.trim() !== ''
        ? Number(rawSettings.crossfadeDurationMs)
        : Number.NaN;

  const resolvedTtsEngine =
    rawSettings.ttsEngine === undefined
      ? fallbackTtsEngine
      : isValidTtsEngine(rawSettings.ttsEngine)
        ? rawSettings.ttsEngine
        : DEFAULT_SETTINGS.ttsEngine;

  const resolvedTtsVoiceId =
    rawSettings.ttsVoiceId === undefined
      ? fallbackTtsVoiceId
      : typeof rawSettings.ttsVoiceId === 'string' &&
          isValidPiperVoiceId(rawSettings.ttsVoiceId.trim())
        ? (rawSettings.ttsVoiceId.trim() as PiperVoiceId)
        : DEFAULT_SETTINGS.ttsVoiceId;

  return {
    duckVolume: clampNumber(
      Number(rawSettings.duckVolume),
      0.0,
      1.0,
      fallback.duckVolume,
    ),
    fadeOutDurationMs: Math.round(
      clampNumber(
        Number(rawSettings.fadeOutDurationMs),
        0,
        10000,
        fallback.fadeOutDurationMs,
      ),
    ),
    crossfadeEnabled:
      typeof rawSettings.crossfadeEnabled === 'boolean'
        ? rawSettings.crossfadeEnabled
        : fallbackCrossfadeEnabled,
    crossfadeDurationMs: Math.round(
      clampNumber(
        rawCrossfadeDuration,
        0,
        5000,
        fallbackCrossfadeDurationMs,
      ),
    ),
    awayGoalSilence:
      typeof rawSettings.awayGoalSilence === 'boolean'
        ? rawSettings.awayGoalSilence
        : fallbackAwayGoalSilence,
    ttsEnabled:
      typeof rawSettings.ttsEnabled === 'boolean'
        ? rawSettings.ttsEnabled
        : fallbackTtsEnabled,
    ttsEngine: resolvedTtsEngine,
    ttsVoiceId: resolvedTtsVoiceId,
    ttsRate: clampNumber(
      toNumericInput(rawSettings.ttsRate),
      0.5,
      2.0,
      fallbackTtsRate,
    ),
    ttsVolume: clampNumber(
      toNumericInput(rawSettings.ttsVolume),
      0.0,
      1.0,
      fallbackTtsVolume,
    ),
    ttsAutoRead:
      typeof rawSettings.ttsAutoRead === 'boolean'
        ? rawSettings.ttsAutoRead
        : fallbackTtsAutoRead,
    ttsRestoreMusicAfter:
      typeof rawSettings.ttsRestoreMusicAfter === 'boolean'
        ? rawSettings.ttsRestoreMusicAfter
        : fallbackTtsRestoreMusicAfter,
    spotifyClientId: rawClientId || defaultClientId,
    spotifyRedirectUri:
      typeof rawSettings.spotifyRedirectUri === 'string' &&
      rawSettings.spotifyRedirectUri.trim()
        ? rawSettings.spotifyRedirectUri.trim()
        : fallback.spotifyRedirectUri,
    keyBindings: sanitizeKeyBindings(
      rawSettings.keyBindings,
      fallback.keyBindings,
      validPadIds,
    ),
    soundboardGroups: sanitizeSoundboardGroups(
      rawSettings.soundboardGroups,
      fallback.soundboardGroups,
      soundPads,
    ),
    scriptTemplates: {
      penalty:
        typeof rawTemplates.penalty === 'string' && rawTemplates.penalty.trim()
          ? rawTemplates.penalty
          : fallback.scriptTemplates.penalty,
      penaltyTeam:
        typeof rawTemplates.penaltyTeam === 'string' &&
        rawTemplates.penaltyTeam.trim()
          ? rawTemplates.penaltyTeam
          : fallback.scriptTemplates.penaltyTeam,
      goal:
        typeof rawTemplates.goal === 'string' && rawTemplates.goal.trim()
          ? rawTemplates.goal
          : fallback.scriptTemplates.goal,
      goalWithAssist:
        typeof rawTemplates.goalWithAssist === 'string' &&
        rawTemplates.goalWithAssist.trim()
          ? rawTemplates.goalWithAssist
          : fallback.scriptTemplates.goalWithAssist,
    },
  };
}

export function sanitizeSavedRoster(
  rawRoster: unknown,
  fallbackIndex = 0,
): SavedRoster | null {
  if (!isPlainObject(rawRoster)) {
    return null;
  }

  const id =
    typeof rawRoster.id === 'string' && rawRoster.id.trim()
      ? rawRoster.id.trim()
      : `roster-imported-${fallbackIndex + 1}`;

  const rawTeamName =
    typeof rawRoster.teamName === 'string' ? rawRoster.teamName.trim() : '';
  const rawName =
    typeof rawRoster.name === 'string' ? rawRoster.name.trim() : '';
  const teamName = rawTeamName || rawName || `Lag ${fallbackIndex + 1}`;
  const name = rawName || teamName;

  const color =
    typeof rawRoster.color === 'string' && HEX_COLOR_REGEX.test(rawRoster.color.trim())
      ? rawRoster.color.trim()
      : '#2563eb';

  const ageGroupOrClub =
    typeof rawRoster.ageGroupOrClub === 'string' && rawRoster.ageGroupOrClub.trim()
      ? rawRoster.ageGroupOrClub.trim()
      : undefined;

  const roster = isPlainObject(rawRoster.roster)
    ? sanitizeRosterRecord(rawRoster.roster)
    : {};

  const updatedAt =
    typeof rawRoster.updatedAt === 'string' && rawRoster.updatedAt.trim()
      ? rawRoster.updatedAt.trim()
      : '2026-01-01T00:00:00.000Z';

  return {
    id,
    name,
    teamName,
    color,
    ...(ageGroupOrClub ? { ageGroupOrClub } : {}),
    roster,
    updatedAt,
  };
}

export function sanitizeMatchProfile(
  rawProfile: unknown,
  fallbackIndex = 0,
): MatchProfile | null {
  if (!isPlainObject(rawProfile)) {
    return null;
  }

  const id =
    typeof rawProfile.id === 'string' && rawProfile.id.trim()
      ? rawProfile.id.trim()
      : `profile-imported-${fallbackIndex + 1}`;

  const name =
    typeof rawProfile.name === 'string' && rawProfile.name.trim()
      ? rawProfile.name.trim()
      : `Matchprofil ${fallbackIndex + 1}`;

  const clubOrAgeGroup =
    typeof rawProfile.clubOrAgeGroup === 'string' &&
    rawProfile.clubOrAgeGroup.trim()
      ? rawProfile.clubOrAgeGroup.trim()
      : undefined;

  let soundPads = sanitizeSoundPads(rawProfile.soundPads, DEFAULT_SOUND_PADS);
  const validPadIds = new Set(soundPads.map((p) => p.id));

  const teams = isPlainObject(rawProfile.teams)
    ? {
        home: sanitizeTeam(rawProfile.teams.home, 'home', DEFAULT_TEAMS.home),
        away: sanitizeTeam(rawProfile.teams.away, 'away', DEFAULT_TEAMS.away),
      }
    : undefined;

  let settings: MatchProfile['settings'];
  if (isPlainObject(rawProfile.settings)) {
    const rawSettings = rawProfile.settings;
    const sanitizedSettings: NonNullable<MatchProfile['settings']> = {};

    if (rawSettings.duckVolume !== undefined) {
      sanitizedSettings.duckVolume = clampNumber(
        Number(rawSettings.duckVolume),
        0.0,
        1.0,
        DEFAULT_SETTINGS.duckVolume,
      );
    }

    if (rawSettings.fadeOutDurationMs !== undefined) {
      sanitizedSettings.fadeOutDurationMs = Math.round(
        clampNumber(
          Number(rawSettings.fadeOutDurationMs),
          0,
          10000,
          DEFAULT_SETTINGS.fadeOutDurationMs,
        ),
      );
    }

    if (typeof rawSettings.crossfadeEnabled === 'boolean') {
      sanitizedSettings.crossfadeEnabled = rawSettings.crossfadeEnabled;
    }

    if (
      typeof rawSettings.crossfadeDurationMs === 'number' ||
      (typeof rawSettings.crossfadeDurationMs === 'string' &&
        rawSettings.crossfadeDurationMs.trim() !== '')
    ) {
      sanitizedSettings.crossfadeDurationMs = Math.round(
        clampNumber(
          Number(rawSettings.crossfadeDurationMs),
          0,
          5000,
          DEFAULT_SETTINGS.crossfadeDurationMs,
        ),
      );
    }

    if (typeof rawSettings.awayGoalSilence === 'boolean') {
      sanitizedSettings.awayGoalSilence = rawSettings.awayGoalSilence;
    }

    if (typeof rawSettings.ttsEnabled === 'boolean') {
      sanitizedSettings.ttsEnabled = rawSettings.ttsEnabled;
    }

    if (rawSettings.ttsEngine !== undefined) {
      sanitizedSettings.ttsEngine = isValidTtsEngine(rawSettings.ttsEngine)
        ? rawSettings.ttsEngine
        : DEFAULT_SETTINGS.ttsEngine;
    }

    if (rawSettings.ttsVoiceId !== undefined) {
      sanitizedSettings.ttsVoiceId =
        typeof rawSettings.ttsVoiceId === 'string' &&
        isValidPiperVoiceId(rawSettings.ttsVoiceId.trim())
          ? (rawSettings.ttsVoiceId.trim() as PiperVoiceId)
          : DEFAULT_SETTINGS.ttsVoiceId;
    }

    if (rawSettings.ttsRate !== undefined) {
      sanitizedSettings.ttsRate = clampNumber(
        toNumericInput(rawSettings.ttsRate),
        0.5,
        2.0,
        DEFAULT_SETTINGS.ttsRate,
      );
    }

    if (rawSettings.ttsVolume !== undefined) {
      sanitizedSettings.ttsVolume = clampNumber(
        toNumericInput(rawSettings.ttsVolume),
        0.0,
        1.0,
        DEFAULT_SETTINGS.ttsVolume,
      );
    }

    if (typeof rawSettings.ttsAutoRead === 'boolean') {
      sanitizedSettings.ttsAutoRead = rawSettings.ttsAutoRead;
    }

    if (typeof rawSettings.ttsRestoreMusicAfter === 'boolean') {
      sanitizedSettings.ttsRestoreMusicAfter = rawSettings.ttsRestoreMusicAfter;
    }

    if (isPlainObject(rawSettings.scriptTemplates)) {
      const tpl = rawSettings.scriptTemplates;
      sanitizedSettings.scriptTemplates = {
        penalty:
          typeof tpl.penalty === 'string' && tpl.penalty.trim()
            ? tpl.penalty
            : DEFAULT_SETTINGS.scriptTemplates.penalty,
        penaltyTeam:
          typeof tpl.penaltyTeam === 'string' && tpl.penaltyTeam.trim()
            ? tpl.penaltyTeam
            : DEFAULT_SETTINGS.scriptTemplates.penaltyTeam,
        goal:
          typeof tpl.goal === 'string' && tpl.goal.trim()
            ? tpl.goal
            : DEFAULT_SETTINGS.scriptTemplates.goal,
        goalWithAssist:
          typeof tpl.goalWithAssist === 'string' && tpl.goalWithAssist.trim()
            ? tpl.goalWithAssist
            : DEFAULT_SETTINGS.scriptTemplates.goalWithAssist,
      };
    }

    if (isPlainObject(rawSettings.keyBindings)) {
      sanitizedSettings.keyBindings = sanitizeKeyBindings(
        rawSettings.keyBindings,
        DEFAULT_KEY_BINDINGS,
        validPadIds,
      );
      soundPads = syncPadsWithKeyBindings(
        soundPads,
        sanitizedSettings.keyBindings,
      );
    }

    if (rawSettings.soundboardGroups !== undefined) {
      sanitizedSettings.soundboardGroups = sanitizeSoundboardGroups(
        rawSettings.soundboardGroups,
        DEFAULT_SOUNDBOARD_GROUPS,
        soundPads,
      );
    }

    settings = sanitizedSettings;
  }

  const updatedAt =
    typeof rawProfile.updatedAt === 'string' && rawProfile.updatedAt.trim()
      ? rawProfile.updatedAt.trim()
      : '2026-01-01T00:00:00.000Z';

  return {
    id,
    name,
    ...(clubOrAgeGroup ? { clubOrAgeGroup } : {}),
    soundPads,
    ...(teams ? { teams } : {}),
    ...(settings ? { settings } : {}),
    updatedAt,
  };
}

export function sanitizeMatchConfig(
  raw: unknown,
  fallback?: MatchConfigSnapshot,
): MatchConfigSnapshot {
  const base = fallback ?? cloneDefaultSnapshot();
  if (!isPlainObject(raw)) {
    return base;
  }

  // Support Zustand persist envelope `{ state: { teams, soundPads, settings, ... }, version }`
  const source = isPlainObject(raw.state) ? raw.state : raw;
  const rawTeams = isPlainObject(source.teams) ? source.teams : {};

  const rawSanitizedPads = sanitizeSoundPads(source.soundPads, base.soundPads);
  const validPadIds = new Set(rawSanitizedPads.map((pad) => pad.id));

  let settings = sanitizeSettings(
    source.settings,
    base.settings,
    validPadIds,
    rawSanitizedPads,
  );

  // If legacy/imported snapshot had no explicit keyBindings, adopt any valid pad.hotkey
  const hasExplicitKeyBindings =
    isPlainObject(source.settings) && isPlainObject(source.settings.keyBindings);
  if (!hasExplicitKeyBindings) {
    let adoptedBindings = settings.keyBindings;
    for (const pad of rawSanitizedPads) {
      if (pad.hotkey) {
        const alreadyTaken = resolveHotkeyMatch(adoptedBindings, pad.hotkey);
        if (!alreadyTaken) {
          adoptedBindings = assignHotkey(
            adoptedBindings,
            { type: 'pad', id: pad.id },
            pad.hotkey,
          ).keyBindings;
        }
      }
    }
    settings = {
      ...settings,
      keyBindings: adoptedBindings,
    };
  }

  const soundPads = syncPadsWithKeyBindings(
    rawSanitizedPads,
    settings.keyBindings,
  );

  const savedRosters = Array.isArray(source.savedRosters)
    ? source.savedRosters
        .map((item, idx) => sanitizeSavedRoster(item, idx))
        .filter((item): item is SavedRoster => item !== null)
    : (base.savedRosters ?? DEFAULT_SAVED_ROSTERS).map(cloneSavedRoster);

  const matchProfiles = Array.isArray(source.matchProfiles)
    ? source.matchProfiles
        .map((item, idx) => sanitizeMatchProfile(item, idx))
        .filter((item): item is MatchProfile => item !== null)
    : (base.matchProfiles ?? DEFAULT_MATCH_PROFILES).map(cloneMatchProfile);

  let activeProfileId: string | null = null;
  if (typeof source.activeProfileId === 'string' && source.activeProfileId.trim()) {
    const candidateId = source.activeProfileId.trim();
    activeProfileId = matchProfiles.some((p) => p.id === candidateId)
      ? candidateId
      : null;
  } else if (source.activeProfileId === null) {
    activeProfileId = null;
  } else if (!Array.isArray(source.soundPads) && base.activeProfileId) {
    activeProfileId = matchProfiles.some((p) => p.id === base.activeProfileId)
      ? base.activeProfileId
      : null;
  }

  return {
    version:
      typeof raw.version === 'number' && Number.isFinite(raw.version)
        ? raw.version
        : 1,
    teams: {
      home: sanitizeTeam(rawTeams.home, 'home', base.teams.home),
      away: sanitizeTeam(rawTeams.away, 'away', base.teams.away),
    },
    soundPads,
    settings,
    savedRosters,
    matchProfiles,
    activeProfileId,
  };
}

export function exportMatchConfig(state: MatchConfigSnapshot): string {
  const normalized = sanitizeMatchConfig(state);
  return JSON.stringify(normalized, null, 2);
}

export function importMatchConfig(jsonString: string): MatchConfigSnapshot {
  if (typeof jsonString !== 'string' || !jsonString.trim()) {
    throw new Error('Konfigurationsfilen är tom.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error('Ogiltig JSON-syntax i konfigurationsfilen.');
  }

  if (!isPlainObject(parsed)) {
    throw new Error('Konfigurationen måste vara ett JSON-objekt.');
  }

  return sanitizeMatchConfig(parsed);
}

export function tryImportMatchConfig(
  jsonString: string,
): { ok: true; config: MatchConfigSnapshot } | { ok: false; error: string } {
  try {
    const config = importMatchConfig(jsonString);
    return { ok: true, config };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Kunde inte importera konfigurationen.',
    };
  }
}

export function serializeMatchConfigJson(state: MatchConfigSnapshot): string {
  return exportMatchConfig(state);
}

export function parseMatchConfigJson(
  jsonString: string,
  fallback?: MatchConfigSnapshot,
): MatchConfigSnapshot {
  try {
    if (typeof jsonString !== 'string' || !jsonString.trim()) {
      return fallback ?? cloneDefaultSnapshot();
    }
    const parsed: unknown = JSON.parse(jsonString);
    return sanitizeMatchConfig(parsed, fallback);
  } catch {
    return fallback ?? cloneDefaultSnapshot();
  }
}
