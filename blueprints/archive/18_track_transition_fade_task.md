# Task: 18_track_transition_fade (Task V2)
Status: READY_TO_EXECUTE
Tilldelad Roster-Profil: Agent-Logic
Tilldelad Modell & Tier: Claude Sonnet 5.5 (Medium)
Exekveringsmiljö: [x] Sandbox Mode (Auto-Approve)

---

## 1. Obligatorisk Pre-Flight Guardrail

> [!CAUTION]
> 1. *"Jag agerar i rollen som Agent-Logic med tilldelad modell Claude Sonnet 5.5 (Medium)."*
> 2. *"Jag har READ-ONLY tillgång till `18_track_transition_fade_init.md` och får ALDRIG ändra den."*
> 3. *"Jag modifierar endast filer under `/home/ma-auto/DEV/HockeyJockey/src/` autonomt via filverktyg (inga kodblock i chatten)."*
> 4. *"Jag rör INTE `tests/` och verifierar med `npx tsc --noEmit && npm run build` (exit code 0)."*

---

## 2. Exekveringssteg
- [ ] **Läs Sacred Truth:** Läs `/home/ma-auto/DEV/blueprints/HockeyJockey/18_track_transition_fade_init.md`, `src/types/models.ts`, `src/data/defaults.ts`, `src/utils/domain.ts`, `src/store/useAppStore.ts`, `src/services/audioController.ts`, `src/App.tsx` och `src/components/SetupView.tsx` (samt läs `tests/oracle_hockeyjockey.py` read-only vid behov så inga befintliga orakelkontroller bryts).
- [ ] **Inställningar & Store (`models.ts`, `defaults.ts`, `domain.ts`, `useAppStore.ts`):** Lägg till och sanera `crossfadeEnabled` (`true`) och `crossfadeDurationMs` (`350`, klampat `[0, 5000]`) i `AppSettings`, `DEFAULT_SETTINGS`, `MatchProfile` och `sanitizeMatchConfig`.
- [ ] **Tvåfasig övergång i `AudioController` (`src/services/audioController.ts`):** Implementera `transitionOptions` i `playAt()` med Fas A (fade out av pågående ljudkälla till `0.0`), Fas B (källbyte + start av nya låten på `0.0`), Fas C (fade in till `safeVolume`) och Fas D (`previewMs`), med `requestSeq`-skydd och 0 ms start från tystnad.
- [ ] **Koppling & UI (`src/App.tsx`, `src/components/SetupView.tsx`):** Skicka övergångsinställningar från `App.tsx` till `audioController.playAt(...)` och lägg till inställningskontroll i `SetupView.tsx`.
- [ ] **Verifiering:** Kör `npx tsc --noEmit && npm run build` (exit code `0`).
