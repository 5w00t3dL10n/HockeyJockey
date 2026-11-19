# Task: 02_hockey_dj_app (Task V2)
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
> 2. *"Jag har läst och förstår Sacred Truth i `02_hockey_dj_app_init.md`. Jag har READ-ONLY tillgång till `_init.md` och får ALDRIG ändra den."*
> 3. *"Jag respekterar Tool-First-hierarkin och den motiverade Nivå 3-allokeringen för denna SPA."*
> 4. *"Filmodifikation (No-Code-in-Chat): Jag modifierar alla källkodsfiler autonomt via filverktyg (`write_file`, `edit_file`) under `/home/ma-auto/DEV/HockeyJockey/src/`. Jag matar ALDRIG ut kodblock i chatten."*
> 5. *"Sandbox-First Autonomi: Jag exekverar i Sandbox Mode med auto-godkännande och verifierar med `npx tsc --noEmit` och `npm run build`."*
> 6. *"Isolering mot Orakel: Jag skapar INTE Stage 2/Stage 4-testoraklen i `tests/` — de konstrueras oberoende av `Agent-Oracle`."*

---

## 2. Exekveringssteg & Granulära Faser

### Fas 1: Förberedelser & Statisk Kontroll
- [ ] **Läs Sacred Truth:** Läs `02_hockey_dj_app_init.md` och `/home/ma-auto/DEV/HockeyJockey/teknisk_specifikation_hockey_dj_speaker_assistant.md`.
- [ ] **Validera Grundmiljö:** Kör `npx tsc --noEmit` i `/home/ma-auto/DEV/HockeyJockey` för att bekräfta att scaffolden kompilerar rent.

### Fas 2: Implementering (Kirurgisk & Deterministisk)
- [ ] **L1 Datamodeller & Standarddata:**
  - *Filer:* `src/types/models.ts`, `src/data/penalties.ts`, `src/data/defaults.ts`
  - *Uppgift:* Implementera alla TypeScript-gränssnitt exakt enligt Sacred Truth, alla 13 domarförseelser samt färdiga standardlag och soundboard-pads för samtliga 9 kategorier (inkl. låtpooler).
- [ ] **L2 Ren Domänlogik:**
  - *Fil:* `src/utils/domain.ts`
  - *Uppgift:* Implementera `parseSpotifyUri`, `tryParseSpotifyUri`, `parseTimeMmSsToMs`, `formatMsToMmSs`, `parseRosterText`, `selectNextTrack`, `calculateVolumeSteps`, `generatePenaltyScript`, `generateGoalScript`, `generatePkceVerifier`, `generatePkceChallenge`, `exportMatchConfig`, `importMatchConfig`.
- [ ] **L0 Spotify & Ljudmotor (Calm Tech):**
  - *Filer:* `src/services/spotifyAuth.ts`, `src/services/spotifyPlayer.ts`, `src/services/audioController.ts`
  - *Uppgift:* Implementera OAuth 2.0 PKCE-autentisering med token-refresh, Spotify Web Playback SDK (`"Hockey DJ Booth"`), `PUT /v1/me/player/play?device_id={id}`, samt `AudioController` med `playAt`, `duckVolume`, `restoreVolume`, `fadeOutAndPause`, `hardStop` och Web Audio / lokal fallback när Spotify saknas.
- [ ] **L1 Tillstånd & Persistens:**
  - *Fil:* `src/store/useAppStore.ts`
  - *Uppgift:* Implementera Zustand-store synkad mot `localStorage` (`hockey_dj_state_v1`) med actions för lag, spelare, soundpads, rotationsuppdatering, inställningar och JSON-export/import.
- [ ] **L3 UI, SVG-ikoner & Kortkommandon:**
  - *Filer:* `src/components/RefereeIcons.tsx`, `src/components/TopBar.tsx`, `src/components/MatchView.tsx`, `src/components/PenaltyFlowModal.tsx`, `src/components/GoalFlowModal.tsx`, `src/components/SetupView.tsx`, `src/hooks/useKeyboardShortcuts.ts`, `src/App.tsx`, `src/main.tsx`
  - *Uppgift:* Implementera Dark Mode-gränssnittet, 13 skräddarsydda SVG-domartecken, Matchläge (`>= 80x80px` knappar), Utvisningsflödet (Flöde A), Målflödet (Flöde B), Förberedelseläget (Setup inkl. 5s provspelning och snabbimport) samt globala/modala kortkommandon (`Space`, `Shift+Space`, `D`, `0–9`, `Backspace`, `Enter`, `Escape`). Hantera OAuth `/callback`-parametern `code` automatiskt vid sidladdning.

### Fas 3: Kompilerings- & Byggkontroll
- [ ] **Kör Typcheck:** `npx tsc --noEmit` returnerar `0` fel.
- [ ] **Kör Produktionsbygge:** `npm run build` returnerar `0` fel och genererar `dist/`.

---

## 3. Acceptanskriterier & Exit-kriterier för Överlämning
1. Samtliga moduler och UI-flöden i `02_hockey_dj_app_init.md` är implementerade i `/home/ma-auto/DEV/HockeyJockey/src/`.
2. `npx tsc --noEmit` och `npm run build` passerar med `exit code 0`.
3. Inga kodblock har skrivits ut i chattens slutrapport; endast verifierade filvägar och byggresultat rapporteras.
