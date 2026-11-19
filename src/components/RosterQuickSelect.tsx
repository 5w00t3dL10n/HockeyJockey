import { useMemo, useState } from 'react';
import { Check, Pencil, UserPlus, Users } from 'lucide-react';
import { lookupPlayerName, normalizeJerseyNumber } from '../utils/domain.ts';

export interface RosterChipEntry {
  number: string;
  name: string;
  isExactMatch: boolean;
}

export function sortRosterEntries(
  roster: Record<string, string>,
): Array<[string, string]> {
  return Object.entries(roster)
    .filter(
      ([num, name]) =>
        num.trim().length > 0 && typeof name === 'string' && name.trim().length > 0,
    )
    .sort(([a], [b]) => {
      const numA = Number.parseInt(a, 10);
      const numB = Number.parseInt(b, 10);
      if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) {
        return numA - numB;
      }
      return a.localeCompare(b, 'sv');
    });
}

function isChipMatch(
  chipNumber: string,
  queryNumber: string,
): { matches: boolean; isExactMatch: boolean } {
  const normQuery = normalizeJerseyNumber(queryNumber);
  if (!normQuery) {
    return { matches: true, isExactMatch: false };
  }

  const normChip = normalizeJerseyNumber(chipNumber);
  if (!normChip) {
    return { matches: false, isExactMatch: false };
  }

  if (normChip === normQuery) {
    return { matches: true, isExactMatch: true };
  }

  if (normChip.startsWith(normQuery)) {
    return { matches: true, isExactMatch: false };
  }

  if (/^\d+$/.test(normQuery) && /^\d+$/.test(normChip)) {
    const queryInt = Number.parseInt(normQuery, 10);
    const chipInt = Number.parseInt(normChip, 10);
    if (queryInt > 0 && chipInt > 0) {
      if (chipInt === queryInt) {
        return { matches: true, isExactMatch: true };
      }
      if (String(chipInt).startsWith(String(queryInt))) {
        return { matches: true, isExactMatch: false };
      }
    }
  }

  return { matches: false, isExactMatch: false };
}

interface RosterQuickSelectProps {
  roster: Record<string, string>;
  filterQuery: string;
  onSelectPlayer: (jerseyNumber: string) => void;
  teamColor?: string;
}

export function RosterQuickSelect({
  roster,
  filterQuery,
  onSelectPlayer,
  teamColor,
}: RosterQuickSelectProps) {
  const sortedEntries = useMemo(() => sortRosterEntries(roster), [roster]);

  const filteredChips = useMemo<RosterChipEntry[]>(() => {
    const result: RosterChipEntry[] = [];
    for (const [number, name] of sortedEntries) {
      const match = isChipMatch(number, filterQuery);
      if (match.matches) {
        result.push({
          number,
          name: name.trim(),
          isExactMatch: match.isExactMatch,
        });
      }
    }
    return result;
  }, [sortedEntries, filterQuery]);

  const trimmedQuery = filterQuery.trim();

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3.5 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
          <Users className="h-3.5 w-3.5" style={teamColor ? { color: teamColor } : undefined} />
          <span>Snabbval ur truppen</span>
        </div>
        <span className="text-[11px] font-semibold text-slate-500">
          {trimmedQuery
            ? `${filteredChips.length} av ${sortedEntries.length} matchar #${trimmedQuery}`
            : `${sortedEntries.length} spelare`}
        </span>
      </div>

      {sortedEntries.length === 0 ? (
        <p className="text-xs text-slate-500 py-1">
          Inga spelare inlagda i truppen ännu.
        </p>
      ) : filteredChips.length === 0 ? (
        <p className="text-xs text-amber-300/90 py-1">
          Ingen spelare i truppen matchar #{trimmedQuery}. Du kan ange namnet
          direkt ovanför så sparas det i truppen.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
          {filteredChips.map((chip) => (
            <button
              key={chip.number}
              type="button"
              onClick={() => onSelectPlayer(chip.number)}
              className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                chip.isExactMatch
                  ? 'border-emerald-400 bg-emerald-900/50 text-emerald-100 ring-1 ring-emerald-400/60'
                  : 'border-slate-700 bg-slate-800/90 text-slate-200 hover:border-blue-400 hover:bg-slate-800'
              }`}
            >
              <span className="font-mono font-black text-blue-300">
                #{chip.number}
              </span>
              <span className="truncate max-w-[160px]">{chip.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface InlinePlayerNameEditorProps {
  jerseyNumber: string;
  draftName: string;
  onDraftNameChange: (value: string) => void;
  onSaveName: (jerseyNumber: string, playerName: string) => void;
  existingName?: string;
  roleLabel?: string;
  compact?: boolean;
}

export function InlinePlayerNameEditor({
  jerseyNumber,
  draftName,
  onDraftNameChange,
  onSaveName,
  existingName,
  roleLabel,
  compact = false,
}: InlinePlayerNameEditorProps) {
  const [isEditingExisting, setIsEditingExisting] = useState(false);

  const normalized = normalizeJerseyNumber(jerseyNumber) || jerseyNumber.trim();
  if (!normalized) {
    return null;
  }

  const handleSave = () => {
    const trimmed = draftName.trim();
    if (!trimmed) {
      return;
    }
    onSaveName(normalized, trimmed);
    setIsEditingExisting(false);
  };

  if (existingName && !isEditingExisting) {
    if (compact) {
      return null;
    }
    return (
      <div className="mt-2 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => {
            onDraftNameChange(existingName);
            setIsEditingExisting(true);
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-400 hover:border-slate-500 hover:text-slate-200 cursor-pointer"
        >
          <Pencil className="h-3 w-3" />
          Ändra namn för #{normalized}
        </button>
      </div>
    );
  }

  return (
    <div
      className={`${
        compact
          ? 'rounded-xl border border-amber-500/30 bg-amber-950/20 p-3'
          : 'mt-3 mx-auto max-w-md rounded-xl border border-amber-500/30 bg-slate-900/90 p-3 text-left'
      }`}
    >
      <label className="block text-xs font-bold text-amber-200 mb-1.5">
        {roleLabel ? `${roleLabel}: ` : ''}Spelarnamn för #{normalized} (sparas i truppen)
      </label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={draftName}
          onChange={(e) => onDraftNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              handleSave();
              e.currentTarget.blur();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setIsEditingExisting(false);
              e.currentTarget.blur();
            }
          }}
          placeholder={`Spelarnamn för #${normalized} (sparas i truppen)`}
          aria-label={`Spelarnamn för #${normalized} (sparas i truppen)`}
          className="flex-1 min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium text-white placeholder:text-slate-500 focus:border-blue-400 focus:outline-none"
        />
        <button
          type="button"
          disabled={!draftName.trim()}
          onClick={handleSave}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-extrabold text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {existingName ? <Check className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
          Spara namn
        </button>
        {isEditingExisting && (
          <button
            type="button"
            onClick={() => setIsEditingExisting(false)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 cursor-pointer"
          >
            Avbryt
          </button>
        )}
      </div>
    </div>
  );
}

interface MissingPlayersScriptPanelProps {
  roster: Record<string, string>;
  players: Array<{ roleLabel: string; number: string }>;
  onSavePlayer: (jerseyNumber: string, playerName: string) => void;
}

export function MissingPlayersScriptPanel({
  roster,
  players,
  onSavePlayer,
}: MissingPlayersScriptPanelProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const missing = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ roleLabel: string; number: string; normalized: string }> = [];
    for (const item of players) {
      const norm = normalizeJerseyNumber(item.number) || item.number.trim();
      if (!norm || seen.has(norm)) {
        continue;
      }
      if (!lookupPlayerName(roster, norm)) {
        seen.add(norm);
        list.push({ roleLabel: item.roleLabel, number: item.number, normalized: norm });
      }
    }
    return list;
  }, [players, roster]);

  if (missing.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 space-y-2.5">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
        <UserPlus className="h-4 w-4" />
        <span>Komplettera saknade spelarnamn direkt i manus &amp; trupp</span>
      </div>
      <div className="space-y-2">
        {missing.map((item) => (
          <InlinePlayerNameEditor
            key={item.normalized}
            jerseyNumber={item.normalized}
            roleLabel={item.roleLabel}
            draftName={drafts[item.normalized] ?? ''}
            onDraftNameChange={(val) =>
              setDrafts((prev) => ({ ...prev, [item.normalized]: val }))
            }
            onSaveName={(num, name) => {
              onSavePlayer(num, name);
              setDrafts((prev) => {
                const next = { ...prev };
                delete next[item.normalized];
                return next;
              });
            }}
            compact
          />
        ))}
      </div>
    </div>
  );
}
