# Task: 04_profiles_rosters_hotkeys (Task V2)
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
> 2. *"Jag har läst och förstår Sacred Truth i `04_profiles_rosters_hotkeys_init.md`. Jag har READ-ONLY tillgång till `_init.md` och får ALDRIG ändra den."*
> 3. *"Filmodifikation (No-Code-in-Chat): Jag modifierar källkodsfiler autonomt under `/home/ma-auto/DEV/HockeyJockey/src/` utan att mata ut kodblock i chatten."*
> 4. *"Sandbox-First Autonomi: Jag exekverar i Sandbox Mode och verifierar med `npx tsc --noEmit` och `npm run build`."*
> 5. *"Isolering mot Orakel: Jag ändrar INTE filer i `tests/` — de uppdateras oberoende av `Agent-Oracle`."*

---

## 2. Exekveringssteg & Granulära Faser

### Fas 1: Förberedelser & Läsning
- [ ] **Läs Sacred Truth:** Läs `/home/ma-auto/DEV/blueprints/HockeyJockey/04_profiles_rosters_hotkeys_init.md` och granska befintliga filer under `/home/ma-auto/DEV/HockeyJockey/src/`.

### Fas 2: Implementering
- [ ] **Datamodeller (`src/types/models.ts`):** Lägg till `MatchActionId`, `KeyBindings`, `SavedRoster`, `MatchProfile`, `SoundPad.hotkey`, `AppSettings.keyBindings` och utökad `MatchConfigSnapshot`.
- [ ] **Standarddata (`src/data/defaults.ts`):** Lägg till `DEFAULT_KEY_BINDINGS`, förifyllt `spotifyClientId` (`35b681ec04634ec3a6a5083ce87216c4`), `DEFAULT_SAVED_ROSTERS` (4 klubbar/trupper inkl. `"00"`) och `DEFAULT_MATCH_PROFILES` (2 profiler för olika åldersgrupper).
- [ ] **Ren Domänlogik (`src/utils/domain.ts`):** Implementera `normalizeHotkeyString`, `formatHotkeyFromEvent`, `assignHotkey`, `resolveHotkeyMatch`, `sanitizeKeyBindings`, `sanitizeSavedRoster`, `sanitizeMatchProfile` samt uppdatera `sanitizeMatchConfig` (bakåtkompatibel + auto-fyllning av `spotifyClientId` om tomt). Håll filen 100 % fri från DOM/`window`/`localStorage`.
- [ ] **Zustand-store (`src/store/useAppStore.ts`):** Implementera `savedRosters`, `matchProfiles`, `activeProfileId` samt samtliga actions för hotkeys, roster-bibliotek och matchprofiler inklusive persistens och JSON export/import.
- [ ] **Kortkommandon & UI (`src/hooks/useKeyboardShortcuts.ts`, `src/components/TopBar.tsx`, `src/components/MatchView.tsx`, `src/components/SetupView.tsx`, `src/App.tsx`):**
  - Dynamisk keybinding-hantering i `useKeyboardShortcuts.ts` (med skydd mot aktiv hotkey-inspelare och fokuserade formulärfält).
  - Snabbväljare för aktiv Matchprofil och Hemmalag/Bortalag från Roster-biblioteket samt dynamiska hotkey-badges på alla knappar i `TopBar.tsx` och `MatchView.tsx`.
  - Matchprofil-hantering, Roster-bibliotek (spara/ladda/duplicera/uppdatera/radera många laguppställningar) och interaktiv tangentinspelning för alla matchfunktioner och soundpads i `SetupView.tsx`.

### Fas 3: Statisk Verifiering
- [ ] **Typcheck:** `npx tsc --noEmit` i `/home/ma-auto/DEV/HockeyJockey` returnerar exit code `0`.
- [ ] **Bygge:** `npm run build` i `/home/ma-auto/DEV/HockeyJockey` returnerar exit code `0`.

---

## 3. Acceptanskriterier
1. Samtliga krav i `04_profiles_rosters_hotkeys_init.md` är implementerade i `src/`.
2. `npx tsc --noEmit` och `npm run build` passerar med `0` fel.
3. Endast verifierade filvägar och byggresultat rapporteras (inga kodblock i chatten).
