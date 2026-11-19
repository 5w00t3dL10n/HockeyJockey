import {
  ALL_PAD_CATEGORIES,
  DEFAULT_SETTINGS,
  DEFAULT_SOUND_PADS,
  DEFAULT_TEAMS,
} from '../data/defaults.ts';
import type {
  AppSettings,
  MatchConfigSnapshot,
  PadCategory,
  SoundPad,
  Team,
  TrackCue,
} from '../types/models.ts';

const SPOTIFY_ID_REGEX = /^[A-Za-z0-9]{22}$/;
const SPOTIFY_URI_REGEX = /^spotify:track:([A-Za-z0-9]{22})$/;
const SPOTIFY_URL_REGEX =
  /^https?:\/\/open\.spotify\.com\/(?:intl-[A-Za-z0-9-]+\/)?track\/([A-Za-z0-9]{22})(?:[/?#].*)?$/i;
const MM_SS_REGEX = /^\d+:[0-5]\d$/;
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const PKCE_CHARSET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

const VALID_CATEGORIES = new Set<PadCategory>(ALL_PAD_CATEGORIES);
const VALID_TRIGGER_FLOWS = new Set([
  'penalty_home',
  'penalty_away',
  'goal_home',
  'goal_away',
]);

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

function cloneDefaultSnapshot(): MatchConfigSnapshot {
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
    soundPads: DEFAULT_SOUND_PADS.map((pad) => ({
      ...pad,
      tracks: pad.tracks.map((track) => ({ ...track })),
    })),
    settings: {
      ...DEFAULT_SETTINGS,
      scriptTemplates: { ...DEFAULT_SETTINGS.scriptTemplates },
    },
  };
}

export function tryParseSpotifyUri(
  input: string,
): { ok: true; uri: string } | { ok: false; error: string } {
  const trimmed = typeof input === 'string' ? input.trim() : '';
  if (!trimmed) {
    return { ok: false, error: 'Spotify-länk eller URI får inte vara tom.' };
  }

  const uriMatch = SPOTIFY_URI_REGEX.exec(trimmed);
  if (uriMatch && SPOTIFY_ID_REGEX.test(uriMatch[1])) {
    return { ok: true, uri: `spotify:track:${uriMatch[1]}` };
  }

  const urlMatch = SPOTIFY_URL_REGEX.exec(trimmed);
  if (urlMatch && SPOTIFY_ID_REGEX.test(urlMatch[1])) {
    return { ok: true, uri: `spotify:track:${urlMatch[1]}` };
  }

  return {
    ok: false,
    error:
      'Ogiltig Spotify-länk. Ange spotify:track:<id> eller en giltig https://open.spotify.com/track/...-länk.',
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

export function parseRosterText(text: string): Record<string, string> {
  if (typeof text !== 'string' || !text.trim()) {
    return {};
  }

  const roster: Record<string, string> = {};
  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const match = /^#?(\d+)[\s,;:\-–—\t]+(.+)$/.exec(line);
    if (!match) {
      continue;
    }

    const jerseyNumber = match[1];
    const playerName = match[2].replace(/\s+/g, ' ').trim();
    if (jerseyNumber && playerName) {
      roster[jerseyNumber] = playerName;
    }
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
  },
): string {
  const team = params.teamName.trim() || 'Laget';
  const duration = params.duration.trim() || '2 minuter';
  const reason = params.penaltyLabel.trim() || 'utvisning';
  const playerNumber = params.playerNumber?.trim() ?? '';
  const playerName = params.playerName?.trim() ?? '';

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
    template = template.replace(/,?\s*\{name\}/g, '');
  }

  return cleanScriptPunctuation(
    template
      .replaceAll('{team}', team)
      .replaceAll('{number}', playerNumber)
      .replaceAll('{name}', playerName)
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
  },
): string {
  const team = params.teamName.trim() || 'Laget';
  const scorerNumber = params.scorerNumber.trim() || '?';
  const scorerName = params.scorerName?.trim() ?? '';

  const validAssists = (params.assists ?? [])
    .map((assist) => ({
      number: assist.number.trim(),
      name: assist.name?.trim() ?? '',
    }))
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

  if (!scorerName) {
    template = template.replace(/,?\s*\{scorerName\}/g, '');
  }

  return cleanScriptPunctuation(
    template
      .replaceAll('{team}', team)
      .replaceAll('{scorerNumber}', scorerNumber)
      .replaceAll('{scorerName}', scorerName)
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

  const roster: Record<string, string> = {};
  if (isPlainObject(rawTeam.roster)) {
    for (const [key, val] of Object.entries(rawTeam.roster)) {
      const num = key.trim();
      if (num && typeof val === 'string' && val.trim()) {
        roster[num] = val.trim();
      }
    }
  } else {
    Object.assign(roster, fallback.roster);
  }

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

  return {
    trackUri: parsedUri.uri,
    title,
    artist,
    startTimeMs: Math.round(startTimeMs),
  };
}

function sanitizeSoundPads(
  rawPads: unknown,
  fallback: SoundPad[],
): SoundPad[] {
  if (!Array.isArray(rawPads)) {
    return fallback.map((pad) => ({
      ...pad,
      tracks: pad.tracks.map((track) => ({ ...track })),
    }));
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
    const category =
      typeof rawPad.category === 'string' &&
      VALID_CATEGORIES.has(rawPad.category as PadCategory)
        ? (rawPad.category as PadCategory)
        : 'misc';
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

    sanitized.push({
      id,
      label,
      category,
      color,
      tracks,
      lastPlayedIndex,
      volume,
      triggerFlow,
    });
  });

  return sanitized;
}

function sanitizeSettings(
  rawSettings: unknown,
  fallback: AppSettings,
): AppSettings {
  if (!isPlainObject(rawSettings)) {
    return {
      ...fallback,
      scriptTemplates: { ...fallback.scriptTemplates },
    };
  }

  const rawTemplates = isPlainObject(rawSettings.scriptTemplates)
    ? rawSettings.scriptTemplates
    : {};

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
    spotifyClientId:
      typeof rawSettings.spotifyClientId === 'string'
        ? rawSettings.spotifyClientId.trim()
        : fallback.spotifyClientId,
    spotifyRedirectUri:
      typeof rawSettings.spotifyRedirectUri === 'string' &&
      rawSettings.spotifyRedirectUri.trim()
        ? rawSettings.spotifyRedirectUri.trim()
        : fallback.spotifyRedirectUri,
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

export function sanitizeMatchConfig(
  raw: unknown,
  fallback?: MatchConfigSnapshot,
): MatchConfigSnapshot {
  const base = fallback ?? cloneDefaultSnapshot();
  if (!isPlainObject(raw)) {
    return base;
  }

  // Support Zustand persist envelope `{ state: { teams, soundPads, settings }, version }`
  const source = isPlainObject(raw.state) ? raw.state : raw;
  const rawTeams = isPlainObject(source.teams) ? source.teams : {};

  return {
    version:
      typeof raw.version === 'number' && Number.isFinite(raw.version)
        ? raw.version
        : 1,
    teams: {
      home: sanitizeTeam(rawTeams.home, 'home', base.teams.home),
      away: sanitizeTeam(rawTeams.away, 'away', base.teams.away),
    },
    soundPads: sanitizeSoundPads(source.soundPads, base.soundPads),
    settings: sanitizeSettings(source.settings, base.settings),
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
