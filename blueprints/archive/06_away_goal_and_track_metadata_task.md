# Task: 06_away_goal_and_track_metadata (Task V2)
Status: READY_TO_EXECUTE
Tilldelad Roster-Profil: Agent-Logic
Tilldelad Modell & Tier: Claude Sonnet 5.5 (Medium)
Exekveringsmiljö: [x] Sandbox Mode (Auto-Approve)

---

## 1. Obligatorisk Pre-Flight Guardrail (Mental Självverifiering)

> [!CAUTION]
> **TILLSTÅNDSLÅSNING FÖR SUB-AGENTEN:**  
> Innan du utför någon handling eller anropar något verktyg i denna turn, MÅSTE du bekräfta följande i din första tankeprocess:
> 1. *"Jag agerar i rollen som Agent-Logic med tilldelad modell Claude Sonnet 5.5 (Medium)."*
> 2. *"Jag har läst och förstår Sacred Truth i `06_away_goal_and_track_metadata_init.md`. Jag har READ-ONLY tillgång till `_init.md` och får ALDRIG ändra den."*
> 3. *"Filmodifikation (No-Code-in-Chat): Jag modifierar källkodsfiler autonomt under `/home/ma-auto/DEV/HockeyJockey/` utan att mata ut kodblock i chatten."*
> 4. *"Sandbox-First Autonomi: Jag exekverar i Sandbox Mode och verifierar med `npx tsc --noEmit` och `npm run build`."*
> 5. *"Isolering mot Orakel: Jag ändrar INTE filer i `tests/` — de uppdateras oberoende av `Agent-Oracle`."*

---

## 2. Exekveringssteg & Granulära Faser

### Fas 1: Förberedelser & Läsning
- [ ] **Läs Sacred Truth:** Läs `/home/ma-auto/DEV/blueprints/HockeyJockey/06_away_goal_and_track_metadata_init.md` samt befintliga `vite.config.ts`, `src/types/models.ts`, `src/data/defaults.ts`, `src/utils/domain.ts`, `src/store/useAppStore.ts`, `src/components/GoalFlowModal.tsx`, `src/components/SetupView.tsx` och `src/App.tsx`.

### Fas 2: Implementering
- [ ] **Datamodeller & Standarddata (`src/types/models.ts`, `src/data/defaults.ts`):** Lägg till `awayGoalSilence: boolean` (default `true`) i `AppSettings`, `DEFAULT_SETTINGS`, `MatchProfile.settings` och profilerna i `DEFAULT_MATCH_PROFILES`.
- [ ] **Domänlogik (`src/utils/domain.ts`):** Lägg till `extractSpotifyTrackId` och `parseSpotifyMetadataPayload`, samt uppdatera `sanitizeSettings` och `sanitizeMatchProfile` för `awayGoalSilence`. Håll `domain.ts` 100 % fri från DOM/`window`/`localStorage`.
- [ ] **Store (`src/store/useAppStore.ts`):** Inkludera `awayGoalSilence` i `saveCurrentAsMatchProfile` och `activateMatchProfile`.
- [ ] **Vite Metadata-Proxy & Klienttjänst (`vite.config.ts`, `src/services/spotifyMetadata.ts`):**
  - Lägg till `/api/spotify-meta` middleware i `vite.config.ts` för både `configureServer` och `configurePreviewServer`.
  - Implementera `fetchSpotifyTrackMetadata` i `src/services/spotifyMetadata.ts` med 3-stegs-vattenfall (Spotify Web API -> `/api/spotify-meta` -> direkt oEmbed fallback).
- [ ] **UI-komponenter (`src/components/GoalFlowModal.tsx`, `src/App.tsx`, `src/components/SetupView.tsx`):**
  - `GoalFlowModal.tsx` & `App.tsx`: Respektera `settings.awayGoalSilence` vid öppning av bortamål (`false` startar automatiskt `onStartAwayRestartMusic()`), ducka korrekt vid talmanus samt ge tydlig status och snabbväxling direkt i bortamålsrutan.
  - `SetupView.tsx`: Tydlig inställningskontroll för *"Sportslig tystnad vid bortamål"*, samt automatisk hämtning & ifyllnad av `Titel` och `Artist` (plus manuell `[Hämta info]`-knapp) när en Spotify-delningslänk/URI klistras in i Soundboard-konfigurationen.

### Fas 3: Verifiering
- [ ] **Typcheck:** `npx tsc --noEmit` i `/home/ma-auto/DEV/HockeyJockey` returnerar exit code `0`.
- [ ] **Bygge:** `npm run build` i `/home/ma-auto/DEV/HockeyJockey` returnerar exit code `0`.

---

## 3. Acceptanskriterier
1. Samtliga krav i `06_away_goal_and_track_metadata_init.md` är implementerade.
2. `npx tsc --noEmit` och `npm run build` passerar med `0` fel.
3. Endast verifierade filvägar och byggresultat rapporteras (inga kodblock i chatten).
