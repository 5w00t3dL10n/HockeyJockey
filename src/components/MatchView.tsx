import {
  Flame,
  Layers,
  Music,
  Repeat,
  ShieldAlert,
  Trophy,
  Users,
} from 'lucide-react';
import {
  DEFAULT_KEY_BINDINGS,
  PAD_CATEGORY_LABELS,
  SOUNDBOARD_CATEGORIES,
} from '../data/defaults.ts';
import type {
  AudioStateSnapshot,
  KeyBindings,
  MatchProfile,
  SavedRoster,
  SoundPad,
  Team,
} from '../types/models.ts';
import { formatMsToMmSs, selectNextTrack } from '../utils/domain.ts';

interface MatchViewProps {
  teams: {
    home: Team;
    away: Team;
  };
  soundPads: SoundPad[];
  audioState: AudioStateSnapshot;
  keyBindings?: KeyBindings;
  savedRosters?: SavedRoster[];
  matchProfiles?: MatchProfile[];
  activeProfileId?: string | null;
  onSelectRoster?: (rosterId: string, targetTeamId: 'home' | 'away') => void;
  onSelectProfile?: (profileId: string) => void;
  onTriggerGoal: (teamId: 'home' | 'away') => void;
  onTriggerPenalty: (teamId: 'home' | 'away') => void;
  onTriggerSoundPad: (pad: SoundPad) => void;
}

export function MatchView({
  teams,
  soundPads,
  audioState,
  keyBindings = DEFAULT_KEY_BINDINGS,
  savedRosters = [],
  matchProfiles = [],
  activeProfileId = null,
  onSelectRoster,
  onSelectProfile,
  onTriggerGoal,
  onTriggerPenalty,
  onTriggerSoundPad,
}: MatchViewProps) {
  const goalHomeKey = keyBindings.actions.goalHome;
  const goalAwayKey = keyBindings.actions.goalAway;
  const penaltyHomeKey = keyBindings.actions.penaltyHome;
  const penaltyAwayKey = keyBindings.actions.penaltyAway;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 space-y-8">
      {/* Quick Match-up & Profile Bar */}
      {(savedRosters.length > 0 || matchProfiles.length > 0) && (
        <section
          aria-label="Snabbval av laguppställningar och matchprofil"
          className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3.5 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex flex-wrap items-center gap-3">
            {savedRosters.length > 0 && onSelectRoster && (
              <>
                <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5">
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: teams.home.color }}
                  />
                  <Users className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <label
                    htmlFor="match-home-roster-select"
                    className="text-xs font-bold text-slate-400"
                  >
                    Hemma:
                  </label>
                  <select
                    id="match-home-roster-select"
                    aria-label="Snabbbyt hemmalag från roster-bibliotek"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        onSelectRoster(e.target.value, 'home');
                      }
                      e.currentTarget.blur();
                    }}
                    className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
                  >
                    <option value="" className="bg-slate-900 text-slate-300">
                      {teams.home.name} ({Object.keys(teams.home.roster).length}{' '}
                      sp) — Byt lag...
                    </option>
                    {savedRosters.map((roster) => (
                      <option
                        key={roster.id}
                        value={roster.id}
                        className="bg-slate-900 text-white"
                      >
                        {roster.name}
                        {roster.ageGroupOrClub
                          ? ` [${roster.ageGroupOrClub}]`
                          : ''}{' '}
                        ({Object.keys(roster.roster).length} sp)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5">
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: teams.away.color }}
                  />
                  <Users className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <label
                    htmlFor="match-away-roster-select"
                    className="text-xs font-bold text-slate-400"
                  >
                    Borta:
                  </label>
                  <select
                    id="match-away-roster-select"
                    aria-label="Snabbbyt bortalag från roster-bibliotek"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        onSelectRoster(e.target.value, 'away');
                      }
                      e.currentTarget.blur();
                    }}
                    className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
                  >
                    <option value="" className="bg-slate-900 text-slate-300">
                      {teams.away.name} ({Object.keys(teams.away.roster).length}{' '}
                      sp) — Byt lag...
                    </option>
                    {savedRosters.map((roster) => (
                      <option
                        key={roster.id}
                        value={roster.id}
                        className="bg-slate-900 text-white"
                      >
                        {roster.name}
                        {roster.ageGroupOrClub
                          ? ` [${roster.ageGroupOrClub}]`
                          : ''}{' '}
                        ({Object.keys(roster.roster).length} sp)
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          {matchProfiles.length > 0 && onSelectProfile && (
            <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5">
              <Layers className="h-3.5 w-3.5 text-blue-400 shrink-0" />
              <label
                htmlFor="match-profile-select"
                className="text-xs font-bold text-slate-400"
              >
                Matchprofil:
              </label>
              <select
                id="match-profile-select"
                aria-label="Snabbbyt matchprofil"
                value={activeProfileId ?? ''}
                onChange={(e) => {
                  if (e.target.value) {
                    onSelectProfile(e.target.value);
                  }
                  e.currentTarget.blur();
                }}
                className="bg-transparent text-xs font-bold text-blue-200 focus:outline-none cursor-pointer"
              >
                {!activeProfileId && (
                  <option value="" className="bg-slate-900 text-slate-300">
                    Anpassad (ej sparad)
                  </option>
                )}
                {matchProfiles.map((profile) => (
                  <option
                    key={profile.id}
                    value={profile.id}
                    className="bg-slate-900 text-white"
                  >
                    {profile.name}
                    {profile.clubOrAgeGroup
                      ? ` (${profile.clubOrAgeGroup})`
                      : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>
      )}

      {/* Event Triggers (Mål & Utvisning med Talstöd) */}
      <section aria-labelledby="event-triggers-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2
            id="event-triggers-heading"
            className="text-sm font-bold uppercase tracking-wider text-slate-400"
          >
            Matchhändelser &amp; Talstöd (Teleprompter)
          </h2>
          <span className="text-xs text-slate-500">
            Startar låt + öppnar sekventiellt talstöd
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* MÅL HEMMALAG */}
          <button
            type="button"
            onClick={() => onTriggerGoal('home')}
            style={{ borderColor: teams.home.color }}
            className="group relative flex min-w-[80px] min-h-[116px] flex-col justify-between rounded-2xl border-2 bg-gradient-to-br from-blue-950/90 via-slate-900 to-slate-900 p-5 text-left shadow-lg hover:brightness-110 active:scale-[0.99] transition-all cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wider text-white"
                style={{ backgroundColor: teams.home.color }}
              >
                Hemmalag
              </span>
              <div className="flex items-center gap-2">
                {goalHomeKey && (
                  <kbd className="rounded-md border border-blue-400/40 bg-black/40 px-2 py-0.5 font-mono text-xs font-bold text-blue-200">
                    [{goalHomeKey}]
                  </kbd>
                )}
                <Trophy className="h-6 w-6 text-blue-400 group-hover:scale-110 transition-transform" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-xl font-black tracking-tight text-white">
                MÅL HEMMALAG
              </div>
              <div className="text-sm font-medium text-blue-200/80">
                {teams.home.name} • Spelar mållåt direkt
              </div>
            </div>
          </button>

          {/* MÅL BORTALAG */}
          <button
            type="button"
            onClick={() => onTriggerGoal('away')}
            style={{ borderColor: teams.away.color }}
            className="group relative flex min-w-[80px] min-h-[116px] flex-col justify-between rounded-2xl border-2 bg-gradient-to-br from-orange-950/80 via-slate-900 to-slate-900 p-5 text-left shadow-lg hover:brightness-110 active:scale-[0.99] transition-all cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wider text-white"
                style={{ backgroundColor: teams.away.color }}
              >
                Bortalag
              </span>
              <div className="flex items-center gap-2">
                {goalAwayKey && (
                  <kbd className="rounded-md border border-orange-400/40 bg-black/40 px-2 py-0.5 font-mono text-xs font-bold text-orange-200">
                    [{goalAwayKey}]
                  </kbd>
                )}
                <Trophy className="h-6 w-6 text-orange-400 group-hover:scale-110 transition-transform" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-xl font-black tracking-tight text-white">
                MÅL BORTALAG
              </div>
              <div className="text-sm font-medium text-orange-200/80">
                {teams.away.name} • Tyst / valfri omstartslåt
              </div>
            </div>
          </button>

          {/* UTVISNING HEMMALAG */}
          <button
            type="button"
            onClick={() => onTriggerPenalty('home')}
            style={{ borderColor: teams.home.color }}
            className="group relative flex min-w-[80px] min-h-[116px] flex-col justify-between rounded-2xl border-2 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/60 p-5 text-left shadow-lg hover:brightness-110 active:scale-[0.99] transition-all cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wider text-white"
                style={{ backgroundColor: teams.home.color }}
              >
                Boxplay • Hemma
              </span>
              <div className="flex items-center gap-2">
                {penaltyHomeKey && (
                  <kbd className="rounded-md border border-blue-400/40 bg-black/40 px-2 py-0.5 font-mono text-xs font-bold text-blue-200">
                    [{penaltyHomeKey}]
                  </kbd>
                )}
                <ShieldAlert className="h-6 w-6 text-blue-400 group-hover:scale-110 transition-transform" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-xl font-black tracking-tight text-white">
                UTVISNING HEMMALAG (Boxplay)
              </div>
              <div className="text-sm font-medium text-slate-300">
                {teams.home.name} • Utvisningsflöde + musik
              </div>
            </div>
          </button>

          {/* UTVISNING BORTALAG */}
          <button
            type="button"
            onClick={() => onTriggerPenalty('away')}
            style={{ borderColor: teams.away.color }}
            className="group relative flex min-w-[80px] min-h-[116px] flex-col justify-between rounded-2xl border-2 bg-gradient-to-br from-slate-900 via-slate-900 to-orange-950/60 p-5 text-left shadow-lg hover:brightness-110 active:scale-[0.99] transition-all cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wider text-white"
                style={{ backgroundColor: teams.away.color }}
              >
                Powerplay • Borta
              </span>
              <div className="flex items-center gap-2">
                {penaltyAwayKey && (
                  <kbd className="rounded-md border border-orange-400/40 bg-black/40 px-2 py-0.5 font-mono text-xs font-bold text-orange-200">
                    [{penaltyAwayKey}]
                  </kbd>
                )}
                <Flame className="h-6 w-6 text-orange-400 group-hover:scale-110 transition-transform" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-xl font-black tracking-tight text-white">
                UTVISNING BORTALAG (Powerplay)
              </div>
              <div className="text-sm font-medium text-slate-300">
                {teams.away.name} • Utvisningsflöde + musik
              </div>
            </div>
          </button>
        </div>
      </section>

      {/* Soundboard Kategorier */}
      <section aria-labelledby="soundboard-heading" className="space-y-6">
        <div className="flex items-center justify-between">
          <h2
            id="soundboard-heading"
            className="text-sm font-bold uppercase tracking-wider text-slate-400"
          >
            Snabbknappar / Soundboard
          </h2>
          <span className="text-xs text-slate-500">
            Klick startar låt på exakt starttid &amp; roterar poolen
          </span>
        </div>

        <div className="space-y-6">
          {SOUNDBOARD_CATEGORIES.map((category) => {
            const padsInCategory = soundPads.filter(
              (pad) => pad.category === category,
            );
            if (padsInCategory.length === 0) {
              return null;
            }

            return (
              <div key={category} className="space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 border-b border-slate-800/80 pb-1.5">
                  {PAD_CATEGORY_LABELS[category]}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                  {padsInCategory.map((pad) => {
                    const { track: nextTrack } = selectNextTrack(pad);
                    const lastPlayedTrack =
                      pad.lastPlayedIndex !== undefined
                        ? pad.tracks[pad.lastPlayedIndex]
                        : undefined;
                    const padHotkey = pad.hotkey || keyBindings.pads[pad.id] || '';
                    const isActivePad =
                      audioState.isPlaying &&
                      audioState.currentTrack !== null &&
                      pad.tracks.some(
                        (t) =>
                          t.trackUri === audioState.currentTrack?.trackUri &&
                          t.startTimeMs === audioState.currentTrack?.startTimeMs,
                      );

                    return (
                      <button
                        key={pad.id}
                        type="button"
                        disabled={pad.tracks.length === 0}
                        onClick={() => onTriggerSoundPad(pad)}
                        style={{
                          borderLeftColor: pad.color,
                        }}
                        className={`flex min-w-[80px] min-h-[96px] flex-col justify-between rounded-xl border border-l-[6px] p-4 text-left transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                          isActivePad
                            ? 'border-emerald-400 bg-emerald-950/40 ring-2 ring-emerald-400/50 shadow-lg shadow-emerald-950/50'
                            : 'border-slate-800 bg-slate-900 hover:bg-slate-800/90 hover:border-slate-700 active:scale-[0.99]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-base font-bold text-slate-100 leading-snug">
                            {pad.label}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {padHotkey && (
                              <kbd className="rounded border border-blue-500/40 bg-blue-950/70 px-1.5 py-0.5 font-mono text-[11px] font-bold text-blue-200">
                                [{padHotkey}]
                              </kbd>
                            )}
                            {pad.tracks.length > 1 ? (
                              <span
                                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-300"
                                title="Roterande låtpool"
                              >
                                <Repeat className="h-3 w-3 text-blue-400" />
                                {pad.tracks.length} låtar
                              </span>
                            ) : (
                              <Music className="h-4 w-4 shrink-0 text-slate-500" />
                            )}
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                          <span className="truncate text-slate-300">
                            {nextTrack
                              ? `Nästa: ${nextTrack.title}`
                              : 'Inga låtar konfigurerade'}
                          </span>
                          {nextTrack && (
                            <span className="shrink-0 font-mono text-slate-400">
                              {formatMsToMmSs(nextTrack.startTimeMs)}
                            </span>
                          )}
                        </div>

                        {isActivePad && lastPlayedTrack && (
                          <div className="mt-1.5 text-[11px] font-semibold text-emerald-300">
                            Spelas nu: {lastPlayedTrack.title}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
