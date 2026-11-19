import { Flame, Music, Repeat, ShieldAlert, Trophy } from 'lucide-react';
import {
  PAD_CATEGORY_LABELS,
  SOUNDBOARD_CATEGORIES,
} from '../data/defaults.ts';
import type {
  AudioStateSnapshot,
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
  onTriggerGoal: (teamId: 'home' | 'away') => void;
  onTriggerPenalty: (teamId: 'home' | 'away') => void;
  onTriggerSoundPad: (pad: SoundPad) => void;
}

export function MatchView({
  teams,
  soundPads,
  audioState,
  onTriggerGoal,
  onTriggerPenalty,
  onTriggerSoundPad,
}: MatchViewProps) {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 space-y-8">
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
              <Trophy className="h-6 w-6 text-blue-400 group-hover:scale-110 transition-transform" />
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
              <Trophy className="h-6 w-6 text-orange-400 group-hover:scale-110 transition-transform" />
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
              <ShieldAlert className="h-6 w-6 text-blue-400 group-hover:scale-110 transition-transform" />
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
              <Flame className="h-6 w-6 text-orange-400 group-hover:scale-110 transition-transform" />
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
