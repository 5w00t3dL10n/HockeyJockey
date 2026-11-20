export interface Player {
  number: string; // String för att hantera ev. "00" eller ledande nollor
  name: string;
}

export interface Team {
  id: 'home' | 'away';
  name: string;
  color: string; // Hex-kod för visuell tydlighet i UI
  roster: Record<string, string>; // Key: tröjnummer, Value: spelarnamn
}

export type TrackSourceType = 'spotify' | 'local';

export interface TrackCue {
  trackUri: string; // "spotify:track:..." eller "local:audio:..."
  title: string;
  artist: string;
  startTimeMs: number;
  sourceType?: TrackSourceType;
  localFileName?: string;
  mimeType?: string;
}

export type BuiltinPadCategory =
  | 'goal_home'
  | 'goal_away'
  | 'penalty_home'
  | 'penalty_away'
  | 'faceoff_off'
  | 'faceoff_def'
  | 'hype'
  | 'organ'
  | 'misc';

export type PadCategory = BuiltinPadCategory | (string & {});

export interface SoundboardGroup {
  id: string;
  label: string;
  isBuiltin?: boolean;
}

export type MatchActionId =
  | 'fadeOut'
  | 'hardStop'
  | 'toggleDuck'
  | 'goalHome'
  | 'goalAway'
  | 'penaltyHome'
  | 'penaltyAway';

export interface KeyBindings {
  actions: Record<MatchActionId, string>;
  pads: Record<string, string>;
}

export interface SoundPad {
  id: string;
  label: string;
  category: PadCategory;
  color: string;
  tracks: TrackCue[]; // En eller flera låtar (roteras om > 1)
  lastPlayedIndex?: number;
  volume?: number; // Default 1.0
  triggerFlow?: 'penalty_home' | 'penalty_away' | 'goal_home' | 'goal_away' | null;
  hotkey?: string;
}

export interface PenaltyDefinition {
  id: string;
  labelSv: string; // T.ex. "Ruffing"
  labelEn: string; // T.ex. "Roughing"
  iconKey: string; // Referens till SVG-komponent
}

export type TtsEngineType = 'piper' | 'webspeech';

export type PiperVoiceId =
  | 'sv_SE-nst-medium'
  | 'sv_SE-lisa-medium'
  | 'sv_SE-alma-medium';

export type TtsAudioProfile = 'studio' | 'booth' | 'arena_pa';

export interface TtsDspChainConfig {
  profile: TtsAudioProfile;
  bypass: boolean;
  highpassHz: number;
  chestPeakHz: number;
  chestGainDb: number;
  chestQ: number;
  presencePeakHz: number;
  presenceGainDb: number;
  presenceQ: number;
  deHarshLowpassHz: number;
  deHarshQ: number;
  compressor: {
    thresholdDb: number;
    kneeDb: number;
    ratio: number;
    attackSec: number;
    releaseSec: number;
    makeupGain: number;
  };
  slapbackDelaySec: number;
  slapbackFeedback: number;
  reverbDurationSec: number;
  reverbDecay: number;
  reverbHighpassHz: number;
  reverbLowpassHz: number;
  wetMix: number;
  dryMix: number;
}

export interface TtsVoiceStatus {
  id: PiperVoiceId;
  label: string;
  available: boolean;
}

export interface TtsStatusResponse {
  available: boolean;
  engine: 'piper';
  voices: TtsVoiceStatus[];
}

export interface AppSettings {
  duckVolume: number; // T.ex. 0.2
  fadeOutDurationMs: number; // T.ex. 600
  crossfadeEnabled: boolean; // Mjuk Fade Out / Fade In vid byte från pågående låt
  crossfadeDurationMs: number; // Tid per riktning i ms (default 350)
  awayGoalSilence: boolean;
  ttsEnabled: boolean;
  ttsEngine: TtsEngineType;
  ttsVoiceId: PiperVoiceId;
  ttsRate: number; // 0.5–2.0 (default 1.0)
  ttsVolume: number; // 0.0–1.0 (default 1.0)
  ttsAutoRead: boolean;
  ttsRestoreMusicAfter: boolean;
  ttsAudioProfile: TtsAudioProfile;
  ttsDramaticPauses: boolean;
  ttsSentenceSilenceSec: number; // 0.1–1.5 (default 0.45)
  ttsExpressiveness: number; // 0.3–1.2 (default 0.72)
  ttsArenaReverbMix: number; // 0.0–0.8 (default 0.22)
  ttsPreChimeEnabled: boolean;
  spotifyClientId: string;
  spotifyRedirectUri: string;
  keyBindings: KeyBindings;
  soundboardGroups: SoundboardGroup[];
  scriptTemplates: {
    penalty: string; // "{team} drar på sig en utvisning genom nummer {number}, {name}, {duration} för {reason}."
    penaltyTeam: string; // "Lagstraff för {team}, {duration} för {reason}."
    goal: string; // "Mål för {team}! Målskytt nummer {scorerNumber}, {scorerName}."
    goalWithAssist: string; // "Mål för {team}! Målskytt nummer {scorerNumber}, {scorerName}. Framspelad av {assists}."
  };
}

export interface SavedRoster {
  id: string;
  name: string;
  teamName: string;
  color: string;
  ageGroupOrClub?: string;
  roster: Record<string, string>;
  updatedAt: string;
}

export interface MatchProfile {
  id: string;
  name: string;
  clubOrAgeGroup?: string;
  soundPads: SoundPad[];
  teams?: {
    home: Team;
    away: Team;
  };
  settings?: Partial<
    Pick<
      AppSettings,
      | 'duckVolume'
      | 'fadeOutDurationMs'
      | 'crossfadeEnabled'
      | 'crossfadeDurationMs'
      | 'awayGoalSilence'
      | 'ttsEnabled'
      | 'ttsEngine'
      | 'ttsVoiceId'
      | 'ttsRate'
      | 'ttsVolume'
      | 'ttsAutoRead'
      | 'ttsRestoreMusicAfter'
      | 'ttsAudioProfile'
      | 'ttsDramaticPauses'
      | 'ttsSentenceSilenceSec'
      | 'ttsExpressiveness'
      | 'ttsArenaReverbMix'
      | 'ttsPreChimeEnabled'
      | 'scriptTemplates'
      | 'keyBindings'
      | 'soundboardGroups'
    >
  >;
  updatedAt: string;
}

export interface MatchConfigSnapshot {
  version: number;
  teams: {
    home: Team;
    away: Team;
  };
  soundPads: SoundPad[];
  settings: AppSettings;
  savedRosters?: SavedRoster[];
  matchProfiles?: MatchProfile[];
  activeProfileId?: string | null;
}

export type AppMode = 'match' | 'setup';

export type AudioConnectionMode = 'spotify' | 'simulated';

export interface AudioStateSnapshot {
  mode: AudioConnectionMode;
  isPlaying: boolean;
  isDucked: boolean;
  volume: number;
  positionMs: number;
  currentTrack: TrackCue | null;
  deviceName: string;
  deviceId: string | null;
  statusMessage: string;
  error: string | null;
}

export interface SpotifyTokenState {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: string;
  scope: string;
}
