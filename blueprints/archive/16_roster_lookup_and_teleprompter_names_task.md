# Task: 16_roster_lookup_and_teleprompter_names (Task V2)
Status: READY_TO_EXECUTE
Tilldelad Roster-Profil: Agent-Logic
Tilldelad Modell & Tier: Claude Sonnet 5.5 (Medium)
Exekveringsmiljö: [x] Sandbox Mode (Auto-Approve)

---

## 1. Obligatorisk Pre-Flight Guardrail

> [!CAUTION]
> 1. *"Jag agerar i rollen som Agent-Logic med tilldelad modell Claude Sonnet 5.5 (Medium)."*
> 2. *"Jag har READ-ONLY tillgång till `16_roster_lookup_and_teleprompter_names_init.md` och får ALDRIG ändra den."*
> 3. *"Jag modifierar endast filer under `/home/ma-auto/DEV/HockeyJockey/src/` autonomt via filverktyg (inga kodblock i chatten)."*
> 4. *"Jag rör INTE `tests/` och verifierar med `npx tsc --noEmit && npm run build` (exit code 0)."*

---

## 2. Exekveringssteg
- [ ] **Läs Sacred Truth:** Läs `/home/ma-auto/DEV/blueprints/HockeyJockey/16_roster_lookup_and_teleprompter_names_init.md`, `src/utils/domain.ts`, `src/data/defaults.ts`, `src/store/useAppStore.ts`, `src/components/GoalFlowModal.tsx`, `src/components/PenaltyFlowModal.tsx` och `src/App.tsx`.
- [ ] **Domänlogik (`src/utils/domain.ts`):** Implementera `normalizeJerseyNumber`, `lookupPlayerName`, utökad `parseRosterText`, robust `generateGoalScript`/`generatePenaltyScript` med roster-fallback & alias-platshållare samt normaliserad nyckelhantering i `sanitizeTeam` (fortsatt 100 % fri från DOM/`window`/`localStorage`).
- [ ] **Standardtrupper & Store (`src/data/defaults.ts`, `src/store/useAppStore.ts`):** Utöka standardtrupperna (inkl. `#6`, `#12`, etc. med bevarade befintliga spelare) samt normalisera nummer i `upsertPlayer`.
- [ ] **Modal-UI (`src/components/GoalFlowModal.tsx`, `src/components/PenaltyFlowModal.tsx`, `src/App.tsx`):** Inför `lookupPlayerName`, klickbara spelarchips (*Snabbval ur truppen*), direkt namninmatning/komplettering som sparar till lagets trupp via `onUpsertPlayer`, samt säkerställ att inmatade nummer och uppslagna namn alltid följer med till talmanuset.
- [ ] **Verifiering:** Kör `npx tsc --noEmit && npm run build` (exit code `0`).
