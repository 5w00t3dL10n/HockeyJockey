# Init Blueprint: 24_arena_speaker_dsp_and_prosody
**Target Project:** HockeyJockey (`/home/ma-auto/DEV/HockeyJockey`)
**Author:** Lead Architect (UEF-V2)
**Ansvarig Executor:** `Agent-Logic` (`Claude Sonnet 5.5 (Medium)`)
**Status:** LOCKED / SACRED TRUTH (READ-ONLY för utvecklings- och testagenter)

---

## 1. Systemöversikt & Arkitektur (4 Pelare ovanpå Piper TTS)
Detta uppdrag transformerar HockeyJockeys offline Piper-tal från torr syntes till en realistisk, varm och distinkt **arenaspeaker i en ishall** utan extra API-kostnad eller molnberoenden:
1. **Web Audio "Arena PA & Broadcast"-DSP-kedja (`BrowserTtsAudioPlayer` + `computeTtsDspChainConfig`):**
   - Realtidsfiltrering i webbläsarens `AudioContext`: Högpass (`115 Hz`), bröstvärme-EQ (`210 Hz`), mikrofonnärvaro (`3 200 Hz`), AI-De-Harsher lågpass (`7 400 Hz` för att ta bort övre syntetiska fras-artefakter), Broadcast `DynamicsCompressorNode` + makeup gain, samt parallellt Arena PA slapback-eko (`85 ms`) + algoritmisk hallklang (`ConvolverNode`).
   - Tre valbara ljudprofiler (`TtsAudioProfile`): `'studio'` (bypass/ren), `'booth'` (radiospeaker/båset utan rumsklang) och `'arena_pa'` (ishall-PA, standard).
   - Valbar 2-tons PA-attention chime (`ttsPreChimeEnabled`, `D5 587.33 Hz -> A5 880 Hz`, `~260 ms`) före utropet.
   - **Calm Tech Fallback:** Om Web Audio `AudioContext`/`decodeAudioData` saknas faller `BrowserTtsAudioPlayer` sömlöst tillbaka till befintlig `HTMLAudioElement`-uppspelning.
2. **Pipers neurala VITS-prosodiparametrar (`calculatePiperProsodyParams` + `vite.config.ts`):**
   - Stöd för `--sentence_silence`, `--noise_scale` och `--noise_w` utöver `--length_scale`.
3. **Svensk Arena-Dramaturgi (`formatTextForArenaProsody`):**
   - Bearbetar texten precis före syntes (utan att ändra den synliga telepromptertexten i modalen): expanderar `#12` / `nr 12` till `nummer 12`, `2 min` till `2 minuter`, och lägger in dramatiska meningspauser före tröjnummer, spelarnamn, assist och utvisningsorsak när `ttsDramaticPauses` är aktivt.
4. **Tredje svensk röstmodell (`sv_SE-alma-medium`):**
   - Registreras i `PIPER_VOICE_IDS`, `PIPER_VOICE_CATALOG`, `vite.config.ts` och `SetupView.tsx`.

---

## 2. Tech Stack Audit & Tool-First Beslut
- **Nivå 2 / Backend:** Vite middleware utökar `/api/tts` med VITS-parametrar och tredje modellen `sv_SE-alma-medium`.
- **Nivå 3 (Custom Code motivering):** Realtids-Web Audio-kedja (`DynamicsCompressorNode`, `BiquadFilterNode`, `DelayNode`, `ConvolverNode`), ren svensk arena-dramaturgiformatering och parameterklampning i TypeScript kan inte ersättas med OS-nativa CLI-kommandon.
- **Triage-routing:** `Agent-Logic` (`Claude Sonnet 5.5 (Medium)`). Strikt isolerad från `tests/`.

---

## 3. Detaljerade Gränssnitts- och Datakontrakt

### 3.1 `src/types/models.ts` & `src/data/defaults.ts`
- Utöka `PiperVoiceId`:
  - `'sv_SE-nst-medium' | 'sv_SE-lisa-medium' | 'sv_SE-alma-medium'`
- Lägg till typer:
  - `export type TtsAudioProfile = 'studio' | 'booth' | 'arena_pa';`
  - `export interface TtsDspChainConfig` med fälten:
    `profile: TtsAudioProfile`, `bypass: boolean`, `highpassHz: number`, `chestPeakHz: number`, `chestGainDb: number`, `chestQ: number`, `presencePeakHz: number`, `presenceGainDb: number`, `presenceQ: number`, `deHarshLowpassHz: number`, `deHarshQ: number`, `compressor: { thresholdDb: number; kneeDb: number; ratio: number; attackSec: number; releaseSec: number; makeupGain: number }`, `slapbackDelaySec: number`, `slapbackFeedback: number`, `reverbDurationSec: number`, `reverbDecay: number`, `wetMix: number`, `dryMix: number`.
- Utöka `AppSettings` och `MatchProfile['settings']` med följande **6 fält** (plus uppdatering av `DEFAULT_SETTINGS` och samtliga poster i `DEFAULT_MATCH_PROFILES`):
  - `ttsAudioProfile: TtsAudioProfile` (default: `'arena_pa'`)
  - `ttsDramaticPauses: boolean` (default: `true`)
  - `ttsSentenceSilenceSec: number` (default: `0.65`, klampas `[0.1, 1.5]`)
  - `ttsExpressiveness: number` (default: `0.75`, klampas `[0.3, 1.2]`)
  - `ttsArenaReverbMix: number` (default: `0.28`, klampas `[0.0, 0.8]`)
  - `ttsPreChimeEnabled: boolean` (default: `false`)

### 3.2 `src/utils/domain.ts` (100 % ren – Noll DOM/window/AudioContext)
1. Uppdatera `PIPER_VOICE_IDS = ['sv_SE-nst-medium', 'sv_SE-lisa-medium', 'sv_SE-alma-medium'] as const`.
2. Exportera `TTS_AUDIO_PROFILES = ['studio', 'booth', 'arena_pa'] as const` och `isValidTtsAudioProfile(value: unknown): value is TtsAudioProfile`.
3. Exportera `calculatePiperProsodyParams(options?: { rate?: number; sentenceSilenceSec?: number; expressiveness?: number }): { lengthScale: number; sentenceSilence: number; noiseScale: number; noiseW: number }`:
   - `lengthScale = calculatePiperLengthScale(options?.rate ?? 1.0)`
   - `sentenceSilence = Number(clampNumber(toNumericInput(options?.sentenceSilenceSec), 0.1, 1.5, 0.65).toFixed(3))`
   - `noiseScale = Number(clampNumber(toNumericInput(options?.expressiveness), 0.3, 1.2, 0.75).toFixed(3))`
   - `noiseW = Number(clampNumber(0.8 + (noiseScale - 0.667) * 0.4, 0.5, 1.1, 0.833).toFixed(3))`
4. Exportera `formatTextForArenaProsody(text: string, dramaticPauses = true): string`:
   - Tom/icke-sträng -> `''`.
   - Normaliserar blanksteg och expanderar hockeynotation:
     - `#\s*(\d+)` -> `'nummer $1'`
     - `\bnr\.?\s*(\d+)\b/gi` -> `'nummer $1'`
     - `\b(\d+)\s*min\.?(?=$|[\s,.;:!?)])/gi` -> `'$1 minuter'`
   - När `dramaticPauses === true`:
     - Komma direkt efter `"nummer <siffror>,"` (t.ex. `"nummer 12, Emil Lindblom"`) blir pauspunkt `". "` (`"nummer 12. Emil Lindblom"`).
     - Inför tydligt frasslut / paus runt `"Målskytt"`, `"Framspelad av"`, `"Assisterad av"`, samt paus före `"<siffror> minuter för"` så Piper lägger konstpaus.
     - Fäller ihop dubbla/upprepade skiljetecken (`..`, `!.`, `, .`) snyggt och trimmar.
5. Exportera `computeTtsDspChainConfig(profile: TtsAudioProfile, arenaReverbMix = 0.28): TtsDspChainConfig`:
   - Validerar `profile` (fallback `'arena_pa'`), klampad `arenaReverbMix` i `[0.0, 0.8]` (fallback `0.28`).
   - `'studio'`: `bypass: true`, `wetMix: 0`, `slapbackDelaySec: 0`, `reverbDurationSec: 0`, `dryMix: 1.0`.
   - `'booth'`: `bypass: false`, `highpassHz: 115`, `chestPeakHz: 210`, `chestGainDb: 3.0`, `chestQ: 1.1`, `presencePeakHz: 3200`, `presenceGainDb: 3.2`, `presenceQ: 1.2`, `deHarshLowpassHz: 7400`, `deHarshQ: 0.707`, `compressor: { thresholdDb: -22, kneeDb: 10, ratio: 4.5, attackSec: 0.004, releaseSec: 0.16, makeupGain: 1.22 }`, `slapbackDelaySec: 0`, `slapbackFeedback: 0`, `reverbDurationSec: 0`, `reverbDecay: 2.4`, `wetMix: 0`, `dryMix: 1.0`.
   - `'arena_pa'`: samma bas-EQ/De-Harsher/kompressor som `'booth'` fast `chestGainDb: 2.5`, `presenceGainDb: 3.8`, `slapbackDelaySec: 0.085`, `slapbackFeedback: 0.18`, `reverbDurationSec: 1.35`, `reverbDecay: 2.4`, `wetMix: Number(clampedMix.toFixed(3))`, `dryMix: 1.0`.
6. Uppdatera `sanitizeSettings`, `sanitizeMatchProfile` och `sanitizeMatchConfig` med full bakåtkompatibilitet och klampning för alla 6 nya fält.

### 3.3 `vite.config.ts`
- Lägg till `'sv_SE-alma-medium'` (`label: 'Alma – Svensk Speakerröst (Kvinna/Mjuk)'`, `onnxFilename: 'sv_SE-alma-medium.onnx'`, `configFilename: 'sv_SE-alma-medium.onnx.json'`) i `PIPER_VOICE_CATALOG`.
- Uppdatera `/api/tts` (`GET` & `POST`) så den läser valfria `sentenceSilence`, `noiseScale`, `noiseW` (eller `expressiveness`), validerar med `calculatePiperProsodyParams` och skickar `--length_scale`, `--noise_scale`, `--noise_w`, `--sentence_silence` till Piper CLI.
- Inkludera `sentenceSilence`, `noiseScale`, `noiseW` i LRU `cacheKey`.

### 3.4 `src/services/ttsService.ts`
- Utöka `TtsAudioPlayer.playWav` options med valfria `audioProfile?: TtsAudioProfile`, `arenaReverbMix?: number`, `preChimeEnabled?: boolean`.
- Uppgradera `BrowserTtsAudioPlayer`:
  - Generera valfri 2-tons PA-attention chime (`D5 587.33 Hz` -> `A5 880 Hz`, `~260 ms`) vid `preChimeEnabled === true` före röstuppspelningen.
  - När `dspConfig.bypass === false`: kör dekodad WAV-buffer genom Highpass -> Chest Peak EQ -> Presence Peak EQ -> De-Harsher Lowpass -> `DynamicsCompressorNode` -> Makeup Gain samt parallell Slapback `DelayNode` + Hall `ConvolverNode` när `wetMix > 0`.
  - Avbryt/koppla från aktiva Web Audio-noder rent vid `stop()` eller `AbortSignal`.
  - Falla tillbaka till `HTMLAudioElement` om `AudioContext`/`decodeAudioData` saknas eller kastar fel.
- Uppdatera `TtsService.speak(text, settings, audioCtrl)`:
  - Formatera `spokenText = formatTextForArenaProsody(trimmed, settings.ttsDramaticPauses ?? true)`.
  - Beräkna `prosody = calculatePiperProsodyParams({ rate: settings.ttsRate, sentenceSilenceSec: settings.ttsSentenceSilenceSec, expressiveness: settings.ttsExpressiveness })`.
  - Skicka `{ text: spokenText, voiceId, rate, sentenceSilence: prosody.sentenceSilence, noiseScale: prosody.noiseScale, noiseW: prosody.noiseW }` till `/api/tts` och använd `spokenText` i Web Speech fallback.
  - Skicka `{ volume, signal, audioProfile: settings.ttsAudioProfile, arenaReverbMix: settings.ttsArenaReverbMix, preChimeEnabled: settings.ttsPreChimeEnabled }` till `this.audioPlayer.playWav(...)`.
  - Bevara exakt `duckVolume -> speak -> restoreVolume`-ordning och sekvensskydd mot `stop()`.

### 3.5 Store & React UI (`useAppStore.ts`, `SetupView.tsx`, `GoalFlowModal.tsx`, `PenaltyFlowModal.tsx`)
- `useAppStore.ts`: inkludera alla 6 nya `tts*`-fält i `updateSettings`, `saveCurrentAsMatchProfile` och `activateMatchProfile`.
- `SetupView.tsx`: utöka `TtsSettingsSection` med:
  - Röstkort för alla 3 röster (`NST`, `Lisa`, `Alma`) inklusive statusbadge.
  - Ljudkaraktär / Arena-PA presetväljare (`Ishall PA`, `Radiospeaker / Båset`, `Ren / Studio`).
  - Reglage för `Konstpauser mellan fraser (Sentence Silence)` (`0.1s–1.5s`), `Röstenergi & Betoning (VITS Expressiveness)` (`0.30–1.20`) och `Arena-klang / PA-eko` (`0%–80%`).
  - Växlar för `Svensk Arena-dramaturgi` (`ttsDramaticPauses`) och `Spela kort PA-gong före utrop` (`ttsPreChimeEnabled`).
- `GoalFlowModal.tsx` & `PenaltyFlowModal.tsx`: visa aktiv röst + ljudprofil i AI-Speaker-badgen (t.ex. `Piper Offline (Alma • Ishall PA)`).

---

## 4. Kvantifierat Funktionsorakel
1. `npx tsc --noEmit && npm run build` passerar med `exit code 0`.
2. `src/utils/domain.ts` förblir 100 % ren TypeScript (noll DOM/`window`/`AudioContext`).
3. Alla 3 svenska röster och prosodi-/DSP-parametrar hanteras konsekvent över API, tjänst, store, profiler och UI.
