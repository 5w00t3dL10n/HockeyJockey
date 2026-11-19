# Task Contract: 21_piper_tts_and_smart_ducking
**Init Reference:** [21_piper_tts_and_smart_ducking_init.md](file:///home/ma-auto/DEV/blueprints/HockeyJockey/21_piper_tts_and_smart_ducking_init.md)
**Assigned Sub-Agent:** `Agent-Logic` (`Claude Sonnet 5.5 (Medium)`)
**Execution Mode:** Sandbox Mode (Autonomous Code Implementation)

---

## Pre-Flight Guardrail (OBLIGATORISK)
- Läs relevanta rader i `src/types/models.ts`, `src/data/defaults.ts`, `src/utils/domain.ts`, `src/services/audioController.ts`, `src/store/useAppStore.ts`, `vite.config.ts`, `src/components/GoalFlowModal.tsx`, `src/components/PenaltyFlowModal.tsx`, `src/components/SetupView.tsx` och `src/App.tsx` innan du ändrar dem.
- Du FÅR **INTE** skapa eller ändra något under `tests/`.
- Du FÅR **INTE** ändra denna `_task.md` eller `_init.md`.
- `src/utils/domain.ts` måste förbli 100 % ren TypeScript (inga `window`, `document`, `localStorage` eller `fetch`-anrop).
- Inga ad-hoc Python/test-hack; verifiera med `npx tsc --noEmit && npm run build`.

---

## Sekventiella Faser

### Fas 1: Modeller, Standardvärden & Ren Domänlogik
1. Uppdatera `src/types/models.ts` med `TtsEngineType`, `PiperVoiceId` samt de 7 `tts*`-fälten i `AppSettings` och `MatchProfile['settings']`.
2. Uppdatera `src/data/defaults.ts` så att `DEFAULT_SETTINGS` och samtliga `DEFAULT_MATCH_PROFILES` har de 7 `tts*`-standardvärdena (`ttsEnabled: true`, `ttsEngine: 'piper'`, `ttsVoiceId: 'sv_SE-nst-medium'`, `ttsRate: 1.0`, `ttsVolume: 1.0`, `ttsAutoRead: false`, `ttsRestoreMusicAfter: true`).
3. Uppdatera `src/utils/domain.ts`:
   - Exportera `PIPER_VOICE_IDS`, `isValidPiperVoiceId`, `calculatePiperLengthScale`.
   - Uppdatera `sanitizeSettings`, `sanitizeMatchProfile` och `sanitizeMatchConfig` med bakåtkompatibel sanering/klampning för `tts*`.

### Fas 2: Vite Backend Middleware för Piper TTS (`vite.config.ts`)
1. Skapa och registrera `piperTtsPlugin()` i både `configureServer` och `configurePreviewServer`.
2. Implementera `GET /api/tts/status` som inspekterar `<PIPER_HOME>/piper/piper` och röstfilerna i `<PIPER_HOME>/voices/`.
3. Implementera `POST /api/tts` och `GET /api/tts` med strikt validering (`400` vid tom text eller okänd röst, `503` vid saknad binär/modell), in-memory LRU-cache (max `30` poster), `shell: false`-spawn med `LD_LIBRARY_PATH`, `--length_scale`, säker WAV-generering och städning av ev. temporärfil i `os.tmpdir()` innan svar (`200`, `audio/wav`).

### Fas 3: `src/services/ttsService.ts` & Smart Samspel med `AudioController`
1. Skapa `src/services/ttsService.ts` med `TtsService` och singleton `ttsService`.
2. Injicerbara beroenden i konstruktorn (valfria med säkra browser-default) så att tjänsten kan köras både i webbläsaren och deterministiskt headless i Node.
3. Implementera exakt duck-ordning: `stop()` -> kontrollera `audioCtrl.getState()` -> om `isPlaying && volume > settings.duckVolume` kör `await audioCtrl.duckVolume(settings.duckVolume, 350)` -> kontrollera sekvensnummer -> spela WAV från `/api/tts` (med automatisk fallback till `window.speechSynthesis` `sv-SE` vid fel) -> vid naturligt slut och `settings.ttsRestoreMusicAfter && audioCtrl.getState().isPlaying` kör `await audioCtrl.restoreVolume(1.0, 400)`.

### Fas 4: Store & React UI (`useAppStore.ts`, Modaler, `SetupView.tsx`, `App.tsx`)
1. Uppdatera `src/store/useAppStore.ts` (`saveCurrentAsMatchProfile`, `activateMatchProfile`) så alla `tts*`-fält sparas och laddas med matchprofiler.
2. Uppdatera `src/components/GoalFlowModal.tsx` och `src/components/PenaltyFlowModal.tsx` med uppläsnings-/stoppknapp i manussteget, diskret statusindikator, valfri auto-uppläsning (`ttsEnabled && ttsAutoRead`), samt `ttsService.stop()` vid stängning/fade/behåll musik.
3. Uppdatera `src/App.tsx` med `ttsService.checkStatus()` vid init och `ttsService.stop()` i `hardStop` / musikstopp.
4. Uppdatera `src/components/SetupView.tsx` med full svensk panel för **"AI-Speaker & Talsyntes för Teleprompter (Piper Offline TTS)"** inklusive live-status, motorval, röstval, reglage för hastighet/volym, växlar och `[🔊 Provlyssna AI-Speaker]`.

### Fas 5: Bygg- & Typkontroll
Kör `npx tsc --noEmit && npm run build` i `/home/ma-auto/DEV/HockeyJockey` och säkerställ `exit code 0`.

---

## Stoppregler
- Om något befintligt exportkontrakt i `AudioController` eller `domain.ts` skiljer sig oväntat och verkar bryta bakåtkompatibilitet – stoppa och rapportera exakt vad som hittades innan omskrivning av orelaterad logik.
- Redigera aldrig `tests/` i denna uppgift.

---

## Definition of Done (DoD)
- Samtliga filer i Fas 1–4 är implementerade med ren TypeScript och full svensk UI-copy.
- `npx tsc --noEmit` passerar med 0 fel.
- `npm run build` passerar med `exit code 0`.
- `git status` visar endast ändringar relaterade till `src/`, `vite.config.ts` (inga test- eller blueprint-ändringar).
