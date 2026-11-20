# Task Contract: 24_arena_speaker_dsp_and_prosody
**Init Reference:** [24_arena_speaker_dsp_and_prosody_init.md](file:///home/ma-auto/DEV/blueprints/HockeyJockey/24_arena_speaker_dsp_and_prosody_init.md)
**Assigned Sub-Agent:** `Agent-Logic` (`Claude Sonnet 5.5 (Medium)`)
**Execution Mode:** Sandbox Mode (Autonomous Code Implementation)

---

## Pre-Flight Guardrail (OBLIGATORISK)
- Läs relevanta avsnitt i `src/types/models.ts`, `src/data/defaults.ts`, `src/utils/domain.ts`, `src/services/ttsService.ts`, `src/store/useAppStore.ts`, `vite.config.ts`, `src/components/SetupView.tsx`, `src/components/GoalFlowModal.tsx` och `src/components/PenaltyFlowModal.tsx` innan ändring.
- Du FÅR **INTE** skapa eller ändra något under `tests/`.
- Du FÅR **INTE** ändra denna `_task.md` eller `_init.md`.
- `src/utils/domain.ts` SKA vara 100 % fri från `window`, `document`, `AudioContext`, `localStorage` och `fetch`.

---

## Sekventiella Faser

### Fas 1: Modeller, Standardvärden & Ren Domänlogik
1. Uppdatera `src/types/models.ts` med `'sv_SE-alma-medium'` i `PiperVoiceId`, `TtsAudioProfile`, `TtsDspChainConfig` samt de 6 nya `tts*`-fälten i `AppSettings` och `MatchProfile['settings']`.
2. Uppdatera `src/data/defaults.ts` så både `DEFAULT_SETTINGS` och samtliga `DEFAULT_MATCH_PROFILES` har de 6 nya standardvärdena (`ttsAudioProfile: 'arena_pa'`, `ttsDramaticPauses: true`, `ttsSentenceSilenceSec: 0.65`, `ttsExpressiveness: 0.75`, `ttsArenaReverbMix: 0.28`, `ttsPreChimeEnabled: false`).
3. Uppdatera `src/utils/domain.ts`:
   - Utöka `PIPER_VOICE_IDS` med `'sv_SE-alma-medium'`.
   - Exportera `TTS_AUDIO_PROFILES`, `isValidTtsAudioProfile`, `calculatePiperProsodyParams`, `formatTextForArenaProsody` och `computeTtsDspChainConfig`.
   - Uppdatera `sanitizeSettings` och `sanitizeMatchProfile` med bakåtkompatibel sanering/klampning för alla 6 fält.

### Fas 2: Vite Backend Middleware (`vite.config.ts`)
1. Lägg till `sv_SE-alma-medium` i `PIPER_VOICE_CATALOG`.
2. Utöka `/api/tts` (`GET` & `POST`) med validering av `sentenceSilence`, `noiseScale`, `noiseW` via `calculatePiperProsodyParams`.
3. Skicka `--length_scale`, `--noise_scale`, `--noise_w`, `--sentence_silence` till Piper i `synthesizeWithPiper` och inkludera dessa i LRU-cachens nyckel.

### Fas 3: Web Audio DSP & Prosodistyrning i `src/services/ttsService.ts`
1. Utöka `TtsAudioPlayer.playWav` options med `audioProfile`, `arenaReverbMix`, `preChimeEnabled`.
2. Uppgradera `BrowserTtsAudioPlayer` med Web Audio DSP-graf (`AudioContext` + `computeTtsDspChainConfig`: Highpass, Chest EQ, Presence EQ, AI De-Harsher Lowpass, Broadcast `DynamicsCompressorNode`, Slapback Delay + Hall `ConvolverNode`), valfri 2-tons PA-chime (`preChimeEnabled`) samt mjuk fallback till `HTMLAudioElement` om Web Audio ej är tillgänglig.
3. Uppdatera `TtsService.speak()` till att formatera taltexten via `formatTextForArenaProsody`, beräkna VITS-prosodi via `calculatePiperProsodyParams`, skicka parametrarna till `/api/tts` och skicka DSP-inställningarna till `this.audioPlayer.playWav`, med bibehållet `duckVolume -> speak -> restoreVolume`-samspel och rent `stop()`-avbrott.

### Fas 4: Store & React UI
1. Uppdatera `src/store/useAppStore.ts` (`updateSettings`, `saveCurrentAsMatchProfile`, `activateMatchProfile`) så alla 6 nya `tts*`-fält sparas, laddas och klampas.
2. Uppdatera `TtsSettingsSection` i `src/components/SetupView.tsx` med UI för tredje rösten (`Alma`), Arena-PA DSP-preset, prosodireglage (konstpaus, röstenergi, arena-klang) och växlar för Arena-dramaturgi och PA-gong.
3. Uppdatera AI-Speaker-badgen i `src/components/GoalFlowModal.tsx` och `src/components/PenaltyFlowModal.tsx` så aktiv röst + vald Arena/Bås-ljudprofil visas tydligt.

### Fas 5: Typ- och Byggkontroll
Kör `npx tsc --noEmit && npm run build` i `/home/ma-auto/DEV/HockeyJockey` och säkerställ `exit code 0`.

---

## Stoppregler
- Om någon befintlig kontroll/kontrakt i `domain.ts` eller `audioController.ts` kolliderar – stoppa och rapportera exakt vad som hittades utan att röra `tests/`.

---

## Definition of Done (DoD)
- Samtliga filer i Fas 1–4 implementerade på ren svenska utan DOM-läckage i `domain.ts`.
- `npx tsc --noEmit && npm run build` passerar med `exit code 0`.
- `git status` visar endast ändringar i `src/` och `vite.config.ts` (inga test- eller blueprintändringar).
