# Task: 12_local_audio_files (Task V2)
Status: READY_TO_EXECUTE
Tilldelad Roster-Profil: Agent-Logic
Tilldelad Modell & Tier: Claude Sonnet 5.5 (Medium)
Exekveringsmiljö: [x] Sandbox Mode (Auto-Approve)

---

## 1. Obligatorisk Pre-Flight Guardrail

> [!CAUTION]
> 1. *"Jag agerar i rollen som Agent-Logic med tilldelad modell Claude Sonnet 5.5 (Medium)."*
> 2. *"Jag har READ-ONLY tillgång till `12_local_audio_files_init.md` och får ALDRIG ändra den."*
> 3. *"Jag modifierar endast filer under `/home/ma-auto/DEV/HockeyJockey/src/` autonomt via filverktyg (inga kodblock i chatten)."*
> 4. *"Jag rör INTE `tests/` och verifierar med `npx tsc --noEmit && npm run build` (exit code 0)."*

---

## 2. Exekveringssteg
- [ ] **Läs Sacred Truth:** Läs `/home/ma-auto/DEV/blueprints/HockeyJockey/12_local_audio_files_init.md` samt befintliga `src/types/models.ts`, `src/utils/domain.ts`, `src/services/audioController.ts`, `src/components/SetupView.tsx`, `src/components/MatchView.tsx`, `src/components/TopBar.tsx`.
- [ ] **Datamodeller & Domänlogik (`src/types/models.ts`, `src/utils/domain.ts`):** Lägg till `TrackSourceType`, `TrackCue` lokal-metadata, `isLocalAudioUri`, `createLocalAudioUri`, `parseLocalAudioFilename`, uppdaterad `tryParseSpotifyUri`/`parseSpotifyUri` och `sanitizeTrackCue`. Håll `domain.ts` 100 % fri från DOM/`window`/`localStorage`.
- [ ] **IndexedDB & Ljudmotor (`src/services/localAudioStorage.ts`, `src/services/audioController.ts`):** Implementera persistent IndexedDB-lagring (med in-memory fallback för headless Node) och HTML5 `HTMLAudioElement`-uppspelning med `startTimeMs`-seek, 50 ms volymramper (`duckVolume`, `restoreVolume`, `fadeOutAndPause`), `hardStop` och isolering från Spotify-volymkommandon vid lokal uppspelning.
- [ ] **UI (`src/components/SetupView.tsx`, `src/components/MatchView.tsx`, `src/components/TopBar.tsx`):** Lägg till filväljare (`Välj lokal ljudfil...`, inkl. `multiple` i lägg-till-formuläret), automatisk titel/artist-ifyllnad från filnamn, lokal badge, saknad-fil-varning efter JSON-import samt lokal indikator i `MatchView` & `TopBar`.
- [ ] **Verifiering:** Kör `npx tsc --noEmit && npm run build` (exit code `0`).
