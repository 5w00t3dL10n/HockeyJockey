import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowLeft,
  Delete,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import {
  DEFAULT_PENALTY_DURATION,
  PENALTY_DEFINITIONS,
  PENALTY_DURATIONS,
} from '../data/penalties.ts';
import type {
  AppSettings,
  PenaltyDefinition,
  Team,
} from '../types/models.ts';
import {
  generatePenaltyScript,
  lookupPlayerName,
  normalizeJerseyNumber,
} from '../utils/domain.ts';
import { RefereeIcon } from './RefereeIcons.tsx';
import {
  InlinePlayerNameEditor,
  MissingPlayersScriptPanel,
  RosterQuickSelect,
} from './RosterQuickSelect.tsx';

export interface ModalKeyboardHandle {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onEnter: () => void;
  onEscape: () => void;
}

interface PenaltyFlowModalProps {
  team: Team;
  settings: AppSettings;
  onUpsertPlayer?: (playerNumber: string, playerName: string) => void;
  onStartPenaltyMusic: (teamId: 'home' | 'away') => void;
  onDuckAudio: () => void;
  onRestoreAudio: () => void;
  onFadeOutAndClose: () => void;
  onKeepMusicAndClose: () => void;
  onCancelClose: () => void;
}

type PenaltyStep = 'player' | 'penalty' | 'script';

export const PenaltyFlowModal = forwardRef<
  ModalKeyboardHandle,
  PenaltyFlowModalProps
>(function PenaltyFlowModal(
  {
    team,
    settings,
    onUpsertPlayer,
    onStartPenaltyMusic,
    onDuckAudio,
    onRestoreAudio,
    onFadeOutAndClose,
    onKeepMusicAndClose,
    onCancelClose,
  },
  ref,
) {
  const [step, setStep] = useState<PenaltyStep>('player');
  const [playerNumber, setPlayerNumber] = useState('');
  const [inlinePlayerName, setInlinePlayerName] = useState('');
  const [localRosterOverrides, setLocalRosterOverrides] = useState<
    Record<string, string>
  >({});
  const [isTeamPenalty, setIsTeamPenalty] = useState(false);
  const [duration, setDuration] = useState<string>(DEFAULT_PENALTY_DURATION);
  const [selectedPenalty, setSelectedPenalty] =
    useState<PenaltyDefinition | null>(null);

  const effectiveRoster = useMemo(
    () => ({ ...team.roster, ...localRosterOverrides }),
    [team.roster, localRosterOverrides],
  );

  const startedMusicRef = useRef(false);
  useEffect(() => {
    if (!startedMusicRef.current) {
      startedMusicRef.current = true;
      onStartPenaltyMusic(team.id);
    }
  }, [onStartPenaltyMusic, team.id]);

  const matchedPlayerName =
    playerNumber.length > 0
      ? lookupPlayerName(effectiveRoster, playerNumber)
      : undefined;

  const handleSavePlayerName = (rawNumber: string, rawName: string) => {
    const normalizedNum =
      normalizeJerseyNumber(rawNumber) || rawNumber.trim();
    const trimmedName = rawName.trim();
    if (!normalizedNum || !trimmedName) {
      return;
    }
    setLocalRosterOverrides((prev) => ({
      ...prev,
      [normalizedNum]: trimmedName,
    }));
    onUpsertPlayer?.(normalizedNum, trimmedName);
    setInlinePlayerName('');
  };

  const handleDigit = (digit: string) => {
    if (step !== 'player') {
      return;
    }
    setIsTeamPenalty(false);
    setInlinePlayerName('');
    setPlayerNumber((prev) => (prev.length < 3 ? `${prev}${digit}` : prev));
  };

  const handleBackspace = () => {
    if (step !== 'player') {
      return;
    }
    setInlinePlayerName('');
    setPlayerNumber((prev) => prev.slice(0, -1));
  };

  const handleSelectPlayerChip = (jerseyNumber: string) => {
    setInlinePlayerName('');
    setPlayerNumber(jerseyNumber);
    setIsTeamPenalty(false);
    setStep('penalty');
  };

  const handleNextFromPlayer = () => {
    if (step !== 'player') {
      return;
    }
    if (playerNumber.length === 0) {
      return;
    }
    if (inlinePlayerName.trim()) {
      handleSavePlayerName(playerNumber, inlinePlayerName);
    }
    setIsTeamPenalty(false);
    setStep('penalty');
  };

  const handleSelectTeamPenalty = () => {
    setIsTeamPenalty(true);
    setPlayerNumber('');
    setInlinePlayerName('');
    setStep('penalty');
  };

  const handleSelectPenalty = (penalty: PenaltyDefinition) => {
    setSelectedPenalty(penalty);
    setStep('script');
    onDuckAudio();
  };

  const keyboardHandlersRef = useRef({
    onDigit: handleDigit,
    onBackspace: handleBackspace,
    onEnter: handleNextFromPlayer,
    onEscape: onCancelClose,
  });
  keyboardHandlersRef.current = {
    onDigit: handleDigit,
    onBackspace: handleBackspace,
    onEnter: handleNextFromPlayer,
    onEscape: onCancelClose,
  };

  useImperativeHandle(
    ref,
    () => ({
      onDigit: (digit: string) => keyboardHandlersRef.current.onDigit(digit),
      onBackspace: () => keyboardHandlersRef.current.onBackspace(),
      onEnter: () => keyboardHandlersRef.current.onEnter(),
      onEscape: () => keyboardHandlersRef.current.onEscape(),
    }),
    [],
  );

  const scriptText = selectedPenalty
    ? generatePenaltyScript(settings, {
        teamName: team.name,
        penaltyLabel: selectedPenalty.labelSv,
        duration,
        playerNumber,
        playerName: matchedPlayerName,
        isTeamPenalty,
        roster: effectiveRoster,
      })
    : '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="penalty-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto"
    >
      <div
        className="w-full max-w-4xl rounded-3xl border-2 bg-slate-900 shadow-2xl overflow-hidden my-auto"
        style={{ borderColor: team.color }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-4 px-6 py-4 text-white"
          style={{ backgroundColor: team.color }}
        >
          <div>
            <div className="text-xs font-extrabold uppercase tracking-widest opacity-90">
              Utvisningsflöde • {team.id === 'home' ? 'Hemmalag (Boxplay)' : 'Bortalag (Powerplay)'}
            </div>
            <h2 id="penalty-modal-title" className="text-2xl font-black tracking-tight">
              {team.name}
            </h2>
          </div>

          <button
            type="button"
            onClick={onCancelClose}
            className="inline-flex min-h-[48px] items-center gap-1.5 rounded-xl bg-black/25 px-3.5 py-2 text-sm font-bold text-white hover:bg-black/40 transition-colors cursor-pointer"
            title="Stäng utan att stoppa musiken (Esc)"
          >
            <X className="h-5 w-5" />
            <span className="hidden sm:inline">Avbryt (Esc)</span>
          </button>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-950/60 px-6 py-2.5 text-xs font-bold uppercase tracking-wider">
          <span
            className={
              step === 'player' ? 'text-blue-400' : 'text-slate-500'
            }
          >
            1. Spelarnummer
          </span>
          <span className="text-slate-600">→</span>
          <span
            className={
              step === 'penalty' ? 'text-blue-400' : 'text-slate-500'
            }
          >
            2. Domartecken &amp; Tid
          </span>
          <span className="text-slate-600">→</span>
          <span
            className={
              step === 'script' ? 'text-emerald-400' : 'text-slate-500'
            }
          >
            3. Talmanus
          </span>
        </div>

        <div className="p-6">
          {/* STEP 1: PLAYER NUMPAD */}
          {step === 'player' && (
            <div className="space-y-5">
              {/* Live Roster Display + Inline Name Entry */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 text-center">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Ange utvisad spelares tröjnummer
                </div>
                <div className="mt-2 font-mono text-5xl font-black tracking-wider text-white min-h-[56px]">
                  {playerNumber ? `#${playerNumber}` : '# —'}
                </div>
                <div className="mt-2 min-h-[28px] text-lg font-bold">
                  {playerNumber.length === 0 ? (
                    <span className="text-slate-500">
                      Slå siffror på numpad/tangentbord eller välj spelare ur truppen nedan
                    </span>
                  ) : matchedPlayerName ? (
                    <span className="text-emerald-400">
                      #{playerNumber} – {matchedPlayerName}
                    </span>
                  ) : (
                    <span className="text-amber-300">
                      Nummer ej i trupp – ange namn nedan eller fortsätt ändå
                    </span>
                  )}
                </div>

                {playerNumber.length > 0 && (
                  <InlinePlayerNameEditor
                    key={normalizeJerseyNumber(playerNumber) || playerNumber}
                    jerseyNumber={playerNumber}
                    existingName={matchedPlayerName}
                    draftName={inlinePlayerName}
                    onDraftNameChange={setInlinePlayerName}
                    onSaveName={handleSavePlayerName}
                  />
                )}
              </div>

              {/* Touch Numpad + Quick Roster Chips */}
              <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-5 items-start">
                <div className="grid grid-cols-3 gap-3 max-w-md mx-auto w-full md:w-[276px]">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <button
                      key={digit}
                      type="button"
                      onClick={() => handleDigit(digit)}
                      className="min-w-[80px] min-h-[76px] rounded-2xl border border-slate-700 bg-slate-800 text-3xl font-black text-white hover:bg-slate-700 active:scale-95 transition-all cursor-pointer"
                    >
                      {digit}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleBackspace}
                    className="min-w-[80px] min-h-[76px] flex flex-col items-center justify-center gap-1 rounded-2xl border border-slate-700 bg-slate-800/80 text-sm font-bold text-amber-300 hover:bg-slate-700 active:scale-95 transition-all cursor-pointer"
                  >
                    <Delete className="h-6 w-6" />
                    <span>Sudda</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDigit('0')}
                    className="min-w-[80px] min-h-[76px] rounded-2xl border border-slate-700 bg-slate-800 text-3xl font-black text-white hover:bg-slate-700 active:scale-95 transition-all cursor-pointer"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    disabled={playerNumber.length === 0}
                    onClick={handleNextFromPlayer}
                    className="min-w-[80px] min-h-[76px] rounded-2xl border border-blue-400/50 bg-blue-600 text-lg font-black text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all cursor-pointer"
                  >
                    Nästa →
                  </button>
                </div>

                <RosterQuickSelect
                  roster={effectiveRoster}
                  filterQuery={playerNumber}
                  onSelectPlayer={handleSelectPlayerChip}
                  teamColor={team.color}
                />
              </div>

              {/* Team Penalty Shortcut */}
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={handleSelectTeamPenalty}
                  className="inline-flex min-h-[64px] items-center justify-center gap-2.5 rounded-2xl border-2 border-amber-500/50 bg-amber-950/40 px-8 py-3 text-lg font-extrabold text-amber-200 hover:bg-amber-900/50 transition-colors cursor-pointer"
                >
                  <Users className="h-6 w-6" />
                  Lagstraff (skippa spelarnummer)
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: REFEREE SIGNALS & DURATION */}
          {step === 'penalty' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setInlinePlayerName('');
                    setStep('player');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-sm font-bold text-slate-200 hover:bg-slate-700 cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Ändra spelare
                </button>
                <div className="text-sm font-bold text-slate-300">
                  {isTeamPenalty
                    ? `Lagstraff för ${team.name}`
                    : `#${playerNumber}${matchedPlayerName ? ` – ${matchedPlayerName}` : ''}`}
                </div>
              </div>

              {/* Duration Quick Select */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Utvisningstid
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {PENALTY_DURATIONS.map((dur) => (
                    <button
                      key={dur}
                      type="button"
                      onClick={() => setDuration(dur)}
                      className={`min-h-[56px] rounded-xl border-2 px-4 py-2 text-base font-extrabold transition-all cursor-pointer ${
                        duration === dur
                          ? 'border-blue-400 bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                          : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {dur}
                    </button>
                  ))}
                </div>
              </div>

              {/* 13 Referee Signals Grid */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Välj domartecken / förseelse (klick går direkt till talmanus)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {PENALTY_DEFINITIONS.map((penalty) => (
                    <button
                      key={penalty.id}
                      type="button"
                      onClick={() => handleSelectPenalty(penalty)}
                      className="flex min-w-[80px] min-h-[104px] flex-col items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-800/90 p-3 text-center hover:border-blue-400 hover:bg-slate-800 active:scale-[0.98] transition-all cursor-pointer"
                    >
                      <RefereeIcon
                        iconKey={penalty.iconKey}
                        className="h-10 w-10 text-amber-400"
                      />
                      <div>
                        <div className="text-sm font-extrabold text-white leading-tight">
                          {penalty.labelSv}
                        </div>
                        {penalty.labelEn !== penalty.labelSv && (
                          <div className="text-[11px] font-medium text-slate-400">
                            {penalty.labelEn}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: TELEPROMPTER SCRIPT */}
          {step === 'script' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep('penalty')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-sm font-bold text-slate-200 hover:bg-slate-700 cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Byt förseelse / tid
                </button>

                <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-950/50 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-amber-300">
                  Musiken duckad automatiskt för talstöd
                </span>
              </div>

              <div className="rounded-3xl border-2 border-slate-700 bg-slate-950 p-8 sm:p-10 shadow-inner">
                <p className="text-3xl sm:text-4xl font-black leading-snug tracking-tight text-white">
                  &ldquo;{scriptText}&rdquo;
                </p>
              </div>

              {!isTeamPenalty && playerNumber && (
                <MissingPlayersScriptPanel
                  roster={effectiveRoster}
                  players={[
                    { roleLabel: 'Utvisad spelare', number: playerNumber },
                  ]}
                  onSavePlayer={handleSavePlayerName}
                />
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <button
                  type="button"
                  onClick={onRestoreAudio}
                  className="inline-flex min-h-[72px] items-center justify-center gap-2 rounded-2xl border border-amber-400/50 bg-amber-600/20 px-5 py-3 text-base font-extrabold text-amber-200 hover:bg-amber-600/35 transition-colors cursor-pointer"
                >
                  <Volume2 className="h-5 w-5" />
                  HÖJ MUSIKEN
                </button>

                <button
                  type="button"
                  onClick={onFadeOutAndClose}
                  className="inline-flex min-h-[72px] items-center justify-center rounded-2xl border border-blue-400/50 bg-blue-600 px-5 py-3 text-base font-black text-white shadow-lg shadow-blue-600/25 hover:bg-blue-500 transition-colors cursor-pointer"
                >
                  KLAR / FADE OUT
                </button>

                <button
                  type="button"
                  onClick={onKeepMusicAndClose}
                  className="inline-flex min-h-[72px] items-center justify-center rounded-2xl border border-emerald-400/50 bg-emerald-700 px-5 py-3 text-base font-black text-white hover:bg-emerald-600 transition-colors cursor-pointer"
                >
                  KLAR / BEHÅLL MUSIK
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
