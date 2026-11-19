# Task: 14_embedded_media_archive (Task V2)
Status: READY_TO_EXECUTE
Tilldelad Roster-Profil: Agent-Logic
Tilldelad Modell & Tier: Claude Sonnet 5.5 (Medium)
Exekveringsmiljö: [x] Sandbox Mode (Auto-Approve)

---

## 1. Obligatorisk Pre-Flight Guardrail

> [!CAUTION]
> 1. *"Jag agerar i rollen som Agent-Logic med tilldelad modell Claude Sonnet 5.5 (Medium)."*
> 2. *"Jag har READ-ONLY tillgång till `14_embedded_media_archive_init.md` och får ALDRIG ändra den."*
> 3. *"Jag modifierar endast filer under `/home/ma-auto/DEV/HockeyJockey/` (ej `tests/`) autonomt via filverktyg (inga kodblock i chatten)."*
> 4. *"Jag verifierar med `npx tsc --noEmit && npm run build` (exit code 0)."*

---

## 2. Exekveringssteg
- [ ] **Läs Sacred Truth:** Läs `/home/ma-auto/DEV/blueprints/HockeyJockey/14_embedded_media_archive_init.md`, `vite.config.ts`, `tsconfig.json`, `src/utils/domain.ts`, `src/services/localAudioStorage.ts`, `src/store/useAppStore.ts`, `src/App.tsx` och `src/components/SetupView.tsx`.
- [ ] **Skapa `src/media/.gitkeep`:** Säkerställ att `/home/ma-auto/DEV/HockeyJockey/src/media` existerar (bevara eventuella befintliga ljudfiler).
- [ ] **Domänlogik (`src/utils/domain.ts`):** Implementera `ACCEPTED_AUDIO_EXTENSIONS`, `isAcceptedAudioFileName`, `inferAudioMimeType` och `buildEmbeddedMediaUri` (100 % fri från DOM/`window`/`localStorage`).
- [ ] **Vite Middleware (`vite.config.ts`) & Media-tjänst (`src/services/localAudioStorage.ts`, ev. `src/vite-env.d.ts`):** Implementera `/api/media-archive` och `/api/media-archive/file` (med Range 206 och path-traversal-skydd) samt `EmbeddedMediaItem`, `registerEmbeddedMediaItems` och `syncEmbeddedMediaArchive`.
- [ ] **Store & Automatisk Start-import (`src/store/useAppStore.ts`, `src/App.tsx`):** Implementera `embeddedMediaTracks`, `autoImportedMediaUris`, idempotent `importEmbeddedMediaArchive` samt automatisk synk + import vid appstart i `App.tsx`.
- [ ] **UI (`src/components/SetupView.tsx`):** Lägg till panelen `"Inbäddat Mediaarkiv (HockeyJockey/src/media)"` med manuell omskanning, provspelning och knapp-skapande, samt snabbdropdown i `SoundPadEditor`.
- [ ] **Verifiering:** Kör `npx tsc --noEmit && npm run build` (exit code `0`).
