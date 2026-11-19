import {
  Disc3,
  FileAudio,
  Layers,
  LogIn,
  LogOut,
  Mic,
  RefreshCw,
  Settings,
  Sliders,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { DEFAULT_KEY_BINDINGS } from '../data/defaults.ts';
import type {
  AppMode,
  AudioStateSnapshot,
  KeyBindings,
  MatchProfile,
} from '../types/models.ts';
import { formatMsToMmSs, isLocalAudioUri } from '../utils/domain.ts';

interface TopBarProps {
  mode: AppMode;
  onChangeMode: (mode: AppMode) => void;
  audioState: AudioStateSnapshot;
  isSpotifyAuthenticated: boolean;
  hasSpotifyClientId: boolean;
  duckVolume: number;
  keyBindings?: KeyBindings;
  matchProfiles?: MatchProfile[];
  activeProfileId?: string | null;
  onSelectProfile?: (profileId: string) => void;
  onConnectSpotify: () => void;
  onReconnectSpotify?: () => void;
  onLogoutSpotify: () => void;
  onVolumeChange: (volume: number) => void;
  onFadeOut: () => void;
  onHardStop: () => void;
  onToggleDuck: () => void;
}

export function TopBar({
  mode,
  onChangeMode,
  audioState,
  isSpotifyAuthenticated,
  hasSpotifyClientId,
  duckVolume,
  keyBindings = DEFAULT_KEY_BINDINGS,
  matchProfiles = [],
  activeProfileId = null,
  onSelectProfile,
  onConnectSpotify,
  onReconnectSpotify,
  onLogoutSpotify,
  onVolumeChange,
  onFadeOut,
  onHardStop,
  onToggleDuck,
}: TopBarProps) {
  const volumePercent = Math.round(audioState.volume * 100);
  const duckPercent = Math.round(duckVolume * 100);
  const isSpotifyConnected = audioState.mode === 'spotify';
  const isCurrentLocal =
    audioState.currentTrack !== null &&
    (audioState.currentTrack.sourceType === 'local' ||
      isLocalAudioUri(audioState.currentTrack.trackUri));

  const duckHotkey = keyBindings.actions.toggleDuck;
  const fadeOutHotkey = keyBindings.actions.fadeOut;
  const hardStopHotkey = keyBindings.actions.hardStop;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/95 backdrop-blur-md shadow-lg">
      <div className="mx-auto max-w-[1600px] px-4 py-3 space-y-3">
        {/* Top Row: Brand, Spotify Status, Profile Switcher, Mode Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-400">
                <Disc3
                  className={`h-6 w-6 ${audioState.isPlaying ? 'animate-spin' : ''}`}
                  style={{ animationDuration: '3s' }}
                />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-100 leading-tight">
                  Hockey DJ &amp; Speaker
                </h1>
                <p className="text-xs text-slate-400">
                  Matchsekretariat &amp; Teleprompter
                </p>
              </div>
            </div>

            {/* Spotify / Simulated Status Badge */}
            <div
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                isSpotifyConnected
                  ? 'border-emerald-500/40 bg-emerald-950/60 text-emerald-300'
                  : 'border-amber-500/40 bg-amber-950/50 text-amber-300'
              }`}
              title={audioState.statusMessage}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  isSpotifyConnected
                    ? 'bg-emerald-400 animate-pulse'
                    : 'bg-amber-400'
                }`}
              />
              <span>
                {isSpotifyConnected
                  ? `Spotify: ${audioState.deviceName || 'Hockey DJ Booth'}`
                  : 'Simulerat Läge'}
              </span>
            </div>

            {audioState.isPlaying && isCurrentLocal && (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/40 bg-cyan-950/60 px-3 py-1 text-xs font-semibold text-cyan-200">
                <FileAudio className="h-3.5 w-3.5" />
                <span>Spelar lokal ljudfil</span>
              </div>
            )}

            {isSpotifyAuthenticated ? (
              <div className="inline-flex items-center gap-2">
                {audioState.mode === 'simulated' && onReconnectSpotify && (
                  <button
                    type="button"
                    onClick={onReconnectSpotify}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-700/30 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-700/50 transition-colors cursor-pointer"
                    title="Sök efter aktiv Spotify-enhet eller återanslut webbspelaren"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Återanslut Spotify
                  </button>
                )}
                <button
                  type="button"
                  onClick={onLogoutSpotify}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Logga ut
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onConnectSpotify}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/50 bg-emerald-700/30 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-700/50 transition-colors cursor-pointer"
                title={
                  hasSpotifyClientId
                    ? 'Logga in med Spotify Premium'
                    : 'Ange Spotify Client ID i Förberedelseläget för att ansluta'
                }
              >
                <LogIn className="h-3.5 w-3.5" />
                Anslut Spotify
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Quick Match Profile Selector */}
            {matchProfiles.length > 0 && onSelectProfile && (
              <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/80 px-2.5 py-1.5">
                <Layers className="h-4 w-4 text-blue-400 shrink-0" />
                <label
                  htmlFor="topbar-profile-select"
                  className="text-xs font-bold text-slate-400 hidden sm:inline"
                >
                  Profil:
                </label>
                <select
                  id="topbar-profile-select"
                  aria-label="Aktiv matchprofil"
                  value={activeProfileId ?? ''}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    if (nextId) {
                      onSelectProfile(nextId);
                    }
                    e.currentTarget.blur();
                  }}
                  className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-bold text-slate-100 focus:outline-none cursor-pointer"
                >
                  {!activeProfileId && (
                    <option value="">Anpassad (ej sparad)</option>
                  )}
                  {matchProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                      {profile.clubOrAgeGroup
                        ? ` (${profile.clubOrAgeGroup})`
                        : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Mode Switcher */}
            <nav
              aria-label="Huvudlägen"
              className="inline-flex rounded-xl border border-slate-700 bg-slate-950 p-1"
            >
              <button
                type="button"
                onClick={() => onChangeMode('match')}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors cursor-pointer ${
                  mode === 'match'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Sliders className="h-4 w-4" />
                Matchläge
              </button>
              <button
                type="button"
                onClick={() => onChangeMode('setup')}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors cursor-pointer ${
                  mode === 'setup'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Settings className="h-4 w-4" />
                Förberedelseläge
              </button>
            </nav>
          </div>
        </div>

        {/* Bottom Row: Current Track + Volume + Permanent Global Booth Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/80 p-3">
          {/* Now Playing & Volume */}
          <div className="flex flex-wrap items-center gap-4 min-w-0 flex-1">
            <div className="min-w-[200px] flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
                    audioState.isPlaying
                      ? 'bg-emerald-400 animate-pulse'
                      : 'bg-slate-600'
                  }`}
                />
                <span className="truncate text-sm font-bold text-slate-100">
                  {audioState.currentTrack
                    ? audioState.currentTrack.title
                    : 'Ingen låt spelas'}
                </span>
                {isCurrentLocal && (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded border border-cyan-500/40 bg-cyan-950/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-200"
                    title={
                      audioState.currentTrack?.localFileName
                        ? `Lokal ljudfil: ${audioState.currentTrack.localFileName}`
                        : 'Lokal ljudfil'
                    }
                  >
                    <FileAudio className="h-3 w-3" />
                    Lokal ljudfil
                  </span>
                )}
                {audioState.isDucked && (
                  <span className="rounded bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                    Duckad {duckPercent}%
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                <span className="truncate">
                  {audioState.currentTrack?.artist ||
                    (audioState.isPlaying ? 'Aktiv uppspelning' : 'Redo för nedsläpp')}
                </span>
                <span aria-hidden="true">•</span>
                <span className="font-mono tabular-nums text-slate-300">
                  {formatMsToMmSs(audioState.positionMs)}
                </span>
              </div>
            </div>

            {/* Volume Slider */}
            <div className="flex items-center gap-2.5 min-w-[180px] sm:min-w-[220px]">
              {volumePercent === 0 ? (
                <VolumeX className="h-5 w-5 shrink-0 text-slate-400" />
              ) : (
                <Volume2 className="h-5 w-5 shrink-0 text-blue-400" />
              )}
              <input
                type="range"
                min={0}
                max={100}
                value={volumePercent}
                aria-label="Mastervolym"
                onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
                onMouseUp={(e) => e.currentTarget.blur()}
                onTouchEnd={(e) => e.currentTarget.blur()}
                className="h-2.5 w-full cursor-pointer accent-blue-500"
              />
              <span className="w-11 text-right font-mono text-xs font-bold tabular-nums text-slate-200">
                {volumePercent}%
              </span>
            </div>
          </div>

          {/* Global Booth Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onToggleDuck}
              aria-pressed={audioState.isDucked}
              className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-extrabold tracking-wide transition-all cursor-pointer ${
                audioState.isDucked
                  ? 'border-amber-400 bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/25'
                  : 'border-amber-500/50 bg-amber-950/50 text-amber-200 hover:bg-amber-900/60'
              }`}
              title={
                duckHotkey
                  ? `Kortkommando: ${duckHotkey}`
                  : 'Inget kortkommando bundet'
              }
            >
              <Mic className="h-4 w-4" />
              <span>DUCKA / PRATA</span>
              {duckHotkey && (
                <kbd className="rounded bg-black/25 px-1.5 py-0.5 font-mono text-[10px]">
                  [{duckHotkey}]
                </kbd>
              )}
            </button>

            <button
              type="button"
              onClick={onFadeOut}
              className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-blue-400/50 bg-blue-600 px-5 py-2 text-sm font-extrabold tracking-wide text-white shadow-lg shadow-blue-600/25 hover:bg-blue-500 active:scale-[0.98] transition-all cursor-pointer"
              title={
                fadeOutHotkey
                  ? `Kortkommando: ${fadeOutHotkey}`
                  : 'Inget kortkommando bundet'
              }
            >
              <span>FADE OUT / SLÄPP PUCK</span>
              {fadeOutHotkey && (
                <kbd className="rounded bg-black/25 px-1.5 py-0.5 font-mono text-[10px]">
                  [{fadeOutHotkey}]
                </kbd>
              )}
            </button>

            <button
              type="button"
              onClick={onHardStop}
              className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-red-400/60 bg-red-600 px-4 py-2 text-sm font-extrabold tracking-wide text-white shadow-lg shadow-red-600/25 hover:bg-red-500 active:scale-[0.98] transition-all cursor-pointer"
              title={
                hardStopHotkey
                  ? `Kortkommando: ${hardStopHotkey}`
                  : 'Inget kortkommando bundet'
              }
            >
              <Square className="h-4 w-4 fill-current" />
              <span>TVÄRSTOPP</span>
              {hardStopHotkey && (
                <kbd className="rounded bg-black/25 px-1.5 py-0.5 font-mono text-[10px]">
                  [{hardStopHotkey}]
                </kbd>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
