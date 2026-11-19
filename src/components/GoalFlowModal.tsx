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
  FastForward,
  Mic,
  Play,
  Volume2,
  X,
} from 'lucide-react';
import type { AppSettings, Team } from '../types/models.ts';
import {
  generateGoalScript,
  lookupPlayerName,
  normalizeJerseyNumber,
} from '../utils/domain.ts';
import type { ModalKeyboardHandle } from './PenaltyFlowModal.tsx';
import {
  InlinePlayerNameEditor,
  MissingPlayersScriptPanel,
  RosterQuickSelect,
} from './RosterQuickSelect.tsx';

interface GoalFlowModalProps {
  team: Team;
  settings: AppSettings;
  isMusicPlaying: boolean;
  onUpsertPlayer?: (playerNumber: string, playerName: string) => void;
  onStartHomeGoalMusic: () => void;
  onStartAwayRestartMusic: () => void;
  onToggleAwayGoalSilence: () => void;
  onDuckAudio: () => void;
  onRestoreAudio: () => void;
  onFadeOutAndClose: () => void;
  onKeepMusicAndClose: () => void;
  onCancelClose: () => void;
}

type GoalStep = 'scorer' | 'assist1' | 'assist2' | 'script';

export const GoalFlowModal = forwardRef<
  ModalKeyboardHandle,
  GoalFlowModalProps
>(function GoalFlowModal(
  {
    team,
    settings,
    isMusicPlaying,
    onUpsertPlayer,
    onStartHomeGoalMusic,
    onStartAwayRestartMusic,
    onToggleAwayGoalSilence,
    onDuckAudio,
    onRestoreAudio,
    onFadeOutAndClose,
    onKeepMusicAndClose,
    onCancelClose,
  },
  ref,
) {
  const [step, setStep] = useState<GoalStep>('scorer');
  const [currentInput, setCurrentInput] = useState('');
  const [scorerNumber, setScorerNumber] = useState('');
  const [assist1Number, setAssist1Number] = useState('');
  const [assist2Number, setAssist2Number] = useState('');
  const [inlinePlayerName, setInlinePlayerName] = useState('');
  const [localRosterOverrides, setLocalRosterOverrides] = useState<
    Record<string, string>
  >({});

  const effectiveRoster = useMemo(
    () => ({ ...team.roster, ...localRosterOverrides }),
    [team.roster, localRosterOverrides],
  );

  const initTriggeredRef = useRef(false);
  useEffect(() => {
    if (!initTriggeredRef.current) {
      initTriggeredRef.current = true;
      if (team.id === 'home') {
        onStartHomeGoalMusic();
      } else if (team.id === 'away' && !settings.awayGoalSilence) {
        onStartAwayRestartMusic();
      }
    }
  }, [
    team.id,
    settings.awayGoalSilence,
    onStartHomeGoalMusic,
    onStartAwayRestartMusic,
  ]);

  const shouldDuckOnScript =
    isMusicPlaying || team.id === 'home' || !settings.awayGoalSilence;

  const enterScriptStep = (shouldDuck: boolean) => {
    setStep('script');
    if (shouldDuck) {
      onDuckAudio();
    }
  };

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

  const commitPendingInlineName = (jerseyNumber: string) => {
    if (inlinePlayerName.trim() && jerseyNumber.trim()) {
      handleSavePlayerName(jerseyNumber, inlinePlayerName);
    }
  };

  const handleDigit = (digit: string) => {
    if (step === 'script') {
      return;
    }
    setInlinePlayerName('');
    setCurrentInput((prev) => (prev.length < 3 ? `${prev}${digit}` : prev));
  };

  const handleBackspace = () => {
    if (step === 'script') {
      return;
    }
    setInlinePlayerName('');
    setCurrentInput((prev) => prev.slice(0, -1));
  };

  const handleSelectPlayerChip = (jerseyNumber: string) => {
    setInlinePlayerName('');
    if (step === 'scorer') {
      setScorerNumber(jerseyNumber);
      setCurrentInput('');
      setStep('assist1');
      return;
    }
    if (step === 'assist1') {
      setAssist1Number(jerseyNumber);
      setCurrentInput('');
      setStep('assist2');
      return;
    }
    if (step === 'assist2') {
      setAssist2Number(jerseyNumber);
      setCurrentInput('');
      enterScriptStep(shouldDuckOnScript);
    }
  };

  const handleNext = () => {
    if (step === 'scorer') {
      if (!currentInput) {
        return;
      }
      commitPendingInlineName(currentInput);
      setScorerNumber(currentInput);
      setCurrentInput('');
      setInlinePlayerName('');
      setStep('assist1');
      return;
    }

    if (step === 'assist1') {
      if (!currentInput) {
        setInlinePlayerName('');
        enterScriptStep(shouldDuckOnScript);
        return;
      }
      commitPendingInlineName(currentInput);
      setAssist1Number(currentInput);
      setCurrentInput('');
      setInlinePlayerName('');
      setStep('assist2');
      return;
    }

    if (step === 'assist2') {
      if (currentInput) {
        commitPendingInlineName(currentInput);
        setAssist2Number(currentInput);
      }
      setCurrentInput('');
      setInlinePlayerName('');
      enterScriptStep(shouldDuckOnScript);
    }
  };

  const handleGoToScriptDirect = () => {
    if (step === 'scorer') {
      if (!currentInput) {
        return;
      }
      commitPendingInlineName(currentInput);
      setScorerNumber(currentInput);
      setCurrentInput('');
      setInlinePlayerName('');
      setAssist1Number('');
      setAssist2Number('');
      enterScriptStep(shouldDuckOnScript);
      return;
    }

    if (step === 'assist1') {
      if (currentInput) {
        commitPendingInlineName(currentInput);
        setAssist1Number(currentInput);
      } else {
        setAssist1Number('');
      }
      setAssist2Number('');
      setCurrentInput('');
      setInlinePlayerName('');
      enterScriptStep(shouldDuckOnScript);
      return;
    }

    if (step === 'assist2') {
      if (currentInput) {
        commitPendingInlineName(currentInput);
        setAssist2Number(currentInput);
      }
      setCurrentInput('');
      setInlinePlayerName('');
      enterScriptStep(shouldDuckOnScript);
    }
  };

  const handleSkipAssistToScript = () => {
    if (step === 'scorer') {
      if (!currentInput) {
        return;
      }
      commitPendingInlineName(currentInput);
      setScorerNumber(currentInput);
    }
    if (step === 'assist1') {
      setAssist1Number('');
    }
    if (step === 'assist2') {
      setAssist2Number('');
    }
    setCurrentInput('');
    setInlinePlayerName('');
    enterScriptStep(shouldDuckOnScript);
  };

  const keyboardHandlersRef = useRef({
    onDigit: handleDigit,
    onBackspace: handleBackspace,
    onEnter: handleNext,
    onEscape: onCancelClose,
  });
  keyboardHandlersRef.current = {
    onDigit: handleDigit,
    onBackspace: handleBackspace,
    onEnter: handleNext,
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

  const liveLookupName =
    currentInput.length > 0
      ? lookupPlayerName(effectiveRoster, currentInput)
      : undefined;

  const assists: Array<{ number: string; name?: string }> = [];
  if (assist1Number) {
    assists.push({
      number: assist1Number,
      name: lookupPlayerName(effectiveRoster, assist1Number),
    });
  }
  if (assist2Number) {
    assists.push({
      number: assist2Number,
      name: lookupPlayerName(effectiveRoster, assist2Number),
    });
  }

  const scriptText =
    step === 'script'
      ? generateGoalScript(settings, {
          teamName: team.name,
          scorerNumber,
          scorerName: lookupPlayerName(effectiveRoster, scorerNumber),
          assists,
          roster: effectiveRoster,
        })
      : '';

  const stepPrompt =
    step === 'scorer'
      ? 'Ange målskyttens tröjnummer'
      : step === 'assist1'
        ? 'Ange Assist 1 (eller hoppa direkt till manus)'
        : 'Ange Assist 2 (valfritt)';

  const scriptPlayers = [
    { roleLabel: 'Målskytt', number: scorerNumber },
    ...(assist1Number ? [{ roleLabel: 'Assist 1', number: assist1Number }] : []),
    ...(assist2Number ? [{ roleLabel: 'Assist 2', number: assist2Number }] : []),
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="goal-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto"
    >
      <div
        className="w-full max-w-4xl rounded-3xl border-2 bg-slate-900 shadow-2xl overflow-hidden my-auto"
        style={{ borderColor: team.color }}
      >
        {/* Header */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-white"
          style={{ backgroundColor: team.color }}
        >
          <div>
            <div className="text-xs font-extrabold uppercase tracking-widest opacity-90">
              Målflöde • {team.id === 'home' ? 'Hemmalag' : 'Bortalag'}
            </div>
            <h2 id="goal-modal-title" className="text-2xl font-black tracking-tight">
              MÅL – {team.name}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {team.id === 'away' && (
              <button
                type="button"
                onClick={onStartAwayRestartMusic}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-white/30 bg-black/30 px-4 py-2 text-sm font-extrabold text-white hover:bg-black/45 transition-colors cursor-pointer"
              >
                <Play className="h-4 w-4 fill-current" />
                STARTA OMSTART / PEPP-LÅT
              </button>
            )}

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
        </div>

        {/* Step Bar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-950/60 px-6 py-2.5 text-xs font-bold uppercase tracking-wider">
          <span className={step === 'scorer' ? 'text-blue-400' : 'text-slate-500'}>
            1. Målskytt {scorerNumber ? `(#${scorerNumber})` : ''}
          </span>
          <span className="text-slate-600">→</span>
          <span className={step === 'assist1' ? 'text-blue-400' : 'text-slate-500'}>
            2. Assist 1 {assist1Number ? `(#${assist1Number})` : ''}
          </span>
          <span className="text-slate-600">→</span>
          <span className={step === 'assist2' ? 'text-blue-400' : 'text-slate-500'}>
            3. Assist 2 {assist2Number ? `(#${assist2Number})` : ''}
          </span>
          <span className="text-slate-600">→</span>
          <span className={step === 'script' ? 'text-emerald-400' : 'text-slate-500'}>
            4. Talmanus
          </span>
        </div>

        <div className="p-6">
          {step !== 'script' ? (
            <div className="space-y-5">
              {team.id === 'away' && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-500/30 bg-orange-950/30 px-4 py-2.5 text-xs font-medium text-orange-200">
                  <div>
                    {settings.awayGoalSilence ? (
                      <>
                        Sportslig tystnad vid bortamål. Använd knappen{' '}
                        <strong>STARTA OMSTART / PEPP-LÅT</strong> ovan inför
                        tekning vid behov.
                      </>
                    ) : (
                      <>
                        Automatisk musik vid bortamål är aktiverad — låt från
                        omstartslistan startar direkt.
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={onToggleAwayGoalSilence}
                    className="shrink-0 rounded-lg border border-orange-400/40 bg-orange-900/40 px-3 py-1.5 text-xs font-bold text-orange-100 hover:bg-orange-800/60 transition-colors cursor-pointer"
                  >
                    {settings.awayGoalSilence
                      ? 'Byt till automatisk musik'
                      : 'Byt till sportslig tystnad'}
                  </button>
                </div>
              )}

              {/* Live Display + Inline Name Entry */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 text-center">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {stepPrompt}
                </div>
                <div className="mt-2 font-mono text-5xl font-black tracking-wider text-white min-h-[56px]">
                  {currentInput ? `#${currentInput}` : '# —'}
                </div>
                <div className="mt-2 min-h-[28px] text-lg font-bold">
                  {currentInput.length === 0 ? (
                    <span className="text-slate-500">
                      Slå tröjnummer eller välj spelare ur truppen nedan
                    </span>
                  ) : liveLookupName ? (
                    <span className="text-emerald-400">
                      #{currentInput} – {liveLookupName}
                    </span>
                  ) : (
                    <span className="text-amber-300">
                      Nummer ej i trupp – ange namn nedan eller fortsätt ändå
                    </span>
                  )}
                </div>

                {currentInput.length > 0 && (
                  <InlinePlayerNameEditor
                    key={normalizeJerseyNumber(currentInput) || currentInput}
                    jerseyNumber={currentInput}
                    existingName={liveLookupName}
                    draftName={inlinePlayerName}
                    onDraftNameChange={setInlinePlayerName}
                    onSaveName={handleSavePlayerName}
                  />
                )}
              </div>

              {/* Numpad + Quick Roster Chips */}
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
                    disabled={step === 'scorer' && currentInput.length === 0}
                    onClick={handleNext}
                    className="min-w-[80px] min-h-[76px] rounded-2xl border border-blue-400/50 bg-blue-600 text-lg font-black text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all cursor-pointer"
                  >
                    {step === 'assist2' ? 'Manus →' : 'Nästa →'}
                  </button>
                </div>

                <RosterQuickSelect
                  roster={effectiveRoster}
                  filterQuery={currentInput}
                  onSelectPlayer={handleSelectPlayerChip}
                  teamColor={team.color}
                />
              </div>

              {/* Fast Shortcuts */}
              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                {step === 'scorer' && (
                  <button
                    type="button"
                    disabled={currentInput.length === 0}
                    onClick={handleSkipAssistToScript}
                    className="inline-flex min-h-[60px] items-center gap-2 rounded-2xl border-2 border-emerald-500/50 bg-emerald-950/40 px-6 py-3 text-base font-extrabold text-emerald-200 hover:bg-emerald-900/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    <FastForward className="h-5 w-5" />
                    INGEN ASSIST / GÅ TILL MANUS
                  </button>
                )}

                {step === 'assist1' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setInlinePlayerName('');
                        setCurrentInput(scorerNumber);
                        setStep('scorer');
                      }}
                      className="inline-flex min-h-[60px] items-center gap-2 rounded-2xl border border-slate-700 bg-slate-800 px-5 py-3 text-sm font-bold text-slate-300 hover:bg-slate-700 cursor-pointer"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Ändra målskytt
                    </button>
                    {currentInput.length > 0 && (
                      <button
                        type="button"
                        onClick={handleGoToScriptDirect}
                        className="inline-flex min-h-[60px] items-center gap-2 rounded-2xl border-2 border-blue-500/50 bg-blue-950/50 px-6 py-3 text-base font-extrabold text-blue-200 hover:bg-blue-900/60 cursor-pointer"
                      >
                        <FastForward className="h-5 w-5" />
                        KLAR / GÅ TILL MANUS (1 assist)
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSkipAssistToScript}
                      className="inline-flex min-h-[60px] items-center gap-2 rounded-2xl border-2 border-emerald-500/50 bg-emerald-950/40 px-6 py-3 text-base font-extrabold text-emerald-200 hover:bg-emerald-900/50 cursor-pointer"
                    >
                      <FastForward className="h-5 w-5" />
                      INGEN ASSIST / GÅ TILL MANUS
                    </button>
                  </>
                )}

                {step === 'assist2' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setInlinePlayerName('');
                        setCurrentInput(assist1Number);
                        setStep('assist1');
                      }}
                      className="inline-flex min-h-[60px] items-center gap-2 rounded-2xl border border-slate-700 bg-slate-800 px-5 py-3 text-sm font-bold text-slate-300 hover:bg-slate-700 cursor-pointer"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Ändra Assist 1
                    </button>
                    <button
                      type="button"
                      onClick={handleGoToScriptDirect}
                      className="inline-flex min-h-[60px] items-center gap-2 rounded-2xl border-2 border-emerald-500/50 bg-emerald-950/40 px-6 py-3 text-base font-extrabold text-emerald-200 hover:bg-emerald-900/50 cursor-pointer"
                    >
                      <FastForward className="h-5 w-5" />
                      KLAR / GÅ TILL MANUS
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            /* STEP 2: TELEPROMPTER SCRIPT */
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setInlinePlayerName('');
                    setCurrentInput(scorerNumber);
                    setStep('scorer');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-sm font-bold text-slate-200 hover:bg-slate-700 cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Ändra målskytt / assist
                </button>

                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-950/50 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-emerald-300">
                  Målmanus redo för uppläsning
                </span>
              </div>

              <div className="rounded-3xl border-2 border-slate-700 bg-slate-950 p-8 sm:p-10 shadow-inner">
                <p className="text-3xl sm:text-4xl font-black leading-snug tracking-tight text-white">
                  &ldquo;{scriptText}&rdquo;
                </p>
              </div>

              <MissingPlayersScriptPanel
                roster={effectiveRoster}
                players={scriptPlayers}
                onSavePlayer={handleSavePlayerName}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <button
                  type="button"
                  onClick={onDuckAudio}
                  className="inline-flex min-h-[72px] items-center justify-center gap-2 rounded-2xl border border-amber-400/50 bg-amber-500/20 px-4 py-3 text-base font-extrabold text-amber-200 hover:bg-amber-500/35 transition-colors cursor-pointer"
                >
                  <Mic className="h-5 w-5" />
                  DUCKA &amp; PRATA
                </button>

                <button
                  type="button"
                  onClick={onRestoreAudio}
                  className="inline-flex min-h-[72px] items-center justify-center gap-2 rounded-2xl border border-slate-600 bg-slate-800 px-4 py-3 text-base font-extrabold text-slate-100 hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  <Volume2 className="h-5 w-5" />
                  HÖJ MUSIKEN
                </button>

                <button
                  type="button"
                  onClick={onFadeOutAndClose}
                  className="inline-flex min-h-[72px] items-center justify-center rounded-2xl border border-blue-400/50 bg-blue-600 px-4 py-3 text-base font-black text-white shadow-lg shadow-blue-600/25 hover:bg-blue-500 transition-colors cursor-pointer"
                >
                  KLAR / FADE OUT
                </button>

                <button
                  type="button"
                  onClick={onKeepMusicAndClose}
                  className="inline-flex min-h-[72px] items-center justify-center rounded-2xl border border-emerald-400/50 bg-emerald-700 px-4 py-3 text-base font-black text-white hover:bg-emerald-600 transition-colors cursor-pointer"
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
