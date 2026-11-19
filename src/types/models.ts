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

export interface TrackCue {
  trackUri: string; // "spotify:track:..."
  title: string;
  artist: string;
  startTimeMs: number;
}

export type PadCategory =
  | 'goal_home'
  | 'goal_away'
  | 'penalty_home'
  | 'penalty_away'
  | 'faceoff_off'
  | 'faceoff_def'
  | 'hype'
  | 'organ'
  | 'misc';

export interface SoundPad {
  id: string;
  label: string;
  category: PadCategory;
  color: string;
  tracks: TrackCue[]; // En eller flera låtar (roteras om > 1)
  lastPlayedIndex?: number;
  volume?: number; // Default 1.0
  triggerFlow?: 'penalty_home' | 'penalty_away' | 'goal_home' | 'goal_away' | null;
}

export interface PenaltyDefinition {
  id: string;
  labelSv: string; // T.ex. "Ruffing"
  labelEn: string; // T.ex. "Roughing"
  iconKey: string; // Referens till SVG-komponent
}

export interface AppSettings {
  duckVolume: number; // T.ex. 0.2
  fadeOutDurationMs: number; // T.ex. 600
  spotifyClientId: string;
  spotifyRedirectUri: string;
  scriptTemplates: {
    penalty: string; // "{team} drar på sig en utvisning genom nummer {number}, {name}, {duration} för {reason}."
    penaltyTeam: string; // "Lagstraff för {team}, {duration} för {reason}."
    goal: string; // "Mål för {team}! Målskytt nummer {scorerNumber}, {scorerName}."
    goalWithAssist: string; // "Mål för {team}! Målskytt nummer {scorerNumber}, {scorerName}. Framspelad av {assists}."
  };
}

export interface MatchConfigSnapshot {
  version: number;
  teams: {
    home: Team;
    away: Team;
  };
  soundPads: SoundPad[];
  settings: AppSettings;
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
