# Task: 10_custom_soundboard_groups (Task V2)
Status: READY_TO_EXECUTE
Tilldelad Roster-Profil: Agent-Logic
Tilldelad Modell & Tier: Claude Sonnet 5.5 (Medium)
Exekveringsmiljö: [x] Sandbox Mode (Auto-Approve)

---

## 1. Obligatorisk Pre-Flight Guardrail

> [!CAUTION]
> 1. *"Jag agerar i rollen som Agent-Logic med tilldelad modell Claude Sonnet 5.5 (Medium)."*
> 2. *"Jag har READ-ONLY tillgång till `10_custom_soundboard_groups_init.md` och får ALDRIG ändra den."*
> 3. *"Jag modifierar endast filer under `/home/ma-auto/DEV/HockeyJockey/src/` autonomt via filverktyg (inga kodblock i chatten)."*
> 4. *"Jag rör INTE `tests/` och verifierar med `npx tsc --noEmit` samt `npm run build` (exit code 0)."*

---

## 2. Exekveringssteg
- [ ] **Läs Sacred Truth:** Läs `/home/ma-auto/DEV/blueprints/HockeyJockey/10_custom_soundboard_groups_init.md`, `src/types/models.ts`, `src/data/defaults.ts`, `src/utils/domain.ts`, `src/store/useAppStore.ts`, `src/components/SetupView.tsx`, `src/components/MatchView.tsx` och `src/App.tsx`.
- [ ] **Typer & Standardgrupper (`src/types/models.ts`, `src/data/defaults.ts`):** Lägg till `BuiltinPadCategory`, utökad `PadCategory`, `SoundboardGroup`, `AppSettings.soundboardGroups`, `EVENT_PAD_CATEGORIES`, `DEFAULT_SOUNDBOARD_GROUPS` och `getPadCategoryLabel`.
- [ ] **Domänlogik (`src/utils/domain.ts`):** Implementera `sanitizeSoundboardGroups` (inkl. självläkande gruppregistrering), uppdatera `sanitizeSoundPads`, `sanitizeSettings`, `sanitizeMatchProfile` och `sanitizeMatchConfig`.
- [ ] **Store (`src/store/useAppStore.ts`):** Implementera `addSoundboardGroup`, `updateSoundboardGroup`, `moveSoundboardGroup`, `deleteSoundboardGroup` (med säker pad-migrering) samt inkludera `soundboardGroups` i `MatchProfile`.
- [ ] **Gränssnitt (`src/components/SetupView.tsx`, `src/components/MatchView.tsx`, `src/App.tsx`):** Bygg grupp-hantering (skapa, döpa om, flytta upp/ner, ta bort), `<optgroup>`-uppdelade kategori-väljare med inline `+ Ny grupp`, samt dynamiska grupprubriker i `MatchView`.
- [ ] **Verifiering:** Kör `npx tsc --noEmit && npm run build` (exit code `0`).
