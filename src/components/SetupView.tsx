import { useEffect, useState, type ChangeEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Download,
  Music,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  ALL_PAD_CATEGORIES,
  PAD_CATEGORY_LABELS,
} from '../data/defaults.ts';
import type {
  AppSettings,
  PadCategory,
  SoundPad,
  Team,
  TrackCue,
} from '../types/models.ts';
import {
  formatMsToMmSs,
  isValidMmSs,
  parseRosterText,
  parseTimeMmSsToMs,
  tryImportMatchConfig,
  tryParseSpotifyUri,
} from '../utils/domain.ts';
import { useAppStore } from '../store/useAppStore.ts';

type SetupTab = 'roster' | 'soundboard' | 'settings';

interface SetupViewProps {
  onPreviewTrack: (track: TrackCue, volume: number) => void;
  onStopAudio: () => void;
}

interface TeamRosterEditorProps {
  team: Team;
}

function sortJerseyNumbers(numbers: string[]): string[] {
  return [...numbers].sort((a, b) => {
    const numA = Number.parseInt(a, 10);
    const numB = Number.parseInt(b, 10);
    if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) {
      return numA - numB;
    }
    return a.localeCompare(b, 'sv');
  });
}

function TeamRosterEditor({ team }: TeamRosterEditorProps) {
  const updateTeamInfo = useAppStore((s) => s.updateTeamInfo);
  const upsertPlayer = useAppStore((s) => s.upsertPlayer);
  const removePlayer = useAppStore((s) => s.removePlayer);
  const importRoster = useAppStore((s) => s.importRoster);
  const clearRoster = useAppStore((s) => s.clearRoster);

  const [newNumber, setNewNumber] = useState('');
  const [newName, setNewName] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const parsedPreviewCount = Object.keys(parseRosterText(bulkText)).length;
  const sortedNumbers = sortJerseyNumbers(Object.keys(team.roster));

  const handleAddPlayer = () => {
    if (!newNumber.trim() || !newName.trim()) {
      return;
    }
    upsertPlayer(team.id, newNumber.trim(), newName.trim());
    setNewNumber('');
    setNewName('');
  };

  const handleBulkImport = (mode: 'merge' | 'replace') => {
    const count = importRoster(team.id, bulkText, mode);
    if (count > 0) {
      setBulkMessage(
        `${count} spelare ${mode === 'replace' ? 'ersatte truppen' : 'lades till / uppdaterades'}.`,
      );
      setBulkText('');
    } else {
      setBulkMessage('Hittade inga giltiga rader (format: "22 Rasmus Karlsson").');
    }
  };

  return (
    <div
      className="rounded-2xl border-2 bg-slate-900 p-5 space-y-5"
      style={{ borderColor: team.color }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Users className="h-5 w-5" style={{ color: team.color }} />
          <h3 className="text-lg font-black text-white">
            {team.id === 'home' ? 'Hemmalag' : 'Bortalag'}
          </h3>
        </div>
        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-bold text-slate-300">
          {sortedNumbers.length} spelare
        </span>
      </div>

      {/* Team Name & Color */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
            Lagnamn
          </label>
          <input
            type="text"
            value={team.name}
            onChange={(e) => updateTeamInfo(team.id, { name: e.target.value })}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm font-semibold text-white focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
            Lagfärg
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-1.5">
            <input
              type="color"
              value={team.color}
              onChange={(e) =>
                updateTeamInfo(team.id, { color: e.target.value })
              }
              aria-label={`Färg för ${team.name}`}
              className="h-8 w-10 cursor-pointer rounded bg-transparent border-0"
            />
            <span className="font-mono text-xs text-slate-300">
              {team.color}
            </span>
          </div>
        </div>
      </div>

      {/* Add Single Player */}
      <div className="space-y-2">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Lägg till / uppdatera spelare
        </div>
        <div className="flex flex-wrap sm:flex-nowrap gap-2">
          <input
            type="text"
            value={newNumber}
            onChange={(e) => setNewNumber(e.target.value)}
            placeholder="Nr (t.ex. 00)"
            className="w-28 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono font-bold text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
          />
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Spelarnamn"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddPlayer();
              }
            }}
            className="flex-1 min-w-[140px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAddPlayer}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500 cursor-pointer"
          >
            <UserPlus className="h-4 w-4" />
            Lägg till
          </button>
        </div>
      </div>

      {/* Roster Table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Aktuell laguppställning
          </span>
          {sortedNumbers.length > 0 && (
            <button
              type="button"
              onClick={() => clearRoster(team.id)}
              className="text-xs font-semibold text-red-400 hover:text-red-300 cursor-pointer"
            >
              Rensa trupp
            </button>
          )}
        </div>

        <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 divide-y divide-slate-800/80">
          {sortedNumbers.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">
              Inga spelare inlagda ännu.
            </div>
          ) : (
            sortedNumbers.map((num) => (
              <div
                key={num}
                className="flex items-center justify-between gap-2 px-3.5 py-2 hover:bg-slate-900/60"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="inline-flex min-w-[44px] justify-center rounded-lg bg-slate-800 px-2 py-1 font-mono text-xs font-extrabold text-blue-300">
                    #{num}
                  </span>
                  <input
                    type="text"
                    value={team.roster[num]}
                    onChange={(e) =>
                      upsertPlayer(team.id, num, e.target.value)
                    }
                    className="flex-1 bg-transparent text-sm font-medium text-slate-100 focus:outline-none focus:underline"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removePlayer(team.id, num)}
                  aria-label={`Ta bort nummer ${num}`}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-red-950/60 hover:text-red-400 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Snabbimport */}
      <div className="space-y-2 border-t border-slate-800 pt-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Snabbimport (klistra in lista)
          </label>
          {bulkText.trim().length > 0 && (
            <span className="text-xs font-semibold text-emerald-400">
              {parsedPreviewCount} giltiga spelare hittade
            </span>
          )}
        </div>
        <textarea
          rows={4}
          value={bulkText}
          onChange={(e) => {
            setBulkText(e.target.value);
            setBulkMessage(null);
          }}
          placeholder={'22 Rasmus Karlsson\n00 Oscar Holm (MV)\n#14 - Erik Svensson\n7, Anna Berg'}
          className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={parsedPreviewCount === 0}
            onClick={() => handleBulkImport('merge')}
            className="rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-40 cursor-pointer"
          >
            Lägg till / uppdatera ({parsedPreviewCount})
          </button>
          <button
            type="button"
            disabled={parsedPreviewCount === 0}
            onClick={() => handleBulkImport('replace')}
            className="rounded-xl border border-amber-500/40 bg-amber-950/40 px-3.5 py-2 text-xs font-bold text-amber-200 hover:bg-amber-900/50 disabled:opacity-40 cursor-pointer"
          >
            Ersätt hela truppen
          </button>
        </div>
        {bulkMessage && (
          <p className="text-xs font-medium text-emerald-400">{bulkMessage}</p>
        )}
      </div>
    </div>
  );
}

interface TrackCueRowProps {
  track: TrackCue;
  padVolume: number;
  onUpdate: (updates: Partial<TrackCue>) => void;
  onRemove: () => void;
  onPreview: () => void;
}

function TrackCueRow({
  track,
  onUpdate,
  onRemove,
  onPreview,
}: TrackCueRowProps) {
  const [uriInput, setUriInput] = useState(track.trackUri);
  const [uriError, setUriError] = useState<string | null>(null);
  const [timeInput, setTimeInput] = useState(
    formatMsToMmSs(track.startTimeMs),
  );
  const [timeValid, setTimeValid] = useState(true);

  useEffect(() => {
    setUriInput(track.trackUri);
  }, [track.trackUri]);

  useEffect(() => {
    setTimeInput(formatMsToMmSs(track.startTimeMs));
    setTimeValid(true);
  }, [track.startTimeMs]);

  const handleUriChange = (raw: string) => {
    setUriInput(raw);
    const parsed = tryParseSpotifyUri(raw);
    if (parsed.ok) {
      setUriError(null);
      onUpdate({ trackUri: parsed.uri });
    } else {
      setUriError(parsed.error);
    }
  };

  const handleTimeChange = (raw: string) => {
    setTimeInput(raw);
    if (isValidMmSs(raw)) {
      setTimeValid(true);
      onUpdate({ startTimeMs: parseTimeMmSsToMs(raw) });
    } else {
      setTimeValid(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3 space-y-2.5">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_110px_auto] gap-2.5 items-start">
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
            Låttitel
          </label>
          <input
            type="text"
            value={track.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
            Artist
          </label>
          <input
            type="text"
            value={track.artist}
            onChange={(e) => onUpdate({ artist: e.target.value })}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
            Starttid (MM:SS)
          </label>
          <input
            type="text"
            value={timeInput}
            onChange={(e) => handleTimeChange(e.target.value)}
            onBlur={() => {
              if (!isValidMmSs(timeInput)) {
                setTimeInput(formatMsToMmSs(track.startTimeMs));
                setTimeValid(true);
              }
            }}
            className={`w-full rounded-lg border px-2.5 py-1.5 font-mono text-xs font-bold text-white focus:outline-none ${
              timeValid
                ? 'border-slate-700 bg-slate-900 focus:border-blue-500'
                : 'border-red-500 bg-red-950/40'
            }`}
          />
        </div>

        <div className="flex items-end gap-1.5 md:pt-5">
          <button
            type="button"
            onClick={onPreview}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-700/30 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-700/50 cursor-pointer"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            PROVSPELA 5 SEK
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Ta bort låt"
            className="rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-slate-400 hover:border-red-500/50 hover:text-red-400 cursor-pointer"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
          Spotify-länk eller URI (auto-konverteras)
        </label>
        <input
          type="text"
          value={uriInput}
          onChange={(e) => handleUriChange(e.target.value)}
          placeholder="https://open.spotify.com/track/... eller spotify:track:..."
          className={`w-full rounded-lg border px-2.5 py-1.5 font-mono text-xs text-slate-200 focus:outline-none ${
            uriError
              ? 'border-red-500 bg-red-950/30'
              : 'border-slate-800 bg-slate-900 focus:border-blue-500'
          }`}
        />
        {uriError && <p className="mt-1 text-[11px] text-red-400">{uriError}</p>}
      </div>
    </div>
  );
}

interface SoundPadEditorProps {
  pad: SoundPad;
  index: number;
  total: number;
  onPreviewTrack: (track: TrackCue, volume: number) => void;
}

function SoundPadEditor({
  pad,
  index,
  total,
  onPreviewTrack,
}: SoundPadEditorProps) {
  const updateSoundPad = useAppStore((s) => s.updateSoundPad);
  const deleteSoundPad = useAppStore((s) => s.deleteSoundPad);
  const moveSoundPad = useAppStore((s) => s.moveSoundPad);
  const addTrackToPad = useAppStore((s) => s.addTrackToPad);
  const updateTrackInPad = useAppStore((s) => s.updateTrackInPad);
  const removeTrackFromPad = useAppStore((s) => s.removeTrackFromPad);

  const [newUrl, setNewUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newArtist, setNewArtist] = useState('');
  const [newMmSs, setNewMmSs] = useState('00:00');
  const [formError, setFormError] = useState<string | null>(null);

  const parsedPreview = newUrl.trim()
    ? tryParseSpotifyUri(newUrl)
    : null;

  const handleAddTrack = () => {
    const uriRes = tryParseSpotifyUri(newUrl);
    if (!uriRes.ok) {
      setFormError(uriRes.error);
      return;
    }
    if (!isValidMmSs(newMmSs)) {
      setFormError('Starttid måste anges som MM:SS (t.ex. 00:45).');
      return;
    }

    addTrackToPad(pad.id, {
      trackUri: uriRes.uri,
      title: newTitle.trim() || 'Ny Spotify-låt',
      artist: newArtist.trim(),
      startTimeMs: parseTimeMmSsToMs(newMmSs),
    });

    setNewUrl('');
    setNewTitle('');
    setNewArtist('');
    setNewMmSs('00:00');
    setFormError(null);
  };

  return (
    <div
      className="rounded-2xl border border-slate-800 border-l-[6px] bg-slate-900 p-5 space-y-4"
      style={{ borderLeftColor: pad.color }}
    >
      {/* Top Header & Order Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Music className="h-5 w-5 text-blue-400" />
          <h4 className="text-base font-extrabold text-white">{pad.label}</h4>
          <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
            {PAD_CATEGORY_LABELS[pad.category]}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => moveSoundPad(pad.id, 'up', false)}
            aria-label="Flytta upp"
            className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-200 hover:bg-slate-700 disabled:opacity-35 cursor-pointer"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={() => moveSoundPad(pad.id, 'down', false)}
            aria-label="Flytta ned"
            className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-200 hover:bg-slate-700 disabled:opacity-35 cursor-pointer"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => deleteSoundPad(pad.id)}
            aria-label="Ta bort knapp"
            className="rounded-lg border border-red-900/60 bg-red-950/40 p-2 text-red-400 hover:bg-red-900/50 cursor-pointer"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Pad Meta Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
            Knappnamn
          </label>
          <input
            type="text"
            value={pad.label}
            onChange={(e) => updateSoundPad(pad.id, { label: e.target.value })}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-white focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
            Kategori
          </label>
          <select
            value={pad.category}
            onChange={(e) =>
              updateSoundPad(pad.id, {
                category: e.target.value as PadCategory,
              })
            }
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
          >
            {ALL_PAD_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {PAD_CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
            Färg &amp; Volym ({Math.round((pad.volume ?? 1) * 100)}%)
          </label>
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5">
            <input
              type="color"
              value={pad.color}
              onChange={(e) =>
                updateSoundPad(pad.id, { color: e.target.value })
              }
              className="h-7 w-9 cursor-pointer bg-transparent border-0"
            />
            <input
              type="range"
              min={10}
              max={100}
              value={Math.round((pad.volume ?? 1) * 100)}
              onChange={(e) =>
                updateSoundPad(pad.id, {
                  volume: Number(e.target.value) / 100,
                })
              }
              className="w-full accent-blue-500 cursor-pointer"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
            Talstöds-koppling
          </label>
          <select
            value={pad.triggerFlow ?? ''}
            onChange={(e) =>
              updateSoundPad(pad.id, {
                triggerFlow: e.target.value
                  ? (e.target.value as SoundPad['triggerFlow'])
                  : null,
              })
            }
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
          >
            <option value="">Ingen (Endast soundboard)</option>
            <option value="goal_home">Mål Hemmalag</option>
            <option value="goal_away">Mål Bortalag (Omstart)</option>
            <option value="penalty_home">Utvisning Hemmalag</option>
            <option value="penalty_away">Utvisning Bortalag</option>
          </select>
        </div>
      </div>

      {/* Track Pool */}
      <div className="space-y-2.5">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Låtpool ({pad.tracks.length}{' '}
          {pad.tracks.length === 1 ? 'låt' : 'låtar'} – roterar automatiskt)
        </div>

        {pad.tracks.map((track, trackIdx) => (
          <TrackCueRow
            key={`${pad.id}-track-${trackIdx}`}
            track={track}
            padVolume={pad.volume ?? 1.0}
            onUpdate={(updates) =>
              updateTrackInPad(pad.id, trackIdx, updates)
            }
            onRemove={() => removeTrackFromPad(pad.id, trackIdx)}
            onPreview={() => onPreviewTrack(track, pad.volume ?? 1.0)}
          />
        ))}

        {/* Add Track to Pool */}
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-3 space-y-2.5">
          <div className="text-xs font-bold text-slate-300">
            + Lägg till låt i poolen
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr_100px] gap-2">
            <input
              type="text"
              value={newUrl}
              onChange={(e) => {
                setNewUrl(e.target.value);
                setFormError(null);
              }}
              placeholder="Klistra in Spotify-länk eller URI..."
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-mono text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Låttitel"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
            <input
              type="text"
              value={newArtist}
              onChange={(e) => setNewArtist(e.target.value)}
              placeholder="Artist"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
            <input
              type="text"
              value={newMmSs}
              onChange={(e) => {
                setNewMmSs(e.target.value);
                setFormError(null);
              }}
              placeholder="00:45"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-mono font-bold text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs">
              {parsedPreview?.ok && (
                <span className="text-emerald-400 font-mono">
                  Konverterad URI: {parsedPreview.uri}
                </span>
              )}
              {formError && <span className="text-red-400">{formError}</span>}
            </div>
            <button
              type="button"
              onClick={handleAddTrack}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-500 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Lägg till låt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SetupView({ onPreviewTrack, onStopAudio }: SetupViewProps) {
  const [activeTab, setActiveTab] = useState<SetupTab>('roster');

  const teams = useAppStore((s) => s.teams);
  const soundPads = useAppStore((s) => s.soundPads);
  const settings = useAppStore((s) => s.settings);

  const addSoundPad = useAppStore((s) => s.addSoundPad);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const updateScriptTemplates = useAppStore((s) => s.updateScriptTemplates);
  const exportConfigJson = useAppStore((s) => s.exportConfigJson);
  const importConfigJson = useAppStore((s) => s.importConfigJson);
  const resetToDefaults = useAppStore((s) => s.resetToDefaults);

  const [newPadLabel, setNewPadLabel] = useState('');
  const [newPadCategory, setNewPadCategory] =
    useState<PadCategory>('faceoff_off');
  const [newPadColor, setNewPadColor] = useState('#2563eb');

  const [backupFeedback, setBackupFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [pasteJson, setPasteJson] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  const handleCreatePad = () => {
    addSoundPad({
      label: newPadLabel.trim() || 'Ny Soundboard-knapp',
      category: newPadCategory,
      color: newPadColor,
      tracks: [],
      volume: 1.0,
      triggerFlow: null,
    });
    setNewPadLabel('');
  };

  const handleExportDownload = () => {
    const json = exportConfigJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hockey-dj-config-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setBackupFeedback({
      type: 'success',
      message: 'Konfiguration exporterad som JSON-fil.',
    });
  };

  const applyImportedJson = (rawText: string) => {
    const result = tryImportMatchConfig(rawText);
    if (!result.ok) {
      setBackupFeedback({ type: 'error', message: result.error });
      return;
    }
    importConfigJson(rawText);
    setPasteJson('');
    setBackupFeedback({
      type: 'success',
      message: 'Matchkonfiguration importerad och sparad!',
    });
  };

  const handleFileImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      applyImportedJson(content);
    };
    reader.onerror = () => {
      setBackupFeedback({
        type: 'error',
        message: 'Kunde inte läsa den valda filen.',
      });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleTemplateChange = (
    key: keyof AppSettings['scriptTemplates'],
    value: string,
  ) => {
    updateScriptTemplates({ [key]: value });
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 space-y-6">
      {/* Setup Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('roster')}
            className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-colors cursor-pointer ${
              activeTab === 'roster'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            Laguppställningar (Roster)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('soundboard')}
            className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-colors cursor-pointer ${
              activeTab === 'soundboard'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            Soundboard &amp; Låtpooler ({soundPads.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-colors cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            Spotify, Inställningar &amp; Backup
          </button>
        </div>

        <button
          type="button"
          onClick={onStopAudio}
          className="rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 cursor-pointer"
        >
          Stoppa provspelning
        </button>
      </div>

      {/* TAB 1: ROSTER MANAGER */}
      {activeTab === 'roster' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <TeamRosterEditor team={teams.home} />
          <TeamRosterEditor team={teams.away} />
        </div>
      )}

      {/* TAB 2: SOUNDBOARD CONFIG */}
      {activeTab === 'soundboard' && (
        <div className="space-y-6">
          {/* New Pad Creator */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              Skapa ny soundboard-knapp
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-[1.5fr_1fr_auto_auto] gap-3 items-center">
              <input
                type="text"
                value={newPadLabel}
                onChange={(e) => setNewPadLabel(e.target.value)}
                placeholder="Namn på knapp (t.ex. Tekning Powerplay)"
                className="rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
              <select
                value={newPadCategory}
                onChange={(e) =>
                  setNewPadCategory(e.target.value as PadCategory)
                }
                className="rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                {ALL_PAD_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {PAD_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
              <input
                type="color"
                value={newPadColor}
                onChange={(e) => setNewPadColor(e.target.value)}
                className="h-10 w-12 cursor-pointer rounded-lg border border-slate-700 bg-slate-950 p-1"
              />
              <button
                type="button"
                onClick={handleCreatePad}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-500 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Skapa knapp
              </button>
            </div>
          </div>

          {/* Existing Pads List */}
          <div className="space-y-4">
            {soundPads.map((pad, idx) => (
              <SoundPadEditor
                key={pad.id}
                pad={pad}
                index={idx}
                total={soundPads.length}
                onPreviewTrack={onPreviewTrack}
              />
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: SPOTIFY, SETTINGS & BACKUP */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Spotify & Audio Settings */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-5">
            <h3 className="text-lg font-black text-white">
              Spotify PKCE &amp; Ljudmotor
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Spotify Client ID
                </label>
                <input
                  type="text"
                  value={settings.spotifyClientId}
                  onChange={(e) =>
                    updateSettings({ spotifyClientId: e.target.value.trim() })
                  }
                  placeholder="Klistra in Client ID från Spotify Developer Dashboard"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 font-mono text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Spotify Redirect URI
                </label>
                <input
                  type="text"
                  value={settings.spotifyRedirectUri}
                  onChange={(e) =>
                    updateSettings({ spotifyRedirectUri: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 font-mono text-sm text-white focus:border-blue-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Måste matcha exakt i Spotify Developer Dashboard (t.ex.{' '}
                  <code className="text-slate-200">
                    http://127.0.0.1:5173/callback
                  </code>
                  ).
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Ducking-volym ({Math.round(settings.duckVolume * 100)}%)
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={60}
                    value={Math.round(settings.duckVolume * 100)}
                    onChange={(e) =>
                      updateSettings({
                        duckVolume: Number(e.target.value) / 100,
                      })
                    }
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Fade-out längd (ms)
                  </label>
                  <input
                    type="number"
                    min={100}
                    max={5000}
                    step={50}
                    value={settings.fadeOutDurationMs}
                    onChange={(e) =>
                      updateSettings({
                        fadeOutDurationMs: Math.max(
                          0,
                          Number(e.target.value) || 600,
                        ),
                      })
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Script Templates */}
            <div className="space-y-3 border-t border-slate-800 pt-4">
              <h4 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                Talmanusmallar (Teleprompter)
              </h4>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Utvisning (spelare): {'{team}'}, {'{number}'}, {'{name}'},{' '}
                  {'{duration}'}, {'{reason}'}
                </label>
                <input
                  type="text"
                  value={settings.scriptTemplates.penalty}
                  onChange={(e) =>
                    handleTemplateChange('penalty', e.target.value)
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Utvisning (lagstraff): {'{team}'}, {'{duration}'}, {'{reason}'}
                </label>
                <input
                  type="text"
                  value={settings.scriptTemplates.penaltyTeam}
                  onChange={(e) =>
                    handleTemplateChange('penaltyTeam', e.target.value)
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Mål (utan assist): {'{team}'}, {'{scorerNumber}'},{' '}
                  {'{scorerName}'}
                </label>
                <input
                  type="text"
                  value={settings.scriptTemplates.goal}
                  onChange={(e) =>
                    handleTemplateChange('goal', e.target.value)
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Mål (med assist): {'{team}'}, {'{scorerNumber}'},{' '}
                  {'{scorerName}'}, {'{assists}'}
                </label>
                <input
                  type="text"
                  value={settings.scriptTemplates.goalWithAssist}
                  onChange={(e) =>
                    handleTemplateChange('goalWithAssist', e.target.value)
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Backup Export / Import */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-5">
            <h3 className="text-lg font-black text-white">
              Backup &amp; Återställning (.json)
            </h3>
            <p className="text-sm text-slate-400">
              All data sparas automatiskt i webbläsarens localStorage. Här kan
              du exportera hela matchkonfigurationen inför nästa bortamatch
              eller läsa in en sparad fil.
            </p>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleExportDownload}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500 cursor-pointer"
              >
                <Download className="h-4 w-4" />
                Exportera konfiguration (.json)
              </button>

              <label className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-bold text-slate-100 hover:bg-slate-700 cursor-pointer">
                <Upload className="h-4 w-4" />
                Importera konfiguration (.json)
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileImport}
                  className="hidden"
                />
              </label>
            </div>

            <div className="space-y-2 border-t border-slate-800 pt-4">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                Eller klistra in JSON direkt
              </label>
              <textarea
                rows={5}
                value={pasteJson}
                onChange={(e) => setPasteJson(e.target.value)}
                placeholder='{"teams": ...}'
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
              />
              <button
                type="button"
                disabled={!pasteJson.trim()}
                onClick={() => applyImportedJson(pasteJson)}
                className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-40 cursor-pointer"
              >
                Läs in inklistrad JSON
              </button>
            </div>

            {backupFeedback && (
              <div
                className={`flex items-center gap-2 rounded-xl border p-3 text-sm font-medium ${
                  backupFeedback.type === 'success'
                    ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
                    : 'border-red-500/40 bg-red-950/40 text-red-300'
                }`}
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{backupFeedback.message}</span>
              </div>
            )}

            <div className="border-t border-slate-800 pt-4">
              {!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-2.5 text-xs font-bold text-red-300 hover:bg-red-950/60 cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" />
                  Återställ standarddata
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-red-300">
                    Bekräfta återställning till fabriksdata?
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      resetToDefaults();
                      setConfirmReset(false);
                      setBackupFeedback({
                        type: 'success',
                        message: 'Standardlag och standardknappar återställda.',
                      });
                    }}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-500 cursor-pointer"
                  >
                    Ja, återställ
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-700 cursor-pointer"
                  >
                    Avbryt
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
