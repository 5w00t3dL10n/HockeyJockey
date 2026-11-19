import {
  ALL_PAD_CATEGORIES,
  DEFAULT_KEY_BINDINGS,
  DEFAULT_MATCH_PROFILES,
  DEFAULT_SAVED_ROSTERS,
  DEFAULT_SETTINGS,
  DEFAULT_SOUND_PADS,
  DEFAULT_SPOTIFY_CLIENT_ID,
  DEFAULT_TEAMS,
  MATCH_ACTION_IDS,
} from '../data/defaults.ts';
import type {
  AppSettings,
  KeyBindings,
  MatchActionId,
  MatchConfigSnapshot,
  MatchProfile,
  PadCategory,
  SavedRoster,
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
): AppSettings {
  const defaultClientId = fallback.spotifyClientId || DEFAULT_SPOTIFY_CLIENT_ID;
  if (!isPlainObject(rawSettings)) {
    return {
      ...fallback,
      spotifyClientId: defaultClientId,
      keyBindings: sanitizeKeyBindings(
        undefined,
        fallback.keyBindings,
        validPadIds,
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

  const roster: Record<string, string> = {};
  if (isPlainObject(rawRoster.roster)) {
    for (const [key, val] of Object.entries(rawRoster.roster)) {
      const num = key.trim();
      if (num && typeof val === 'string' && val.trim()) {
        roster[num] = val.trim();
      }
    }
  }

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

  let settings = sanitizeSettings(source.settings, base.settings, validPadIds);

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
