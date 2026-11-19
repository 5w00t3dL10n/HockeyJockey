import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Copy,
  Download,
  FileAudio,
  Keyboard,
  Layers,
  Loader2,
  Music,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Square,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Volume2,
} from 'lucide-react';
import {
  EVENT_PAD_CATEGORIES,
  MATCH_ACTION_IDS,
  MATCH_ACTION_LABELS,
  PAD_CATEGORY_LABELS,
  getPadCategoryLabel,
} from '../data/defaults.ts';
import {
  getLocalAudioRecord,
  saveLocalAudioFile,
  syncEmbeddedMediaArchive,
  type EmbeddedMediaItem,
} from '../services/localAudioStorage.ts';
import { fetchSpotifyTrackMetadata } from '../services/spotifyMetadata.ts';
import {
  ttsService,
  type TtsServiceState,
} from '../services/ttsService.ts';
import { useAppStore } from '../store/useAppStore.ts';
import type {
  AppSettings,
  BuiltinPadCategory,
  MatchActionId,
  PadCategory,
  PiperVoiceId,
  SavedRoster,
  SoundboardGroup,
  SoundPad,
  Team,
  TrackCue,
} from '../types/models.ts';
import {
  extractSpotifyTrackId,
  formatMsToMmSs,
  isLocalAudioUri,
  isValidMmSs,
  parseRosterText,
  parseTimeMmSsToMs,
  tryImportMatchConfig,
  tryParseSpotifyUri,
} from '../utils/domain.ts';
import { HotkeyRecorder } from './HotkeyRecorder.tsx';

type SetupTab = 'roster' | 'profiles' | 'soundboard' | 'settings';

interface SetupViewProps {
  onPreviewTrack: (track: TrackCue, volume: number) => void;
  onStopAudio: () => void;
}

interface TeamRosterEditorProps {
  team: Team;
  savedRosters: SavedRoster[];
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

function describeHotkeyTarget(target: string, soundPads: SoundPad[]): string {
  if (target.startsWith('action:')) {
    const actionId = target.slice('action:'.length) as MatchActionId;
    return MATCH_ACTION_LABELS[actionId] ?? actionId;
  }
  if (target.startsWith('pad:')) {
    const padId = target.slice('pad:'.length);
    return soundPads.find((p) => p.id === padId)?.label ?? padId;
  }
  return target;
}

function formatDateShort(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return iso;
  }
  return new Date(parsed).toLocaleString('sv-SE', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function TeamRosterEditor({ team, savedRosters }: TeamRosterEditorProps) {
  const updateTeamInfo = useAppStore((s) => s.updateTeamInfo);
  const upsertPlayer = useAppStore((s) => s.upsertPlayer);
  const removePlayer = useAppStore((s) => s.removePlayer);
  const importRoster = useAppStore((s) => s.importRoster);
  const clearRoster = useAppStore((s) => s.clearRoster);
  const loadRosterFromLibrary = useAppStore((s) => s.loadRosterFromLibrary);
  const saveTeamToRosterLibrary = useAppStore(
    (s) => s.saveTeamToRosterLibrary,
  );

  const [newNumber, setNewNumber] = useState('');
  const [newName, setNewName] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [librarySaveName, setLibrarySaveName] = useState('');
  const [librarySaveAge, setLibrarySaveAge] = useState('');
  const [libraryFeedback, setLibraryFeedback] = useState<string | null>(null);

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
      setBulkMessage(
        'Hittade inga giltiga rader (format: "22 Rasmus Karlsson").',
      );
    }
  };

  const handleSaveToLibrary = () => {
    saveTeamToRosterLibrary(
      team.id,
      librarySaveName.trim() || undefined,
      librarySaveAge.trim() || undefined,
    );
    setLibraryFeedback(
      `Sparade "${librarySaveName.trim() || team.name}" i Roster-biblioteket!`,
    );
    setLibrarySaveName('');
    setLibrarySaveAge('');
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

      {/* Quick Load / Save from Roster Library */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-center">
          <select
            aria-label={`Ladda från roster-bibliotek för ${team.id === 'home' ? 'Hemmalag' : 'Bortalag'}`}
            value=""
            onChange={(e) => {
              const id = e.target.value;
              if (id) {
                const ok = loadRosterFromLibrary(id, team.id);
                if (ok) {
                  const found = savedRosters.find((r) => r.id === id);
                  setLibraryFeedback(
                    `Laddade "${found?.name ?? 'laguppställning'}" som ${team.id === 'home' ? 'Hemmalag' : 'Bortalag'}.`,
                  );
                }
              }
            }}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 focus:border-blue-500 focus:outline-none cursor-pointer"
          >
            <option value="">
              Ladda från roster-biblioteket ({savedRosters.length} sparade)...
            </option>
            {savedRosters.map((saved) => (
              <option key={saved.id} value={saved.id}>
                {saved.name}
                {saved.ageGroupOrClub ? ` (${saved.ageGroupOrClub})` : ''} —{' '}
                {Object.keys(saved.roster).length} spelare
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={librarySaveName}
            onChange={(e) => setLibrarySaveName(e.target.value)}
            placeholder={`Biblioteksnamn (standard: ${team.name})`}
            className="flex-1 min-w-[160px] rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
          />
          <input
            type="text"
            value={librarySaveAge}
            onChange={(e) => setLibrarySaveAge(e.target.value)}
            placeholder="Klubb/Ålder (t.ex. U12)"
            className="w-36 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSaveToLibrary}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-700/30 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-700/50 cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" />
            Spara till bibliotek
          </button>
        </div>

        {libraryFeedback && (
          <p className="text-xs font-medium text-emerald-400">
            {libraryFeedback}
          </p>
        )}
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
          placeholder={
            '22 Rasmus Karlsson\n00 Oscar Holm (MV)\n#14 - Erik Svensson\n7, Anna Berg'
          }
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

function RosterLibrarySection() {
  const savedRosters = useAppStore((s) => s.savedRosters);
  const loadRosterFromLibrary = useAppStore((s) => s.loadRosterFromLibrary);
  const saveTeamToRosterLibrary = useAppStore(
    (s) => s.saveTeamToRosterLibrary,
  );
  const upsertSavedRoster = useAppStore((s) => s.upsertSavedRoster);
  const deleteSavedRoster = useAppStore((s) => s.deleteSavedRoster);
  const duplicateSavedRoster = useAppStore((s) => s.duplicateSavedRoster);

  const [newName, setNewName] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [newAgeGroup, setNewAgeGroup] = useState('');
  const [newColor, setNewColor] = useState('#2563eb');
  const [newRosterText, setNewRosterText] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleCreateRoster = () => {
    const cleanTeamName = newTeamName.trim() || newName.trim();
    const cleanName = newName.trim() || cleanTeamName;
    if (!cleanName) {
      return;
    }
    const parsedRoster = parseRosterText(newRosterText);
    upsertSavedRoster({
      name: cleanName,
      teamName: cleanTeamName,
      color: newColor,
      ageGroupOrClub: newAgeGroup.trim() || undefined,
      roster: parsedRoster,
    });
    setFeedback(
      `Skapade "${cleanName}" med ${Object.keys(parsedRoster).length} spelare i biblioteket.`,
    );
    setNewName('');
    setNewTeamName('');
    setNewAgeGroup('');
    setNewRosterText('');
  };

  return (
    <section
      aria-labelledby="roster-library-heading"
      className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3
            id="roster-library-heading"
            className="text-lg font-black text-white"
          >
            Roster-bibliotek ({savedRosters.length} sparade laguppställningar)
          </h3>
          <p className="text-xs text-slate-400">
            Spara flera lag, åldersgrupper och motståndare för blixtsnabbt byte
            inför varje match.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              saveTeamToRosterLibrary('home');
              setFeedback('Nuvarande Hemmalag sparat som ny post i biblioteket.');
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-blue-500/40 bg-blue-950/40 px-3 py-2 text-xs font-bold text-blue-200 hover:bg-blue-900/50 cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" />
            Spara Hemmalag som ny
          </button>
          <button
            type="button"
            onClick={() => {
              saveTeamToRosterLibrary('away');
              setFeedback('Nuvarande Bortalag sparat som ny post i biblioteket.');
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-orange-500/40 bg-orange-950/40 px-3 py-2 text-xs font-bold text-orange-200 hover:bg-orange-900/50 cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" />
            Spara Bortalag som ny
          </button>
        </div>
      </div>

      {feedback && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3.5 py-2 text-xs font-semibold text-emerald-300">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-emerald-200 hover:underline cursor-pointer"
          >
            Stäng
          </button>
        </div>
      )}

      {/* Create New Roster in Library */}
      <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/70 p-4 space-y-3">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-300">
          + Skapa ny laguppställning i biblioteket
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Biblioteksnamn (t.ex. Sundsvall U14)"
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
          />
          <input
            type="text"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            placeholder="Visat lagnamn (t.ex. Sundsvall Hockey)"
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
          />
          <input
            type="text"
            value={newAgeGroup}
            onChange={(e) => setNewAgeGroup(e.target.value)}
            placeholder="Klubb / Åldersgrupp (t.ex. U14)"
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
          />
          <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5">
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              aria-label="Lagfärg för ny laguppställning"
              className="h-7 w-9 cursor-pointer bg-transparent border-0"
            />
            <span className="font-mono text-xs text-slate-300">{newColor}</span>
          </div>
        </div>
        <textarea
          rows={3}
          value={newRosterText}
          onChange={(e) => setNewRosterText(e.target.value)}
          placeholder={'Valfri spelarlista, t.ex.:\n00 Målvakt\n7 Spelare Ett\n14 Spelare Två'}
          className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
        />
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!newName.trim() && !newTeamName.trim()}
            onClick={handleCreateRoster}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-40 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Skapa i bibliotek
          </button>
        </div>
      </div>

      {/* Saved Rosters Grid */}
      {savedRosters.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-6 text-center text-sm text-slate-500">
          Inga sparade laguppställningar i biblioteket ännu.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {savedRosters.map((saved) => {
            const numbers = sortJerseyNumbers(Object.keys(saved.roster));
            return (
              <div
                key={saved.id}
                className="rounded-xl border border-slate-800 border-l-[6px] bg-slate-950/90 p-4 space-y-3"
                style={{ borderLeftColor: saved.color }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-extrabold text-white">
                        {saved.name}
                      </span>
                      {saved.ageGroupOrClub && (
                        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-blue-300">
                          {saved.ageGroupOrClub}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      Lagnamn: <strong className="text-slate-200">{saved.teamName}</strong>{' '}
                      • {numbers.length} spelare • Uppdaterad{' '}
                      {formatDateShort(saved.updatedAt)}
                    </p>
                  </div>
                </div>

                {numbers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {numbers.slice(0, 6).map((num) => (
                      <span
                        key={num}
                        className="rounded bg-slate-900 border border-slate-800 px-2 py-0.5 text-[11px] text-slate-300"
                      >
                        <strong className="font-mono text-blue-300">
                          #{num}
                        </strong>{' '}
                        {saved.roster[num]}
                      </span>
                    ))}
                    {numbers.length > 6 && (
                      <span className="rounded bg-slate-900 px-2 py-0.5 text-[11px] text-slate-500">
                        +{numbers.length - 6} till
                      </span>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      loadRosterFromLibrary(saved.id, 'home');
                      setFeedback(`"${saved.name}" sattes som Hemmalag.`);
                    }}
                    className="rounded-lg bg-blue-600/80 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-blue-500 cursor-pointer"
                  >
                    Sätt som Hemmalag
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      loadRosterFromLibrary(saved.id, 'away');
                      setFeedback(`"${saved.name}" sattes som Bortalag.`);
                    }}
                    className="rounded-lg bg-orange-600/80 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-orange-500 cursor-pointer"
                  >
                    Sätt som Bortalag
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      saveTeamToRosterLibrary(
                        'home',
                        saved.name,
                        saved.ageGroupOrClub,
                        saved.id,
                      );
                      setFeedback(
                        `Uppdaterade "${saved.name}" med nuvarande Hemmalag.`,
                      );
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Uppdatera från Hemma
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      saveTeamToRosterLibrary(
                        'away',
                        saved.name,
                        saved.ageGroupOrClub,
                        saved.id,
                      );
                      setFeedback(
                        `Uppdaterade "${saved.name}" med nuvarande Bortalag.`,
                      );
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Uppdatera från Borta
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      duplicateSavedRoster(saved.id);
                      setFeedback(`Duplicerade "${saved.name}".`);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer"
                  >
                    <Copy className="h-3 w-3" />
                    Duplicera
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      deleteSavedRoster(saved.id);
                      setFeedback(`Tog bort "${saved.name}".`);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-900/60 bg-red-950/40 px-2.5 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-900/50 cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3" />
                    Ta bort
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MatchProfilesSection() {
  const matchProfiles = useAppStore((s) => s.matchProfiles);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const saveCurrentAsMatchProfile = useAppStore(
    (s) => s.saveCurrentAsMatchProfile,
  );
  const activateMatchProfile = useAppStore((s) => s.activateMatchProfile);
  const deleteMatchProfile = useAppStore((s) => s.deleteMatchProfile);
  const duplicateMatchProfile = useAppStore((s) => s.duplicateMatchProfile);

  const [newProfileName, setNewProfileName] = useState('');
  const [newClubOrAge, setNewClubOrAge] = useState('');
  const [includeTeams, setIncludeTeams] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleSaveNewProfile = () => {
    const cleanName = newProfileName.trim();
    if (!cleanName) {
      return;
    }
    saveCurrentAsMatchProfile(
      cleanName,
      newClubOrAge.trim() || undefined,
      includeTeams,
    );
    setFeedback(`Sparade ny matchprofil "${cleanName}" och aktiverade den.`);
    setNewProfileName('');
    setNewClubOrAge('');
  };

  return (
    <div className="space-y-6">
      {/* Save Current Setup as New Profile */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
        <div>
          <h3 className="text-lg font-black text-white">
            Spara nuvarande uppsättning som ny Matchprofil
          </h3>
          <p className="text-xs text-slate-400">
            En matchprofil sparar alla soundboard-knappar, låtar, starttider,
            kortkommandon och volym/talmanusinställningar — perfekt för olika
            åldersgrupper eller klubbar.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_auto] gap-3 items-center">
          <input
            type="text"
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
            placeholder="Profilnamn (t.ex. J18 Cup – Hemmaborg)"
            className="rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm font-semibold text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
          />
          <input
            type="text"
            value={newClubOrAge}
            onChange={(e) => setNewClubOrAge(e.target.value)}
            placeholder="Klubb / Åldersgrupp (t.ex. U12 eller A-lag)"
            className="rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            type="button"
            disabled={!newProfileName.trim()}
            onClick={handleSaveNewProfile}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-40 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Spara ny profil
          </button>
        </div>

        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={includeTeams}
            onChange={(e) => setIncludeTeams(e.target.checked)}
            className="h-4 w-4 rounded border-slate-700 bg-slate-950 accent-blue-500"
          />
          Inkludera även nuvarande Hemmalag &amp; Bortalag i profilen
        </label>
      </div>

      {feedback && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-2.5 text-sm font-medium text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{feedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-bold hover:underline cursor-pointer"
          >
            Stäng
          </button>
        </div>
      )}

      {/* Existing Profiles List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {matchProfiles.map((profile) => {
          const isActive = profile.id === activeProfileId;
          return (
            <div
              key={profile.id}
              className={`rounded-2xl border p-5 space-y-4 ${
                isActive
                  ? 'border-blue-500 bg-blue-950/20 shadow-lg shadow-blue-950/30'
                  : 'border-slate-800 bg-slate-900'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Layers className="h-5 w-5 text-blue-400" />
                    <h4 className="text-base font-black text-white">
                      {profile.name}
                    </h4>
                    {isActive && (
                      <span className="rounded-full bg-blue-600 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
                        Aktiv
                      </span>
                    )}
                    {profile.clubOrAgeGroup && (
                      <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-bold text-slate-300">
                        {profile.clubOrAgeGroup}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {profile.soundPads.length} soundboard-knappar
                    {profile.teams
                      ? ` • Lag: ${profile.teams.home.name} vs ${profile.teams.away.name}`
                      : ' • Endast låtar & inställningar'}
                    {' • '}Uppdaterad {formatDateShort(profile.updatedAt)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    activateMatchProfile(profile.id, { loadTeams: false });
                    setFeedback(`Aktiverade låtar & inställningar från "${profile.name}".`);
                  }}
                  className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-500 cursor-pointer"
                >
                  Aktivera Låtar
                </button>
                <button
                  type="button"
                  disabled={!profile.teams}
                  onClick={() => {
                    activateMatchProfile(profile.id, { loadTeams: true });
                    setFeedback(`Aktiverade "${profile.name}" inklusive laguppställningar.`);
                  }}
                  title={
                    profile.teams
                      ? 'Ladda både låtar och lag från denna profil'
                      : 'Denna profil innehåller inga sparade lag'
                  }
                  className="rounded-xl border border-emerald-500/40 bg-emerald-700/30 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-700/50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Aktivera inkl. Lag
                </button>
                <button
                  type="button"
                  onClick={() => {
                    saveCurrentAsMatchProfile(
                      profile.name,
                      profile.clubOrAgeGroup,
                      Boolean(profile.teams),
                      profile.id,
                    );
                    setFeedback(
                      `Skrev över "${profile.name}" med nuvarande låtar och inställningar.`,
                    );
                  }}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer"
                >
                  <Save className="h-3.5 w-3.5" />
                  Spara över med nuvarande
                </button>
                <button
                  type="button"
                  onClick={() => {
                    duplicateMatchProfile(profile.id);
                    setFeedback(`Duplicerade profilen "${profile.name}".`);
                  }}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Duplicera
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deleteMatchProfile(profile.id);
                    setFeedback(`Tog bort matchprofilen "${profile.name}".`);
                  }}
                  className="inline-flex items-center gap-1 rounded-xl border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-900/50 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Ta bort
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type MetadataLookupStatus =
  | { state: 'idle' }
  | { state: 'loading'; message: string }
  | { state: 'success'; message: string }
  | { state: 'error'; message: string };

function MetadataStatusLine({ status }: { status: MetadataLookupStatus }) {
  if (status.state === 'idle') {
    return null;
  }
  if (status.state === 'loading') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-300">
        <Loader2 className="h-3 w-3 animate-spin" />
        {status.message}
      </span>
    );
  }
  if (status.state === 'success') {
    return (
      <span className="text-[11px] font-medium text-emerald-400">
        {status.message}
      </span>
    );
  }
  return (
    <span className="text-[11px] font-medium text-amber-300">
      {status.message}
    </span>
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
  const spotifyClientId = useAppStore((s) => s.settings.spotifyClientId);
  const embeddedMediaTracks = useAppStore((s) => s.embeddedMediaTracks);

  const [uriInput, setUriInput] = useState(track.trackUri);
  const [uriError, setUriError] = useState<string | null>(null);
  const [timeInput, setTimeInput] = useState(
    formatMsToMmSs(track.startTimeMs),
  );
  const [timeValid, setTimeValid] = useState(true);
  const [metaStatus, setMetaStatus] = useState<MetadataLookupStatus>({
    state: 'idle',
  });
  const [localFileMissing, setLocalFileMissing] = useState(false);
  const [isSavingLocalFile, setIsSavingLocalFile] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fetchSeqRef = useRef(0);
  const latestTrackIdRef = useRef<string | null>(
    extractSpotifyTrackId(track.trackUri),
  );
  const lastAutoFetchedIdRef = useRef<string | null>(
    extractSpotifyTrackId(track.trackUri),
  );
  const lastEmittedUriRef = useRef(track.trackUri);

  const isLocalTrack =
    track.sourceType === 'local' || isLocalAudioUri(track.trackUri);

  useEffect(() => {
    if (track.trackUri !== lastEmittedUriRef.current) {
      lastEmittedUriRef.current = track.trackUri;
      setUriInput(track.trackUri);
      setUriError(null);
      const nextTrackId = extractSpotifyTrackId(track.trackUri);
      latestTrackIdRef.current = nextTrackId;
      lastAutoFetchedIdRef.current = nextTrackId;
      fetchSeqRef.current += 1;
      setMetaStatus({ state: 'idle' });
    }
  }, [track.trackUri]);

  useEffect(() => {
    setTimeInput(formatMsToMmSs(track.startTimeMs));
    setTimeValid(true);
  }, [track.startTimeMs]);

  useEffect(() => {
    let cancelled = false;
    if (!isLocalTrack) {
      setLocalFileMissing(false);
      return;
    }
    void getLocalAudioRecord(track.trackUri).then((record) => {
      if (!cancelled) {
        setLocalFileMissing(record === null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isLocalTrack, track.trackUri, embeddedMediaTracks]);

  const runMetadataLookup = async (rawInput: string, force: boolean) => {
    if (isLocalAudioUri(rawInput)) {
      latestTrackIdRef.current = null;
      setMetaStatus({ state: 'idle' });
      return;
    }
    const trackId = extractSpotifyTrackId(rawInput);
    if (!trackId) {
      latestTrackIdRef.current = null;
      if (force) {
        setMetaStatus({
          state: 'error',
          message: 'Ange en giltig Spotify-länk eller URI först.',
        });
      } else {
        setMetaStatus({ state: 'idle' });
      }
      return;
    }

    if (!force && lastAutoFetchedIdRef.current === trackId) {
      return;
    }

    lastAutoFetchedIdRef.current = trackId;
    latestTrackIdRef.current = trackId;
    const requestId = ++fetchSeqRef.current;
    setMetaStatus({
      state: 'loading',
      message: 'Hämtar låttitel & artist...',
    });

    const metadata = await fetchSpotifyTrackMetadata(rawInput, spotifyClientId);

    if (
      fetchSeqRef.current !== requestId ||
      latestTrackIdRef.current !== trackId
    ) {
      return;
    }

    if (metadata) {
      lastEmittedUriRef.current = metadata.trackUri;
      onUpdate({
        trackUri: metadata.trackUri,
        sourceType: 'spotify',
        localFileName: undefined,
        mimeType: undefined,
        title: metadata.title,
        artist: metadata.artist,
      });
      setMetaStatus({
        state: 'success',
        message: metadata.artist
          ? `Hämtade: ${metadata.title} – ${metadata.artist}`
          : `Hämtade: ${metadata.title}`,
      });
    } else {
      setMetaStatus({
        state: 'error',
        message: 'Kunde inte hämta titel/artist automatiskt – fyll i manuellt.',
      });
    }
  };

  const handleLocalFileSelected = async (
    e: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) {
      return;
    }

    setIsSavingLocalFile(true);
    setUriError(null);
    try {
      const reuseMissingUri =
        localFileMissing && isLocalAudioUri(track.trackUri)
          ? track.trackUri
          : undefined;
      const saved = await saveLocalAudioFile(file, reuseMissingUri);
      lastEmittedUriRef.current = saved.trackUri;
      setUriInput(saved.trackUri);
      latestTrackIdRef.current = null;
      lastAutoFetchedIdRef.current = null;
      fetchSeqRef.current += 1;
      setLocalFileMissing(false);
      onUpdate({
        trackUri: saved.trackUri,
        sourceType: 'local',
        localFileName: saved.fileName,
        mimeType: saved.mimeType,
        title: saved.title,
        artist: saved.artist,
      });
      setMetaStatus({
        state: 'success',
        message: `Sparade lokal ljudfil: ${saved.fileName}`,
      });
    } catch {
      setMetaStatus({
        state: 'error',
        message: 'Kunde inte spara vald ljudfil i webbläsarens lagring.',
      });
    } finally {
      setIsSavingLocalFile(false);
    }
  };

  const handleSelectEmbeddedMedia = (selectedUri: string) => {
    const item = embeddedMediaTracks.find(
      (entry) => entry.trackUri === selectedUri,
    );
    if (!item) {
      return;
    }
    lastEmittedUriRef.current = item.trackUri;
    setUriInput(item.trackUri);
    setUriError(null);
    latestTrackIdRef.current = null;
    lastAutoFetchedIdRef.current = null;
    fetchSeqRef.current += 1;
    setLocalFileMissing(false);
    onUpdate({
      trackUri: item.trackUri,
      sourceType: 'local',
      localFileName: item.fileName,
      mimeType: item.mimeType,
      title: item.title,
      artist: item.artist,
    });
    setMetaStatus({
      state: 'success',
      message: `Valde arkivfil: ${item.relativePath}`,
    });
  };

  const handleUriChange = (raw: string) => {
    setUriInput(raw);
    const parsed = tryParseSpotifyUri(raw);
    if (parsed.ok) {
      setUriError(null);
      lastEmittedUriRef.current = parsed.uri;
      if (isLocalAudioUri(parsed.uri)) {
        latestTrackIdRef.current = null;
        lastAutoFetchedIdRef.current = null;
        fetchSeqRef.current += 1;
        setMetaStatus({ state: 'idle' });
        onUpdate({
          trackUri: parsed.uri,
          sourceType: 'local',
        });
      } else {
        onUpdate({
          trackUri: parsed.uri,
          sourceType: 'spotify',
          localFileName: undefined,
          mimeType: undefined,
        });
        void runMetadataLookup(raw, false);
      }
    } else {
      setUriError(parsed.error);
      latestTrackIdRef.current = null;
      lastAutoFetchedIdRef.current = null;
      fetchSeqRef.current += 1;
      setMetaStatus({ state: 'idle' });
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

  const hasValidTrackId = extractSpotifyTrackId(uriInput) !== null;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3 space-y-2.5">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac,.webm,.opus"
        onChange={(e) => void handleLocalFileSelected(e)}
        className="hidden"
      />

      {isLocalTrack && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/40 bg-cyan-950/60 px-2.5 py-0.5 text-[11px] font-bold text-cyan-200">
            <FileAudio className="h-3.5 w-3.5 shrink-0" />
            Lokal ljudfil: {track.localFileName || track.title || track.trackUri}
          </span>
        </div>
      )}

      {isLocalTrack && localFileMissing && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            <span>
              Lokal ljudfil saknas i denna webbläsares IndexedDB (t.ex. efter
              JSON-import) – välj filen igen.
            </span>
          </div>
          <button
            type="button"
            disabled={isSavingLocalFile}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-400/50 bg-amber-600/30 px-2.5 py-1 text-xs font-bold text-amber-100 hover:bg-amber-600/50 disabled:opacity-40 cursor-pointer"
          >
            <FileAudio className="h-3.5 w-3.5" />
            Välj om ljudfil...
          </button>
        </div>
      )}

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
          Spotify-länk, URI eller lokal ljudfil
        </label>
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
          <input
            type="text"
            value={uriInput}
            onChange={(e) => handleUriChange(e.target.value)}
            placeholder="https://open.spotify.com/track/..., spotify:track:... eller local:audio:..."
            className={`flex-1 min-w-0 rounded-lg border px-2.5 py-1.5 font-mono text-xs text-slate-200 focus:outline-none ${
              uriError
                ? 'border-red-500 bg-red-950/30'
                : 'border-slate-800 bg-slate-900 focus:border-blue-500'
            }`}
          />
          <button
            type="button"
            disabled={isSavingLocalFile}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/50 px-3 py-1.5 text-xs font-bold text-cyan-200 hover:bg-cyan-900/60 disabled:opacity-40 cursor-pointer"
          >
            <FileAudio className="h-3.5 w-3.5" />
            Välj lokal ljudfil...
          </button>
          {embeddedMediaTracks.length > 0 && (
            <select
              aria-label={`Välj från src/media för ${track.title || 'spår'}`}
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  handleSelectEmbeddedMedia(e.target.value);
                }
              }}
              className="rounded-lg border border-cyan-500/40 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-cyan-200 focus:border-cyan-400 focus:outline-none cursor-pointer"
            >
              <option value="">Välj från src/media...</option>
              {embeddedMediaTracks.map((item) => (
                <option key={item.trackUri} value={item.trackUri}>
                  {item.title} ({item.relativePath})
                </option>
              ))}
            </select>
          )}
          {!isLocalTrack && (
            <button
              type="button"
              disabled={!hasValidTrackId || metaStatus.state === 'loading'}
              onClick={() => void runMetadataLookup(uriInput, true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-950/50 px-3 py-1.5 text-xs font-bold text-blue-200 hover:bg-blue-900/60 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Hämta info
            </button>
          )}
        </div>
        {uriError && <p className="mt-1 text-[11px] text-red-400">{uriError}</p>}
        {metaStatus.state !== 'idle' && (
          <div className="mt-1">
            <MetadataStatusLine status={metaStatus} />
          </div>
        )}
      </div>
    </div>
  );
}

interface PadCategorySelectorProps {
  value: PadCategory;
  onChange: (category: PadCategory) => void;
  soundboardGroups: SoundboardGroup[];
  onCreateGroup: (label: string) => string;
  ariaLabel?: string;
  selectClassName?: string;
}

function PadCategorySelector({
  value,
  onChange,
  soundboardGroups,
  onCreateGroup,
  ariaLabel,
  selectClassName = 'flex-1 min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none',
}: PadCategorySelectorProps) {
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [newGroupLabel, setNewGroupLabel] = useState('');

  const isKnownValue =
    soundboardGroups.some((group) => group.id === value) ||
    EVENT_PAD_CATEGORIES.includes(value as BuiltinPadCategory);

  const handleQuickCreate = () => {
    const trimmed = newGroupLabel.trim();
    if (!trimmed) {
      return;
    }
    const createdId = onCreateGroup(trimmed);
    if (createdId) {
      onChange(createdId);
    }
    setNewGroupLabel('');
    setIsAddingGroup(false);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <select
          aria-label={ariaLabel}
          value={value}
          onChange={(e) => onChange(e.target.value as PadCategory)}
          className={selectClassName}
        >
          {!isKnownValue && value && (
            <option value={value}>
              {getPadCategoryLabel(value, soundboardGroups)}
            </option>
          )}
          <optgroup label="Soundboard-grupper (Snabbknappar)">
            {soundboardGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Matchhändelser (Mål & Utvisning)">
            {EVENT_PAD_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {PAD_CATEGORY_LABELS[cat]}
              </option>
            ))}
          </optgroup>
        </select>
        <button
          type="button"
          onClick={() => {
            setIsAddingGroup((prev) => !prev);
            setNewGroupLabel('');
          }}
          title="Skapa ny soundboard-grupp direkt"
          className="inline-flex shrink-0 items-center rounded-xl border border-blue-500/40 bg-blue-950/50 px-2.5 py-2 text-xs font-bold text-blue-200 hover:bg-blue-900/60 cursor-pointer"
        >
          + Ny grupp
        </button>
      </div>

      {isAddingGroup && (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={newGroupLabel}
            onChange={(e) => setNewGroupLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleQuickCreate();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setIsAddingGroup(false);
                setNewGroupLabel('');
              }
            }}
            placeholder="Namn på ny grupp..."
            autoFocus
            className="flex-1 min-w-0 rounded-lg border border-blue-500/50 bg-slate-950 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-blue-400 focus:outline-none"
          />
          <button
            type="button"
            disabled={!newGroupLabel.trim()}
            onClick={handleQuickCreate}
            className="shrink-0 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-40 cursor-pointer"
          >
            Skapa
          </button>
          <button
            type="button"
            onClick={() => {
              setIsAddingGroup(false);
              setNewGroupLabel('');
            }}
            className="shrink-0 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 cursor-pointer"
          >
            Avbryt
          </button>
        </div>
      )}
    </div>
  );
}

interface SoundboardGroupRowProps {
  group: SoundboardGroup;
  index: number;
  total: number;
  padCount: number;
  disableDelete: boolean;
  onRename: (label: string) => void;
  onMove: (direction: 'up' | 'down') => void;
  onDelete: () => void;
}

function SoundboardGroupRow({
  group,
  index,
  total,
  padCount,
  disableDelete,
  onRename,
  onMove,
  onDelete,
}: SoundboardGroupRowProps) {
  const [draftLabel, setDraftLabel] = useState(group.label);
  const isFocusedRef = useRef(false);

  useEffect(() => {
    if (!isFocusedRef.current) {
      setDraftLabel(group.label);
    }
  }, [group.label]);

  const handleLabelChange = (raw: string) => {
    setDraftLabel(raw);
    if (raw.trim()) {
      onRename(raw.trim());
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-800 bg-slate-950/90 px-3.5 py-2.5">
      <div className="flex flex-1 min-w-[200px] items-center gap-2.5">
        <input
          type="text"
          aria-label={`Gruppnamn för ${group.label}`}
          value={draftLabel}
          onFocus={() => {
            isFocusedRef.current = true;
          }}
          onChange={(e) => handleLabelChange(e.target.value)}
          onBlur={() => {
            isFocusedRef.current = false;
            const trimmed = draftLabel.trim();
            if (!trimmed) {
              setDraftLabel(group.label);
            } else {
              setDraftLabel(trimmed);
            }
          }}
          className="flex-1 min-w-[140px] rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white focus:border-blue-500 focus:outline-none"
        />
        <span className="shrink-0 rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
          {padCount} {padCount === 1 ? 'knapp' : 'knappar'}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => onMove('up')}
          aria-label={`Flytta grupp ${group.label} upp`}
          className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-200 hover:bg-slate-700 disabled:opacity-35 cursor-pointer"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={index === total - 1}
          onClick={() => onMove('down')}
          aria-label={`Flytta grupp ${group.label} ned`}
          className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-200 hover:bg-slate-700 disabled:opacity-35 cursor-pointer"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={disableDelete}
          onClick={onDelete}
          aria-label={`Ta bort grupp ${group.label}`}
          title={
            disableDelete
              ? 'Minst en grupp måste finnas kvar'
              : padCount > 0
                ? 'Tar bort gruppen och flyttar knapparna till en annan grupp'
                : 'Ta bort grupp'
          }
          className="inline-flex items-center gap-1 rounded-lg border border-red-900/60 bg-red-950/40 px-2.5 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-900/50 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Ta bort
        </button>
      </div>
    </div>
  );
}

function SoundboardGroupsSection() {
  const soundboardGroups = useAppStore((s) => s.settings.soundboardGroups);
  const soundPads = useAppStore((s) => s.soundPads);
  const addSoundboardGroup = useAppStore((s) => s.addSoundboardGroup);
  const updateSoundboardGroup = useAppStore((s) => s.updateSoundboardGroup);
  const moveSoundboardGroup = useAppStore((s) => s.moveSoundboardGroup);
  const deleteSoundboardGroup = useAppStore((s) => s.deleteSoundboardGroup);

  const [newGroupLabel, setNewGroupLabel] = useState('');
  const [groupFeedback, setGroupFeedback] = useState<string | null>(null);

  const handleCreateGroup = () => {
    const trimmed = newGroupLabel.trim();
    if (!trimmed) {
      return;
    }
    const alreadyExists = soundboardGroups.some(
      (g) => g.label.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    addSoundboardGroup(trimmed);
    setNewGroupLabel('');
    setGroupFeedback(
      alreadyExists
        ? `Gruppen "${trimmed}" finns redan.`
        : `Skapade gruppen "${trimmed}".`,
    );
  };

  const handleDeleteGroup = (group: SoundboardGroup) => {
    const padCount = soundPads.filter((p) => p.category === group.id).length;
    const remaining = soundboardGroups.filter((g) => g.id !== group.id);
    const targetLabel =
      remaining[0]?.label ?? PAD_CATEGORY_LABELS.misc;

    deleteSoundboardGroup(group.id);
    if (padCount > 0) {
      setGroupFeedback(
        `Tog bort gruppen "${group.label}" och flyttade ${padCount} ${
          padCount === 1 ? 'knapp' : 'knappar'
        } till "${targetLabel}".`,
      );
    } else {
      setGroupFeedback(`Tog bort gruppen "${group.label}".`);
    }
  };

  return (
    <section
      aria-labelledby="soundboard-groups-heading"
      className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3
            id="soundboard-groups-heading"
            className="text-sm font-bold uppercase tracking-wider text-slate-300"
          >
            Grupper för Snabbknappar (Soundboard-kategorier)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Skapa egna kategorier (t.ex. Intro, Uppvärmning, Periodpaus), byt
            namn och ändra ordningen som visas i Matchläge.
          </p>
        </div>
        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-bold text-slate-300">
          {soundboardGroups.length} grupper
        </span>
      </div>

      <div className="flex flex-wrap sm:flex-nowrap gap-2">
        <input
          type="text"
          value={newGroupLabel}
          onChange={(e) => setNewGroupLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleCreateGroup();
            }
          }}
          placeholder="Namn på ny grupp (t.ex. Intro, Uppvärmning, Periodpaus)"
          className="flex-1 min-w-[200px] rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
        />
        <button
          type="button"
          disabled={!newGroupLabel.trim()}
          onClick={handleCreateGroup}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-40 cursor-pointer"
        >
          + Skapa grupp
        </button>
      </div>

      {groupFeedback && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3.5 py-2 text-xs font-semibold text-emerald-300">
          <span>{groupFeedback}</span>
          <button
            type="button"
            onClick={() => setGroupFeedback(null)}
            className="text-emerald-200 hover:underline cursor-pointer"
          >
            Stäng
          </button>
        </div>
      )}

      <div className="space-y-2">
        {soundboardGroups.map((group, idx) => {
          const padCount = soundPads.filter(
            (pad) => pad.category === group.id,
          ).length;
          const isOnlyMisc =
            soundboardGroups.length <= 1 && group.id === 'misc';
          return (
            <SoundboardGroupRow
              key={group.id}
              group={group}
              index={idx}
              total={soundboardGroups.length}
              padCount={padCount}
              disableDelete={isOnlyMisc}
              onRename={(label) => updateSoundboardGroup(group.id, label)}
              onMove={(direction) => moveSoundboardGroup(group.id, direction)}
              onDelete={() => handleDeleteGroup(group)}
            />
          );
        })}
      </div>
    </section>
  );
}

function formatBytesShort(bytes?: number): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) {
    return '';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function EmbeddedMediaArchiveSection({
  onPreviewTrack,
}: {
  onPreviewTrack: (track: TrackCue, volume: number) => void;
}) {
  const embeddedMediaTracks = useAppStore((s) => s.embeddedMediaTracks);
  const soundPads = useAppStore((s) => s.soundPads);
  const importEmbeddedMediaArchive = useAppStore(
    (s) => s.importEmbeddedMediaArchive,
  );
  const addSoundboardGroup = useAppStore((s) => s.addSoundboardGroup);
  const addSoundPad = useAppStore((s) => s.addSoundPad);

  const [isScanning, setIsScanning] = useState(false);
  const [archiveFeedback, setArchiveFeedback] = useState<string | null>(null);

  const handleRescan = async () => {
    setIsScanning(true);
    try {
      const items = await syncEmbeddedMediaArchive();
      const result = importEmbeddedMediaArchive(items);
      if (result.totalArchiveCount === 0) {
        setArchiveFeedback(
          'Skannade HockeyJockey/src/media: inga accepterade ljudfiler hittades.',
        );
      } else if (result.newlyAddedCount > 0) {
        setArchiveFeedback(
          `Skannade HockeyJockey/src/media: ${result.totalArchiveCount} ${
            result.totalArchiveCount === 1 ? 'ljudfil' : 'ljudfiler'
          } inlästa (${result.newlyAddedCount} ny${
            result.newlyAddedCount === 1 ? '' : 'a'
          } soundboard-knapp${
            result.newlyAddedCount === 1 ? '' : 'ar'
          } skapades).`,
        );
      } else {
        setArchiveFeedback(
          `Skannade HockeyJockey/src/media: ${result.totalArchiveCount} ${
            result.totalArchiveCount === 1 ? 'ljudfil' : 'ljudfiler'
          } inlästa.`,
        );
      }
    } catch {
      setArchiveFeedback('Kunde inte skanna HockeyJockey/src/media.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleCreatePadFromItem = (item: EmbeddedMediaItem) => {
    addSoundboardGroup('Inbäddat Mediaarkiv', 'media_archive');
    const padLabel = item.title || item.fileName;
    addSoundPad({
      label: padLabel,
      category: 'media_archive',
      color: '#0891b2',
      volume: 1.0,
      triggerFlow: null,
      tracks: [
        {
          trackUri: item.trackUri,
          title: padLabel,
          artist: item.artist ?? '',
          startTimeMs: 0,
          sourceType: 'local',
          localFileName: item.fileName,
          mimeType: item.mimeType,
        },
      ],
    });
    setArchiveFeedback(
      `Skapade soundboard-knappen "${padLabel}" i gruppen "Inbäddat Mediaarkiv".`,
    );
  };

  return (
    <section
      aria-labelledby="embedded-media-archive-heading"
      className="rounded-2xl border border-cyan-500/30 bg-slate-900 p-5 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3
            id="embedded-media-archive-heading"
            className="text-sm font-bold uppercase tracking-wider text-cyan-200 flex items-center gap-2"
          >
            <FileAudio className="h-4 w-4 text-cyan-400" />
            <span>
              Inbäddat Mediaarkiv (<code>HockeyJockey/src/media</code>)
            </span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Ljudfiler som placeras i{' '}
            <code className="text-slate-300">HockeyJockey/src/media</code> läses
            in automatiskt vid start och kan provspelas eller läggas på
            valfria soundboard-knappar.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rounded-full border border-cyan-500/30 bg-cyan-950/60 px-3 py-1 text-xs font-bold text-cyan-200">
            {embeddedMediaTracks.length}{' '}
            {embeddedMediaTracks.length === 1 ? 'ljudfil' : 'ljudfiler'}
          </span>
          <button
            type="button"
            disabled={isScanning}
            onClick={() => void handleRescan()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-950/60 px-3.5 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-900/60 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`}
            />
            Skanna om src/media nu
          </button>
        </div>
      </div>

      {archiveFeedback && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3.5 py-2 text-xs font-semibold text-emerald-300">
          <span>{archiveFeedback}</span>
          <button
            type="button"
            onClick={() => setArchiveFeedback(null)}
            className="text-emerald-200 hover:underline cursor-pointer"
          >
            Stäng
          </button>
        </div>
      )}

      {embeddedMediaTracks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/70 p-4 text-xs text-slate-400">
          Inga ljudfiler hittades i{' '}
          <code className="text-slate-300">HockeyJockey/src/media</code>. Lägg
          till <code className="text-slate-300">.mp3</code>,{' '}
          <code className="text-slate-300">.wav</code>,{' '}
          <code className="text-slate-300">.ogg</code>,{' '}
          <code className="text-slate-300">.m4a</code>,{' '}
          <code className="text-slate-300">.flac</code>,{' '}
          <code className="text-slate-300">.aac</code>,{' '}
          <code className="text-slate-300">.webm</code> eller{' '}
          <code className="text-slate-300">.opus</code> i mappen och klicka{' '}
          <strong>Skanna om src/media nu</strong>.
        </div>
      ) : (
        <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-950/90">
          {embeddedMediaTracks.map((item) => {
            const isLinkedToPad = soundPads.some((pad) =>
              pad.tracks.some((t) => t.trackUri === item.trackUri),
            );
            const sizeText = formatBytesShort(item.sizeBytes);
            return (
              <div
                key={item.trackUri}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-white">
                      {item.title}
                    </span>
                    {isLinkedToPad && (
                      <span className="rounded-full bg-emerald-950/70 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                        På Soundboard
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="font-mono text-cyan-300/90">
                      {item.relativePath}
                    </span>
                    {item.artist && (
                      <span>• {item.artist}</span>
                    )}
                    {sizeText && <span>• {sizeText}</span>}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onPreviewTrack(
                        {
                          trackUri: item.trackUri,
                          title: item.title,
                          artist: item.artist,
                          startTimeMs: 0,
                          sourceType: 'local',
                          localFileName: item.fileName,
                          mimeType: item.mimeType,
                        },
                        1.0,
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-700/30 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-700/50 cursor-pointer"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    PROVSPELA 5 SEK
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCreatePadFromItem(item)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-700/30 px-3 py-1.5 text-xs font-bold text-cyan-100 hover:bg-cyan-700/50 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />+ Skapa Soundboard-knapp
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

interface SoundPadEditorProps {
  pad: SoundPad;
  index: number;
  total: number;
  allPads: SoundPad[];
  padHotkey: string;
  onPreviewTrack: (track: TrackCue, volume: number) => void;
}

function SoundPadEditor({
  pad,
  index,
  total,
  allPads,
  padHotkey,
  onPreviewTrack,
}: SoundPadEditorProps) {
  const updateSoundPad = useAppStore((s) => s.updateSoundPad);
  const deleteSoundPad = useAppStore((s) => s.deleteSoundPad);
  const moveSoundPad = useAppStore((s) => s.moveSoundPad);
  const addTrackToPad = useAppStore((s) => s.addTrackToPad);
  const updateTrackInPad = useAppStore((s) => s.updateTrackInPad);
  const removeTrackFromPad = useAppStore((s) => s.removeTrackFromPad);
  const setPadHotkey = useAppStore((s) => s.setPadHotkey);
  const spotifyClientId = useAppStore((s) => s.settings.spotifyClientId);
  const soundboardGroups = useAppStore((s) => s.settings.soundboardGroups);
  const addSoundboardGroup = useAppStore((s) => s.addSoundboardGroup);
  const embeddedMediaTracks = useAppStore((s) => s.embeddedMediaTracks);

  const [newUrl, setNewUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newArtist, setNewArtist] = useState('');
  const [newMmSs, setNewMmSs] = useState('00:00');
  const [formError, setFormError] = useState<string | null>(null);
  const [hotkeyNotice, setHotkeyNotice] = useState<string | null>(null);
  const [metaStatus, setMetaStatus] = useState<MetadataLookupStatus>({
    state: 'idle',
  });
  const [pendingLocalMeta, setPendingLocalMeta] = useState<{
    trackUri: string;
    fileName: string;
    mimeType: string;
  } | null>(null);
  const [isSavingLocalFiles, setIsSavingLocalFiles] = useState(false);

  const addFileInputRef = useRef<HTMLInputElement | null>(null);
  const fetchSeqRef = useRef(0);
  const latestTrackIdRef = useRef<string | null>(null);
  const lastAutoFetchedIdRef = useRef<string | null>(null);
  const userEditedMetaRef = useRef(false);

  const parsedPreview = newUrl.trim()
    ? tryParseSpotifyUri(newUrl)
    : null;
  const isNewUrlLocal =
    parsedPreview?.ok === true && isLocalAudioUri(parsedPreview.uri);
  const hasValidNewTrackId = extractSpotifyTrackId(newUrl) !== null;

  const runNewTrackMetadataLookup = async (rawInput: string, force: boolean) => {
    if (isLocalAudioUri(rawInput)) {
      latestTrackIdRef.current = null;
      setMetaStatus({ state: 'idle' });
      return;
    }
    const trackId = extractSpotifyTrackId(rawInput);
    if (!trackId) {
      latestTrackIdRef.current = null;
      if (force) {
        setMetaStatus({
          state: 'error',
          message: 'Ange en giltig Spotify-länk eller URI först.',
        });
      } else {
        setMetaStatus({ state: 'idle' });
      }
      return;
    }

    if (!force && lastAutoFetchedIdRef.current === trackId) {
      return;
    }

    lastAutoFetchedIdRef.current = trackId;
    latestTrackIdRef.current = trackId;
    userEditedMetaRef.current = false;
    const requestId = ++fetchSeqRef.current;
    setMetaStatus({
      state: 'loading',
      message: 'Hämtar låttitel & artist...',
    });

    const metadata = await fetchSpotifyTrackMetadata(rawInput, spotifyClientId);

    if (
      fetchSeqRef.current !== requestId ||
      latestTrackIdRef.current !== trackId
    ) {
      return;
    }

    if (metadata) {
      if (force || !userEditedMetaRef.current) {
        setNewTitle(metadata.title);
        setNewArtist(metadata.artist);
      }
      setMetaStatus({
        state: 'success',
        message: metadata.artist
          ? `Hämtade: ${metadata.title} – ${metadata.artist}`
          : `Hämtade: ${metadata.title}`,
      });
    } else {
      setMetaStatus({
        state: 'error',
        message: 'Kunde inte hämta titel/artist automatiskt – fyll i manuellt.',
      });
    }
  };

  const handleNewLocalFilesSelected = async (
    e: ChangeEvent<HTMLInputElement>,
  ) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) {
      return;
    }
    const files = Array.from(fileList);
    e.target.value = '';

    setIsSavingLocalFiles(true);
    setFormError(null);
    latestTrackIdRef.current = null;
    lastAutoFetchedIdRef.current = null;
    fetchSeqRef.current += 1;

    try {
      if (files.length === 1) {
        const saved = await saveLocalAudioFile(files[0]);
        setNewUrl(saved.trackUri);
        setNewTitle(saved.title);
        setNewArtist(saved.artist);
        setPendingLocalMeta({
          trackUri: saved.trackUri,
          fileName: saved.fileName,
          mimeType: saved.mimeType,
        });
        userEditedMetaRef.current = false;
        setMetaStatus({
          state: 'success',
          message: `Lokal ljudfil vald: ${saved.fileName}`,
        });
      } else {
        const startTimeMs = isValidMmSs(newMmSs)
          ? parseTimeMmSsToMs(newMmSs)
          : 0;
        let addedCount = 0;
        for (const file of files) {
          const saved = await saveLocalAudioFile(file);
          addTrackToPad(pad.id, {
            trackUri: saved.trackUri,
            title: saved.title,
            artist: saved.artist,
            startTimeMs,
            sourceType: 'local',
            localFileName: saved.fileName,
            mimeType: saved.mimeType,
          });
          addedCount += 1;
        }
        setNewUrl('');
        setNewTitle('');
        setNewArtist('');
        setPendingLocalMeta(null);
        userEditedMetaRef.current = false;
        setMetaStatus({
          state: 'success',
          message: `Lade till ${addedCount} lokala ljudfiler i poolen.`,
        });
      }
    } catch {
      setFormError('Kunde inte spara vald lokal ljudfil i webbläsaren.');
    } finally {
      setIsSavingLocalFiles(false);
    }
  };

  const handleNewUrlChange = (raw: string) => {
    setNewUrl(raw);
    setFormError(null);
    if (pendingLocalMeta && raw.trim() !== pendingLocalMeta.trackUri) {
      setPendingLocalMeta(null);
    }
    const trackId = extractSpotifyTrackId(raw);
    if (!trackId) {
      latestTrackIdRef.current = null;
      lastAutoFetchedIdRef.current = null;
      fetchSeqRef.current += 1;
      setMetaStatus({ state: 'idle' });
      return;
    }
    void runNewTrackMetadataLookup(raw, false);
  };

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

    const isLocal = isLocalAudioUri(uriRes.uri);
    const localMeta =
      isLocal && pendingLocalMeta?.trackUri === uriRes.uri
        ? pendingLocalMeta
        : null;

    addTrackToPad(pad.id, {
      trackUri: uriRes.uri,
      title: newTitle.trim() || (isLocal ? 'Lokal ljudfil' : 'Ny Spotify-låt'),
      artist: newArtist.trim(),
      startTimeMs: parseTimeMmSsToMs(newMmSs),
      sourceType: isLocal ? 'local' : 'spotify',
      ...(localMeta
        ? {
            localFileName: localMeta.fileName,
            mimeType: localMeta.mimeType,
          }
        : {}),
    });

    setNewUrl('');
    setNewTitle('');
    setNewArtist('');
    setNewMmSs('00:00');
    setFormError(null);
    setPendingLocalMeta(null);
    latestTrackIdRef.current = null;
    lastAutoFetchedIdRef.current = null;
    userEditedMetaRef.current = false;
    fetchSeqRef.current += 1;
    setMetaStatus({ state: 'idle' });
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
            {getPadCategoryLabel(pad.category, soundboardGroups)}
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
          <PadCategorySelector
            ariaLabel={`Kategori för ${pad.label}`}
            value={pad.category}
            onChange={(category) => updateSoundPad(pad.id, { category })}
            soundboardGroups={soundboardGroups}
            onCreateGroup={addSoundboardGroup}
            selectClassName="flex-1 min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
          />
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

      {/* Inline Hotkey Binding for Pad */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2.5">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
          <Keyboard className="h-4 w-4 text-blue-400" />
          <span>Snabbkommando för denna knapp:</span>
          {hotkeyNotice && (
            <span className="text-amber-300 font-medium">{hotkeyNotice}</span>
          )}
        </div>
        <HotkeyRecorder
          compact
          ariaLabel={`Snabbkommando för ${pad.label}`}
          currentHotkey={padHotkey}
          onAssign={(hotkey) => {
            const replaced = setPadHotkey(pad.id, hotkey);
            if (replaced) {
              setHotkeyNotice(
                `Flyttade "${hotkey}" från "${describeHotkeyTarget(replaced, allPads)}".`,
              );
            } else {
              setHotkeyNotice(null);
            }
          }}
        />
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
          <input
            ref={addFileInputRef}
            type="file"
            multiple
            accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac,.webm,.opus"
            onChange={(e) => void handleNewLocalFilesSelected(e)}
            className="hidden"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold text-slate-300">
              + Lägg till låt i poolen
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {embeddedMediaTracks.length > 0 && (
                <select
                  aria-label={`Välj från src/media till ${pad.label}`}
                  value=""
                  onChange={(e) => {
                    const selectedUri = e.target.value;
                    if (!selectedUri) {
                      return;
                    }
                    const item = embeddedMediaTracks.find(
                      (entry) => entry.trackUri === selectedUri,
                    );
                    if (!item) {
                      return;
                    }
                    const startTimeMs = isValidMmSs(newMmSs)
                      ? parseTimeMmSsToMs(newMmSs)
                      : 0;
                    addTrackToPad(pad.id, {
                      trackUri: item.trackUri,
                      title: item.title,
                      artist: item.artist,
                      startTimeMs,
                      sourceType: 'local',
                      localFileName: item.fileName,
                      mimeType: item.mimeType,
                    });
                    setFormError(null);
                    setMetaStatus({
                      state: 'success',
                      message: `Lade till "${item.title}" från src/media i poolen.`,
                    });
                  }}
                  className="rounded-lg border border-cyan-500/40 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-cyan-200 focus:border-cyan-400 focus:outline-none cursor-pointer"
                >
                  <option value="">Välj från src/media...</option>
                  {embeddedMediaTracks.map((item) => (
                    <option key={item.trackUri} value={item.trackUri}>
                      {item.title} ({item.relativePath})
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                disabled={isSavingLocalFiles}
                onClick={() => addFileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/50 px-3 py-1.5 text-xs font-bold text-cyan-200 hover:bg-cyan-900/60 disabled:opacity-40 cursor-pointer"
              >
                <FileAudio className="h-3.5 w-3.5" />
                Välj lokal ljudfil...
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[1.8fr_1fr_1fr_100px] gap-2">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={newUrl}
                onChange={(e) => handleNewUrlChange(e.target.value)}
                placeholder="Spotify-länk, URI eller lokal ljudfil (local:audio:...)"
                className="flex-1 min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-mono text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
              {!isNewUrlLocal && (
                <button
                  type="button"
                  disabled={!hasValidNewTrackId || metaStatus.state === 'loading'}
                  onClick={() => void runNewTrackMetadataLookup(newUrl, true)}
                  className="inline-flex shrink-0 items-center rounded-lg border border-blue-500/40 bg-blue-950/50 px-2.5 py-2 text-xs font-bold text-blue-200 hover:bg-blue-900/60 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Hämta info
                </button>
              )}
            </div>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => {
                userEditedMetaRef.current = true;
                setNewTitle(e.target.value);
              }}
              placeholder="Låttitel"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
            <input
              type="text"
              value={newArtist}
              onChange={(e) => {
                userEditedMetaRef.current = true;
                setNewArtist(e.target.value);
              }}
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
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {isNewUrlLocal ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/40 bg-cyan-950/60 px-2.5 py-0.5 text-[11px] font-bold text-cyan-200">
                  <FileAudio className="h-3.5 w-3.5 shrink-0" />
                  Lokal ljudfil:{' '}
                  {pendingLocalMeta?.fileName ||
                    newTitle.trim() ||
                    parsedPreview?.uri}
                </span>
              ) : (
                parsedPreview?.ok && (
                  <span className="text-emerald-400 font-mono">
                    Konverterad URI: {parsedPreview.uri}
                  </span>
                )
              )}
              <MetadataStatusLine status={metaStatus} />
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

function KeyBindingsSection() {
  const settings = useAppStore((s) => s.settings);
  const soundPads = useAppStore((s) => s.soundPads);
  const setActionHotkey = useAppStore((s) => s.setActionHotkey);
  const setPadHotkey = useAppStore((s) => s.setPadHotkey);
  const resetHotkeysToDefault = useAppStore((s) => s.resetHotkeysToDefault);

  const [conflictBanner, setConflictBanner] = useState<string | null>(null);

  const handleAssignAction = (actionId: MatchActionId, hotkey: string) => {
    const replaced = setActionHotkey(actionId, hotkey);
    if (replaced) {
      setConflictBanner(
        `Kortkommandot "${hotkey}" flyttades från "${describeHotkeyTarget(replaced, soundPads)}" till "${MATCH_ACTION_LABELS[actionId]}".`,
      );
    } else {
      setConflictBanner(null);
    }
  };

  const handleAssignPad = (pad: SoundPad, hotkey: string) => {
    const replaced = setPadHotkey(pad.id, hotkey);
    if (replaced) {
      setConflictBanner(
        `Kortkommandot "${hotkey}" flyttades från "${describeHotkeyTarget(replaced, soundPads)}" till "${pad.label}".`,
      );
    } else {
      setConflictBanner(null);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-5 lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Keyboard className="h-5 w-5 text-blue-400" />
          <div>
            <h3 className="text-lg font-black text-white">
              Snabbkommandon / Kortkommandon
            </h3>
            <p className="text-xs text-slate-400">
              Klicka &quot;Byt tangent...&quot; och tryck på valfri tangent eller
              kombination (t.ex. F5, Q, Shift+Space, Ctrl+1). Dubbletter flyttas
              automatiskt.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            resetHotkeysToDefault();
            setConflictBanner('Återställde standardkortkommandon.');
          }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Återställ standardkortkommandon
        </button>
      </div>

      {conflictBanner && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-950/40 px-3.5 py-2.5 text-xs font-semibold text-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            <span>{conflictBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setConflictBanner(null)}
            className="text-amber-300 hover:underline cursor-pointer"
          >
            Stäng
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Match Actions (7 st) */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Matchfunktioner ({MATCH_ACTION_IDS.length} st)
          </h4>
          <div className="rounded-xl border border-slate-800 bg-slate-950 divide-y divide-slate-800/80">
            {MATCH_ACTION_IDS.map((actionId) => (
              <div
                key={actionId}
                className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5"
              >
                <span className="text-sm font-semibold text-slate-100">
                  {MATCH_ACTION_LABELS[actionId]}
                </span>
                <HotkeyRecorder
                  ariaLabel={MATCH_ACTION_LABELS[actionId]}
                  currentHotkey={settings.keyBindings.actions[actionId] ?? ''}
                  onAssign={(hotkey) => handleAssignAction(actionId, hotkey)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Soundboard Pads */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Soundboard-knappar ({soundPads.length} st)
          </h4>
          <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 divide-y divide-slate-800/80">
            {soundPads.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">
                Inga soundboard-knappar konfigurerade.
              </div>
            ) : (
              soundPads.map((pad) => (
                <div
                  key={pad.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: pad.color }}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-100">
                        {pad.label}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {getPadCategoryLabel(
                          pad.category,
                          settings.soundboardGroups,
                        )}
                      </div>
                    </div>
                  </div>
                  <HotkeyRecorder
                    ariaLabel={pad.label}
                    currentHotkey={
                      pad.hotkey || settings.keyBindings.pads[pad.id] || ''
                    }
                    onAssign={(hotkey) => handleAssignPad(pad, hotkey)}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const PIPER_VOICE_OPTIONS: ReadonlyArray<{
  id: PiperVoiceId;
  label: string;
  description: string;
}> = [
  {
    id: 'sv_SE-nst-medium',
    label: 'NST – Svensk Speakerröst (Man/Neutral)',
    description: 'Tydlig neutral arenaröst baserad på Nordisk Språkteknologi.',
  },
  {
    id: 'sv_SE-lisa-medium',
    label: 'Lisa – Svensk Speakerröst (Kvinna)',
    description: 'Klar och varm svensk speakerröst för bås och teleprompter.',
  },
];

function TtsSettingsSection() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const [ttsState, setTtsState] = useState<TtsServiceState>(() =>
    ttsService.getState(),
  );
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  useEffect(() => {
    const unsubscribe = ttsService.subscribe(setTtsState);
    setIsCheckingStatus(true);
    void ttsService.checkStatus().finally(() => {
      setIsCheckingStatus(false);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const handleRefreshStatus = async () => {
    setIsCheckingStatus(true);
    try {
      await ttsService.checkStatus();
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const isSpeaking =
    ttsState.playbackState === 'loading' ||
    ttsState.playbackState === 'speaking';
  const piperAvailable = ttsState.piperStatus?.available === true;

  const sampleText =
    'Mål för Sundsvall Hockey! Målskytt nummer 22, Rasmus Karlsson. Framspelad av nummer 14 Erik Svensson.';

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-5 lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Volume2 className="h-5 w-5 text-cyan-400" />
          <div>
            <h3 className="text-lg font-black text-white">
              AI-Speaker &amp; Talsyntes för Teleprompter (Piper Offline TTS)
            </h3>
            <p className="text-xs text-slate-400">
              Lokal svensk talsyntes med automatiskt Smart Samspel som sänker
              arenamusiken innan utrop och höjer den igen efteråt.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${
              piperAvailable
                ? 'border-emerald-500/40 bg-emerald-950/60 text-emerald-300'
                : 'border-amber-500/40 bg-amber-950/50 text-amber-300'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                piperAvailable ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            {piperAvailable
              ? 'Tillgänglig offline'
              : 'Ej installerad – Web Speech fallback'}
          </span>

          <button
            type="button"
            disabled={isCheckingStatus}
            onClick={() => void handleRefreshStatus()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isCheckingStatus ? 'animate-spin' : ''}`}
            />
            Uppdatera status
          </button>
        </div>
      </div>

      {/* Master TTS Toggle */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="text-sm font-bold text-white">
            Aktivera talsyntes-knapp i talmanus
          </div>
          <p className="text-xs text-slate-400">
            Visar knappen för AI-Speaker i mål- och utvisningsflödets talmanus.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.ttsEnabled}
          aria-label="Aktivera talsyntes-knapp i talmanus"
          onClick={() => updateSettings({ ttsEnabled: !settings.ttsEnabled })}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
            settings.ttsEnabled
              ? 'border-emerald-400/50 bg-emerald-600'
              : 'border-slate-600 bg-slate-700'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
              settings.ttsEnabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Engine & Voice Selection */}
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Motorval
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => updateSettings({ ttsEngine: 'piper' })}
                className={`rounded-xl border px-3.5 py-2.5 text-left transition-colors cursor-pointer ${
                  settings.ttsEngine === 'piper'
                    ? 'border-cyan-400/70 bg-cyan-950/60 text-cyan-100'
                    : 'border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800/80'
                }`}
              >
                <div className="text-xs font-extrabold">
                  Piper TTS – Offline Svensk AI-röst
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400">
                  Körs lokalt på datorn med automatisk Web Speech-fallback.
                </div>
              </button>

              <button
                type="button"
                onClick={() => updateSettings({ ttsEngine: 'webspeech' })}
                className={`rounded-xl border px-3.5 py-2.5 text-left transition-colors cursor-pointer ${
                  settings.ttsEngine === 'webspeech'
                    ? 'border-cyan-400/70 bg-cyan-950/60 text-cyan-100'
                    : 'border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800/80'
                }`}
              >
                <div className="text-xs font-extrabold">
                  Webbläsarens Web Speech
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400">
                  Inbyggd svensk systemröst (sv-SE) i webbläsaren.
                </div>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Röstval (Piper Offline)
            </div>
            <div className="space-y-2">
              {PIPER_VOICE_OPTIONS.map((voice) => {
                const statusEntry = ttsState.piperStatus?.voices.find(
                  (v) => v.id === voice.id,
                );
                const isSelected = settings.ttsVoiceId === voice.id;
                const voiceAvailable = statusEntry?.available === true;

                return (
                  <button
                    key={voice.id}
                    type="button"
                    onClick={() => updateSettings({ ttsVoiceId: voice.id })}
                    className={`w-full rounded-xl border px-3.5 py-2.5 text-left transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'border-blue-400/70 bg-blue-950/50 text-white'
                        : 'border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800/80'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-extrabold">{voice.label}</div>
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        {voice.description}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        voiceAvailable
                          ? 'border-emerald-500/40 bg-emerald-950/60 text-emerald-300'
                          : 'border-slate-700 bg-slate-900 text-slate-400'
                      }`}
                    >
                      {statusEntry
                        ? voiceAvailable
                          ? 'Tillgänglig'
                          : 'Saknas'
                        : 'Okänd'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sliders, Automation Switches & Preview */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-slate-800 bg-slate-950/80 p-3.5">
            <div>
              <label
                htmlFor="tts-rate-range"
                className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1"
              >
                Talhastighet ({settings.ttsRate.toFixed(2)}x)
              </label>
              <input
                id="tts-rate-range"
                type="range"
                min={0.5}
                max={2.0}
                step={0.05}
                value={settings.ttsRate}
                onChange={(e) =>
                  updateSettings({ ttsRate: Number(e.target.value) })
                }
                className="w-full accent-cyan-400 cursor-pointer"
              />
              <div className="mt-1 flex justify-between text-[10px] text-slate-500 font-mono">
                <span>0.5x</span>
                <span>1.0x</span>
                <span>2.0x</span>
              </div>
            </div>

            <div>
              <label
                htmlFor="tts-volume-range"
                className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1"
              >
                Röstvolym ({Math.round(settings.ttsVolume * 100)}%)
              </label>
              <input
                id="tts-volume-range"
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(settings.ttsVolume * 100)}
                onChange={(e) =>
                  updateSettings({ ttsVolume: Number(e.target.value) / 100 })
                }
                className="w-full accent-cyan-400 cursor-pointer"
              />
              <div className="mt-1 flex justify-between text-[10px] text-slate-500 font-mono">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-white">
                  Läs upp talmanus automatiskt när mål/utvisning visas
                </div>
                <div className="text-[11px] text-slate-400">
                  Startar AI-speakern direkt när manussteget öppnas.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.ttsAutoRead}
                aria-label="Läs upp talmanus automatiskt när mål/utvisning visas"
                onClick={() =>
                  updateSettings({ ttsAutoRead: !settings.ttsAutoRead })
                }
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                  settings.ttsAutoRead
                    ? 'border-emerald-400/50 bg-emerald-600'
                    : 'border-slate-600 bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    settings.ttsAutoRead ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-white">
                  Höj musiken automatiskt när AI-speakern pratat klart
                </div>
                <div className="text-[11px] text-slate-400">
                  Duckar arenamusiken före uppläsning och återställer till 100%
                  när talet är slut.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.ttsRestoreMusicAfter}
                aria-label="Höj musiken automatiskt när AI-speakern pratat klart"
                onClick={() =>
                  updateSettings({
                    ttsRestoreMusicAfter: !settings.ttsRestoreMusicAfter,
                  })
                }
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                  settings.ttsRestoreMusicAfter
                    ? 'border-emerald-400/50 bg-emerald-600'
                    : 'border-slate-600 bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    settings.ttsRestoreMusicAfter
                      ? 'translate-x-6'
                      : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                if (isSpeaking) {
                  ttsService.stop();
                } else {
                  void ttsService.speak(sampleText, settings);
                }
              }}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-black transition-colors cursor-pointer ${
                isSpeaking
                  ? 'border-red-400/60 bg-red-600 text-white hover:bg-red-500'
                  : 'border-cyan-400/50 bg-cyan-600 text-white hover:bg-cyan-500'
              }`}
            >
              {ttsState.playbackState === 'loading' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isSpeaking ? (
                <Square className="h-4 w-4 fill-current" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
              <span>
                {isSpeaking
                  ? '⏹ Stoppa provlyssning'
                  : '🔊 Provlyssna AI-Speaker'}
              </span>
            </button>

            {(ttsState.usedFallback || ttsState.lastError) && (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-950/40 px-3 py-1.5 text-xs font-medium text-amber-200">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                <span>{ttsState.lastError || 'Web Speech fallback aktiv'}</span>
              </span>
            )}
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
  const savedRosters = useAppStore((s) => s.savedRosters);
  const matchProfiles = useAppStore((s) => s.matchProfiles);
  const activeProfileId = useAppStore((s) => s.activeProfileId);

  const addSoundPad = useAppStore((s) => s.addSoundPad);
  const addSoundboardGroup = useAppStore((s) => s.addSoundboardGroup);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const updateScriptTemplates = useAppStore((s) => s.updateScriptTemplates);
  const exportConfigJson = useAppStore((s) => s.exportConfigJson);
  const importConfigJson = useAppStore((s) => s.importConfigJson);
  const resetToDefaults = useAppStore((s) => s.resetToDefaults);

  const [newPadLabel, setNewPadLabel] = useState('');
  const [newPadCategory, setNewPadCategory] = useState<PadCategory>(
    () => settings.soundboardGroups[0]?.id ?? 'faceoff_off',
  );
  const [newPadColor, setNewPadColor] = useState('#2563eb');

  useEffect(() => {
    const isValid =
      settings.soundboardGroups.some((g) => g.id === newPadCategory) ||
      EVENT_PAD_CATEGORIES.includes(newPadCategory as BuiltinPadCategory);
    if (!isValid) {
      setNewPadCategory(settings.soundboardGroups[0]?.id ?? 'misc');
    }
  }, [settings.soundboardGroups, newPadCategory]);

  const [backupFeedback, setBackupFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [pasteJson, setPasteJson] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  const activeProfile = matchProfiles.find((p) => p.id === activeProfileId);

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
            Laguppställningar &amp; Bibliotek ({savedRosters.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('profiles')}
            className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-colors cursor-pointer ${
              activeTab === 'profiles'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            Matchprofiler &amp; Klubbar ({matchProfiles.length})
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
            Spotify, Kortkommandon &amp; Backup
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300">
            Aktiv profil:{' '}
            <strong className="text-blue-300">
              {activeProfile ? activeProfile.name : 'Anpassad (ej sparad)'}
            </strong>
          </span>
          <button
            type="button"
            onClick={onStopAudio}
            className="rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 cursor-pointer"
          >
            Stoppa provspelning
          </button>
        </div>
      </div>

      {/* TAB 1: ROSTER MANAGER & ROSTER LIBRARY */}
      {activeTab === 'roster' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <TeamRosterEditor team={teams.home} savedRosters={savedRosters} />
            <TeamRosterEditor team={teams.away} savedRosters={savedRosters} />
          </div>
          <RosterLibrarySection />
        </div>
      )}

      {/* TAB 2: MATCH PROFILES */}
      {activeTab === 'profiles' && <MatchProfilesSection />}

      {/* TAB 3: SOUNDBOARD CONFIG */}
      {activeTab === 'soundboard' && (
        <div className="space-y-6">
          {/* Embedded Media Archive */}
          <EmbeddedMediaArchiveSection onPreviewTrack={onPreviewTrack} />

          {/* Soundboard Groups Manager */}
          <SoundboardGroupsSection />

          {/* New Pad Creator */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              Skapa ny soundboard-knapp
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-[1.5fr_1fr_auto_auto] gap-3 items-start">
              <input
                type="text"
                value={newPadLabel}
                onChange={(e) => setNewPadLabel(e.target.value)}
                placeholder="Namn på knapp (t.ex. Tekning Powerplay)"
                className="rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
              <PadCategorySelector
                ariaLabel="Kategori för ny soundboard-knapp"
                value={newPadCategory}
                onChange={setNewPadCategory}
                soundboardGroups={settings.soundboardGroups}
                onCreateGroup={addSoundboardGroup}
                selectClassName="flex-1 min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
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
                allPads={soundPads}
                padHotkey={pad.hotkey || settings.keyBindings.pads[pad.id] || ''}
                onPreviewTrack={onPreviewTrack}
              />
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: SPOTIFY, HOTKEYS, SETTINGS & BACKUP */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Piper Offline AI-Speaker & TTS Settings */}
          <TtsSettingsSection />

          {/* Key Bindings Editor */}
          <KeyBindingsSection />

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

              {/* Away Goal Silence Setting */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-sm font-bold text-white">
                      Sportslig tystnad vid bortamål
                    </div>
                    <p className="text-xs text-slate-400">
                      {settings.awayGoalSilence
                        ? 'Sportslig tystnad: ingen musik startas automatiskt vid bortamål (omstartslåt kan startas manuellt inför tekning).'
                        : 'Starta musik från listan direkt vid bortamål: låt från bortamål-/omstartslistan startar automatiskt.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.awayGoalSilence}
                    aria-label="Sportslig tystnad vid bortamål"
                    onClick={() =>
                      updateSettings({
                        awayGoalSilence: !settings.awayGoalSilence,
                      })
                    }
                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                      settings.awayGoalSilence
                        ? 'border-emerald-400/50 bg-emerald-600'
                        : 'border-orange-400/50 bg-orange-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                        settings.awayGoalSilence
                          ? 'translate-x-6'
                          : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => updateSettings({ awayGoalSilence: true })}
                    className={`rounded-lg border px-3 py-2 text-left text-xs font-bold transition-colors cursor-pointer ${
                      settings.awayGoalSilence
                        ? 'border-emerald-500/60 bg-emerald-950/50 text-emerald-200'
                        : 'border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    Sportslig tystnad
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSettings({ awayGoalSilence: false })}
                    className={`rounded-lg border px-3 py-2 text-left text-xs font-bold transition-colors cursor-pointer ${
                      !settings.awayGoalSilence
                        ? 'border-orange-500/60 bg-orange-950/50 text-orange-200'
                        : 'border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    Starta musik från listan direkt vid bortamål
                  </button>
                </div>
              </div>

              {/* Track Transition Fade Out / Fade In Setting */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-sm font-bold text-white">
                      Mjuk övergång (Fade Out / Fade In) vid låtbyte
                    </div>
                    <p className="text-xs text-slate-400">
                      {settings.crossfadeEnabled
                        ? `Aktiv: när en låt redan spelas tonas den ut (${settings.crossfadeDurationMs} ms) innan nästa låt tonas in (${settings.crossfadeDurationMs} ms). Start från tystnad sker alltid omedelbart.`
                        : 'Avstängd: byte mellan låtar sker direkt utan mjuk ut- och intoning.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.crossfadeEnabled}
                    aria-label="Mjuk övergång (Fade Out / Fade In) vid låtbyte"
                    onClick={() =>
                      updateSettings({
                        crossfadeEnabled: !settings.crossfadeEnabled,
                      })
                    }
                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                      settings.crossfadeEnabled
                        ? 'border-emerald-400/50 bg-emerald-600'
                        : 'border-slate-600 bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                        settings.crossfadeEnabled
                          ? 'translate-x-6'
                          : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div
                  className={`grid grid-cols-1 sm:grid-cols-[1fr_110px] gap-3 items-center pt-1 ${
                    settings.crossfadeEnabled ? '' : 'opacity-50'
                  }`}
                >
                  <div>
                    <label
                      htmlFor="crossfade-duration-range"
                      className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1"
                    >
                      Tid per riktning ({settings.crossfadeDurationMs} ms)
                    </label>
                    <input
                      id="crossfade-duration-range"
                      type="range"
                      min={0}
                      max={2000}
                      step={50}
                      disabled={!settings.crossfadeEnabled}
                      value={Math.min(2000, settings.crossfadeDurationMs)}
                      onChange={(e) => {
                        const parsed = Number(e.target.value);
                        if (Number.isFinite(parsed)) {
                          updateSettings({
                            crossfadeDurationMs: Math.min(
                              5000,
                              Math.max(0, Math.round(parsed)),
                            ),
                          });
                        }
                      }}
                      className="w-full accent-blue-500 cursor-pointer disabled:cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="crossfade-duration-input"
                      className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1"
                    >
                      Millisekunder
                    </label>
                    <input
                      id="crossfade-duration-input"
                      type="number"
                      min={0}
                      max={5000}
                      step={50}
                      disabled={!settings.crossfadeEnabled}
                      value={settings.crossfadeDurationMs}
                      onChange={(e) => {
                        const parsed = Number(e.target.value);
                        if (Number.isFinite(parsed)) {
                          updateSettings({
                            crossfadeDurationMs: Math.min(
                              5000,
                              Math.max(0, Math.round(parsed)),
                            ),
                          });
                        }
                      }}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed"
                    />
                  </div>
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
                  onChange={(e) => handleTemplateChange('goal', e.target.value)}
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
              All data sparas automatiskt i webbläsarens localStorage — inklusive
              matchprofiler, roster-bibliotek och kortkommandon. Här kan du
              exportera hela konfigurationen eller läsa in en sparad fil.
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
                        message:
                          'Standardlag, profiler, bibliotek, kortkommandon och knappar återställda.',
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
