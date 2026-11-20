# Task Contract: 26_arena_speaker_calibration
**Init Reference:** [26_arena_speaker_calibration_init.md](file:///home/ma-auto/DEV/blueprints/HockeyJockey/26_arena_speaker_calibration_init.md)
**Assigned Sub-Agent:** `Agent-Logic` (`Claude Sonnet 5.5 (Medium)`)
**Execution Mode:** Sandbox Mode (Autonomous Code Implementation)

---

## Pre-Flight Guardrail (OBLIGATORISK)
- Läs relevanta rader i `src/types/models.ts`, `src/data/defaults.ts`, `src/utils/domain.ts`, `src/services/ttsService.ts`, `vite.config.ts` och `src/components/SetupView.tsx` innan redigering.
- Du FÅR **INTE** skapa eller ändra något under `tests/`.
- Du FÅR **INTE** ändra denna `_task.md` eller `_init.md`.
- `src/utils/domain.ts` SKA vara 100 % fri från `window`, `document`, `AudioContext`, `localStorage` och `fetch`.

---

## Sekventiella Faser

### Fas 1: Typer & Kalibrerade Standardvärden
1. Utöka `TtsDspChainConfig` i `src/types/models.ts` med `reverbHighpassHz` och `reverbLowpassHz`.
2. Uppdatera `DEFAULT_SETTINGS` och samtliga poster i `DEFAULT_MATCH_PROFILES` i `src/data/defaults.ts` till `ttsSentenceSilenceSec: 0.45`, `ttsExpressiveness: 0.72` och `ttsArenaReverbMix: 0.22`.

### Fas 2: Domänlogik & Uttalslexikon (`src/utils/domain.ts`)
1. Uppdatera `formatTextForArenaProsody`: ta bort punktinjektion efter `nummer \d+`, håll `"Målskytt nummer 12, Emil Lindblom."` som sammanhängande fras med kommatecken, inför tydlig paus före `"Målskytt"`, `"Framspelad av"`, `"Assisterad av"`, `"<siffror> minuter för"`, samt lägg till svenskt hockeyuttal (`Hockey` -> `Håcki`, `Ishockey` -> `Ishåcki`, gemen/versal-bevarande).
2. Uppdatera `calculatePiperProsodyParams` med `voiceId`-stöd (`sv_SE-nst-medium` får `0.84` på `lengthScale` och `0.65` på `sentenceSilence`), mappning av `expressiveness` till `[0.50, 0.86]` samt `noiseW` i `[0.65, 0.86]`.
3. Uppdatera `computeTtsDspChainConfig` med `voiceId`-specifikt högpassfilter (`145 Hz` för NST, `125 Hz` för Alma/Lisa), ny EQ/kompressor, `reverbHighpassHz: 280`, `reverbLowpassHz: 2600`, `wetMix = clampedMix * 0.45` och `dryMix = 1.0 - clampedMix * 0.18`.
4. Uppdatera ev. kvarvarande `0.65` / `0.75` / `0.28`-fallbacks i `sanitizeSettings` så allt stämmer mot `DEFAULT_SETTINGS` och `computeTtsDspChainConfig`.

### Fas 3: DSP-kedja & Backend (`src/services/ttsService.ts` & `vite.config.ts`)
1. Utöka `TtsAudioPlayerOptions` med `voiceId?: PiperVoiceId`.
2. I `BrowserTtsAudioPlayer.getOrCreateImpulseResponse`: applicera explicit L2-energinormering (`* 0.45 / energy`) och sätt `convolver.normalize = false`.
3. I `BrowserTtsAudioPlayer.buildDspChain`: inför `reverbHighpass` (`280 Hz`) och `reverbLowpass` (`2600 Hz`) före/efter `convolver`, lågpass `2600 Hz` + `0.22` gain på slapback-ekot, samt mjuk `220 ms` tail-avklingning vid `wetMix > 0` som avbryts direkt vid `stop()`/`AbortSignal`.
4. Uppdatera `TtsService.speak` att skicka `voiceId` till `calculatePiperProsodyParams` och `audioPlayer.playWav`.
5. Uppdatera `vite.config.ts` att skicka `voiceId` genom `calculatePiperProsodyParams` och säker klampning (`noiseScale` i `[0.50, 0.86]`, `noiseW` i `[0.65, 0.86]`).

### Fas 4: UI-kalibrering (`src/components/SetupView.tsx`)
Lägg till knappen **"Återställ optimal Arena-kalibrering"** i `TtsSettingsSection` (`ttsRate: 1.05`, `ttsSentenceSilenceSec: 0.45`, `ttsExpressiveness: 0.72`, `ttsArenaReverbMix: 0.22`, `ttsAudioProfile: 'arena_pa'`, `ttsDramaticPauses: true`) och uppdatera referenstexter på reglagen (`0.45s (standard)`, `22% (standard)`).

### Fas 5: Typ- och Byggkontroll
Kör `npx tsc --noEmit && npm run build` i `/home/ma-auto/DEV/HockeyJockey` och säkerställ `exit code 0`.

---

## Stoppregler
- Redigera ALDRIG `tests/` i denna uppgift.
- Stoppa och rapportera om något orelaterat API bryts.

---

## Definition of Done (DoD)
- Samtliga 4 kalibreringar implementerade i `src/` och `vite.config.ts`.
- `npx tsc --noEmit && npm run build` passerar med `exit code 0`.
- `src/utils/domain.ts` verifierad fri från DOM/`window`/`AudioContext`/`fetch`.
