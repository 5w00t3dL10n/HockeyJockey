# Init Blueprint: 21_piper_tts_and_smart_ducking
**Target Project:** HockeyJockey (`/home/ma-auto/DEV/HockeyJockey`)
**Author:** Lead Architect (UEF-V2)
**Ansvarig Executor:** `Agent-Logic` (`Claude Sonnet 5.5 (Medium)`)
**Status:** LOCKED / SACRED TRUTH (READ-ONLY för utvecklings- och testagenter)

---

## 1. Systemöversikt & Arkitektur
Detta uppdrag bygger in **Piper TTS (Offline Svensk AI-Speaker)** som ett valbart talsyntesalternativ i HockeyJockeys inställningar samt integrerar **Smart samspel med ljudmotorn i båset**:
- **Offline Zero-Token Backend (Vite Middleware):** Vite exponerar `/api/tts/status` och `/api/tts` (stödjer `POST` JSON och `GET` query) i både `configureServer` och `configurePreviewServer`. Middlewaren anropar värdens lokala Piper-binär i `/home/ma-auto/.local/share/piper/piper/piper` (med stöd för `PIPER_HOME`-miljövariabel vid testning), cachar syntetiserad WAV i minnet (LRU max 30 poster) och returnerar `audio/wav`.
- **Smart Samspel med Ljudmotorn (`TtsService` + `AudioController`):**
  1. När speakern klickar `[🔊 LÄS UPP MANUS (AI-SPEAKER)]` (eller vid automatisk uppläsning om `ttsAutoRead` är aktivt, eller vid provlyssning i Inställningar), kontrollerar `TtsService` om arenamusik spelas via `AudioController.getState()`.
  2. Om musik spelas och volymen överstiger `settings.duckVolume`, sänker `TtsService` musiken mjukt via `await audioCtrl.duckVolume(settings.duckVolume, 350)` **innan** uppläsningen startar.
  3. Talet spelas upp med valt läge (`piper` via `/api/tts` + `HTMLAudioElement`, eller `webspeech` via `window.speechSynthesis` `sv-SE`).
  4. **Calm Tech Fallback:** Om Piper-endpointen misslyckas (t.ex. HTTP 503 / nätverksfel) faller `TtsService` automatiskt över till webbläsarens `Web Speech API` (`sv-SE`) utan krasch eller blockerande dialogrutor, och flaggar tydlig status i UI.
  5. När talet avslutas naturligt (och inga nyare talanrop eller manuella stopp skett) och `settings.ttsRestoreMusicAfter === true` medan musik fortfarande spelas, höjer `TtsService` automatiskt musiken tillbaka via `await audioCtrl.restoreVolume(1.0, 400)`.
  6. Vid användarinitierat stopp (`⏹ STOPPA UPPLÄSNING`, `Klar / Behåll musik`, `Klar / Fade Out`, `Avbryt`, `Tvärstopp`, eller nytt TTS-anrop) avbryts pågående tal omedelbart utan senkommen `restoreVolume`-kollision.

---

## 2. Tech Stack Audit & Tool-First Beslut
- **Nivå 2 (Extern binär via Vite Backend):** Piper körs som separat lokal process från Vite Node-servern (samma etablerade mönster som `/api/spotify-meta` och `/api/media-archive` i `vite.config.ts`).
- **Nivå 3 (Custom Code motivering):** Domänvalidering för röster/talhastighet (`src/utils/domain.ts`), state- och sekvenskoordinering mellan TTS och `AudioController` (`src/services/ttsService.ts`), samt React-UI (`SetupView.tsx`, `GoalFlowModal.tsx`, `PenaltyFlowModal.tsx`, `App.tsx`) kräver typsäker browser/Vite-logik som inte kan lösas enbart med OS-nativa CLI-kommandon.
- **Triage-routing:** `Agent-Logic` (`Claude Sonnet 5.5 (Medium)`). Strikt isolerad från `tests/`.

---

## 3. Gränssnitts- och Datakontrakt

### 3.1 `src/types/models.ts` & `src/data/defaults.ts`
Lägg till:
- `export type TtsEngineType = 'piper' | 'webspeech';`
- `export type PiperVoiceId = 'sv_SE-nst-medium' | 'sv_SE-lisa-medium';`
- På både `AppSettings` och `MatchProfile['settings']`:
  - `ttsEnabled: boolean` (default: `true`)
  - `ttsEngine: TtsEngineType` (default: `'piper'`)
  - `ttsVoiceId: PiperVoiceId` (default: `'sv_SE-nst-medium'`)
  - `ttsRate: number` (default: `1.0`, giltigt intervall `[0.5, 2.0]`)
  - `ttsVolume: number` (default: `1.0`, giltigt intervall `[0.0, 1.0]`)
  - `ttsAutoRead: boolean` (default: `false`)
  - `ttsRestoreMusicAfter: boolean` (default: `true`)
- `DEFAULT_SETTINGS` och samtliga profiler i `DEFAULT_MATCH_PROFILES` ska innehålla dessa 7 fält så att Control 4 snapshot-kontroller och standardprofiler alltid är konsistenta.

### 3.2 `src/utils/domain.ts` (Strikt ren – Noll DOM/window/localStorage)
Exportera:
- `export const PIPER_VOICE_IDS = ['sv_SE-nst-medium', 'sv_SE-lisa-medium'] as const;`
- `export function isValidPiperVoiceId(id: string): id is PiperVoiceId`
- `export function calculatePiperLengthScale(rate: number): number`
  - Klipper ändligt `rate` till `[0.5, 2.0]` (om `rate <= 0` eller `!Number.isFinite(rate)` -> fall tillbaka till `1.0`).
  - Returnerar `Number((1 / clampedRate).toFixed(3))` (snabbare `rate = 1.25` ger kortare längdskala `0.8`, långsammare `rate = 0.5` ger `2.0`).
- Uppdatera `sanitizeSettings` (och `sanitizeMatchProfile` / `sanitizeMatchConfig`):
  - Full bakåtkompatibilitet: om äldre JSON saknar `tts*`-fält appliceras standardvärdena ovan utan fel.
  - Ogiltigt `ttsEngine` -> `'piper'`; ogiltigt `ttsVoiceId` -> `'sv_SE-nst-medium'`; `ttsRate` klampas `[0.5, 2.0]`; `ttsVolume` klampas `[0.0, 1.0]`.

### 3.3 `vite.config.ts` (Piper TTS Endpoints i dev + preview)
Implementera `piperTtsPlugin()` som registreras i både `configureServer` och `configurePreviewServer`:
- Piper-sökvägar härleds via `process.env.PIPER_HOME || path.join(os.homedir(), '.local', 'share', 'piper')`:
  - Binär: `<piperRoot>/piper/piper`
  - Lib-katalog: `<piperRoot>/piper` (injiceras i `LD_LIBRARY_PATH` vid `spawn`)
  - Röster: `<piperRoot>/voices/<voiceId>.onnx` och `<piperRoot>/voices/<voiceId>.onnx.json`
- `GET /api/tts/status`:
  - Returnerar HTTP `200` JSON:
    - `available`: `boolean` (`binär finns && minst en röst finns`)
    - `engine`: `'piper'`
    - `voices`: `[ { id: 'sv_SE-nst-medium', label: 'NST – Svensk Speakerröst (Man/Neutral)', available: boolean }, { id: 'sv_SE-lisa-medium', label: 'Lisa – Svensk Speakerröst (Kvinna)', available: boolean } ]`
- `POST /api/tts` & `GET /api/tts`:
  - Läser `text`, `voiceId`, `rate` (från JSON body vid `POST`, query params vid `GET`).
  - Om `text` saknas eller `text.trim().length === 0` -> HTTP `400` JSON `{ error: 'Text får inte vara tom.' }`. (Klipp/begränsa extrem längd säkert t.ex. max `1500` tecken eller `400`).
  - Om `voiceId` anges och inte ingår i `['sv_SE-nst-medium', 'sv_SE-lisa-medium']` -> HTTP `400` JSON `{ error: 'Ogiltig röstmodell.' }` (om utelämnad används `'sv_SE-nst-medium'`). Sökvägar byggs via whitelist-lookup, aldrig osäker strängkonkatenering.
  - Beräknar `lengthScale = Number((1 / clampedRate).toFixed(3))` med `clampedRate` i `[0.5, 2.0]`.
  - Om Piper-binär eller vald `.onnx`-fil saknas -> HTTP `503` JSON `{ error: 'Piper TTS är inte tillgänglig på servern.' }`.
  - LRU-cache i minnet (max `30` poster, nyckel `${voiceId}|${lengthScale}|${trimmedText}`) som returnerar cachad `Buffer` direkt vid träff.
  - Anropar Piper via `child_process.spawn` (`shell: false`, skriv text på `stdin`, vänta på exit code `0`, läs genererad WAV och städa eventuella tempfiler säkert i `finally`).
  - Svarar med HTTP `200`, `Content-Type: audio/wav`, `Cache-Control: no-store`.

### 3.4 `src/services/ttsService.ts`
Designa `TtsService` (plus singleton `export const ttsService = new TtsService()`) med ren injicerbar transport (`TtsDependencies` / valfri konstruktor) så att Stage 4-oraklet kan verifiera hela sekvensen deterministiskt i Node/ESM utan DOM, samtidigt som browser-standarder (`fetch`, `Audio`, `URL`, `window.speechSynthesis`) används automatiskt i produktion:
- Tillstånd (`TtsServiceState`):
  - `playbackState: 'idle' | 'loading' | 'speaking' | 'error'`
  - `activeEngine: TtsEngineType | null`
  - `activeVoiceId: PiperVoiceId | null`
  - `usedFallback: boolean`
  - `lastError: string | null`
  - `piperStatus: TtsStatusResponse | null`
- Publika metoder:
  - `getState()`, `subscribe(listener)`
  - `checkStatus(): Promise<TtsStatusResponse | null>`
  - `stop(): void` (ökar `speakSeq`, aborterar ev. pågående `fetch`, stoppar aktivt audioelement/objectURL, anropar `speechSynthesis.cancel()`, sätter `playbackState = 'idle'`)
  - `speak(text: string, settings: AppSettings, audioCtrl: AudioDuckingAdapter = audioController): Promise<void>`
- **Smart Samspel-kontrakt i `speak()`:**
  1. Om `!text.trim()` -> returnera direkt.
  2. Kör `this.stop()` för att rensa ev. föregående tal och fånga ny sekvens `const mySeq = this.speakSeq`.
  3. Läs `const preState = audioCtrl.getState()`. Om `preState.isPlaying && preState.volume > settings.duckVolume`, anropa `await audioCtrl.duckVolume(settings.duckVolume, 350)` INNAN TTS startar. Kontrollera därefter `if (mySeq !== this.speakSeq) return;`.
  4. Om `settings.ttsEngine === 'piper'`: försök `/api/tts` + WAV-uppspelning med `settings.ttsVolume`. Vid fel (och `mySeq === this.speakSeq`) fall över automatiskt till Web Speech (`sv-SE`, `rate`, `volume`) och sätt `usedFallback: true` + beskrivande svensk status.
  5. Om `settings.ttsEngine === 'webspeech'`: kör Web Speech (`sv-SE`, `rate`, `volume`).
  6. Vid **naturligt avslut** av talet (endast om `mySeq === this.speakSeq` inte blivit stoppad/överskriven):
     - Sätt `playbackState = 'idle'`.
     - Om `settings.ttsRestoreMusicAfter && audioCtrl.getState().isPlaying`, anropa `await audioCtrl.restoreVolume(1.0, 400)`.

### 3.5 Store & UI (`useAppStore.ts`, `GoalFlowModal.tsx`, `PenaltyFlowModal.tsx`, `SetupView.tsx`, `App.tsx`)
- `useAppStore.ts`: synka samtliga 7 `tts*`-fält i `saveCurrentAsMatchProfile` och `activateMatchProfile`.
- `GoalFlowModal.tsx` & `PenaltyFlowModal.tsx`:
  - I talmanus-steget (`script`): lägg till tydlig knapp `[🔊 LÄS UPP MANUS (AI-SPEAKER)]` som växlar till `[⏹ STOPPA UPPLÄSNING]` när tal pågår, samt kompakt svensk badge för aktiv röst / fallback-status.
  - Om `settings.ttsEnabled && settings.ttsAutoRead` är sant när man kommer in i manussteget ska `ttsService.speak(scriptText, settings)` triggas en gång automatiskt för den händelsen.
  - Vid stängning, avbryt, `Klar / Fade Out`, `Klar / Behåll musik` ska `ttsService.stop()` anropas.
- `App.tsx`:
  - Anropa `void ttsService.checkStatus()` vid uppstart.
  - Anropa `ttsService.stop()` vid `hardStop` och när användaren avslutar/fade:ar ut via toppfältet.
- `SetupView.tsx`:
  - Ny tydlig sektion **"AI-Speaker & Talsyntes för Teleprompter (Piper Offline TTS)"** (placerad logiskt i båsets inställningsvy / systemfliken) med:
    - Live-status för lokal Piper-server (`Tillgänglig offline` / `Ej installerad – Web Speech fallback`) + uppdateringsknapp.
    - Växel för `ttsEnabled` ("Aktivera talsyntes-knapp i talmanus").
    - Val av motor (`Piper TTS – Offline Svensk AI-röst` vs `Webbläsarens Web Speech`).
    - Val av röst (`sv_SE-nst-medium` vs `sv_SE-lisa-medium`) med tillgänglighetsmarkering.
    - Reglage för `Talhastighet` (`0.6x`–`1.5x` eller `0.5x`–`2.0x`) och `Röstvolym` (`0%`–`100%`).
    - Växlar för `ttsAutoRead` ("Läs upp talmanus automatiskt när mål/utvisning visas") och `ttsRestoreMusicAfter` ("Höj musiken automatiskt när AI-speakern pratat klart").
    - Testknapp `[🔊 Provlyssna AI-Speaker]` / `[⏹ Stoppa provlyssning]` som läser upp exempeltext och demonstrerar Smart Samspel mot musiken.

---

## 4. Calm Tech & Säkerhet
- Piper startas alltid med `shell: false` (inga skalinjektioner möjliga) och whitelistade modell-ID:n.
- Inga blocking `alert()`/`confirm()` vid fel. Om Piper faller bort fungerar appen vidare med Web Speech fallback och diskret svensk badge.

---

## 5. Kvantifierat Funktionsorakel (Målbild för Stage 4)
1. `npx tsc --noEmit && npm run build` passerar med `exit code 0`.
2. `/api/tts/status` returnerar HTTP `200` JSON och `/api/tts` returnerar giltig `audio/wav` för både `sv_SE-nst-medium` och `sv_SE-lisa-medium`.
3. `TtsService` utför garanterat `duckVolume` -> `speak` -> `restoreVolume` i exakt ordning mot `AudioController` samt faller tillbaka till Web Speech vid HTTP 503.
4. Legacy-profiler och konfigurationer utan `tts*` importeras utan fel med korrekta standardvärden.
