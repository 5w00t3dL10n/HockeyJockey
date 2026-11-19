# Task: 07_oracle_away_goal_and_metadata (Task V2)
Status: READY_TO_EXECUTE
Tilldelad Roster-Profil: Agent-Oracle
Tilldelad Modell & Tier: Gemini 4 Neon (High)
Exekveringsmiljö: [x] Sandbox Mode (Auto-Approve)

---

## 1. Obligatorisk Pre-Flight Guardrail (Mental Självverifiering)

> [!CAUTION]
> **TILLSTÅNDSLÅSNING FÖR SUB-AGENTEN:**  
> 1. *"Jag agerar i rollen som Agent-Oracle med tilldelad modell Gemini 4 Neon (High)."*
> 2. *"Jag har READ-ONLY tillgång till `07_oracle_away_goal_and_metadata_init.md` och får ALDRIG ändra filer i `src/`, `vite.config.ts`, `package.json` eller `*_init.md`."*
> 3. *"Jag skriver endast under `/home/ma-auto/DEV/HockeyJockey/tests/` autonomt via filverktyg."*
> 4. *"Jag exekverar `/home/ma-auto/DEV/bin/invoke-v2-gate` i Sandbox Mode och bifogar hela `.gate_telemetry.json` i min slutrapport."*

---

## 2. Exekveringssteg

### Fas 1: Förberedelser
- [ ] **Läs Sacred Truth:** Läs `/home/ma-auto/DEV/blueprints/HockeyJockey/07_oracle_away_goal_and_metadata_init.md` samt exporterade signaturer i `src/utils/domain.ts`, `src/services/spotifyMetadata.ts` och `src/store/useAppStore.ts` (strikt read-only).

### Fas 2: Utöka Stage 2 & Stage 4 Tester
- [ ] **Stage 2 (`tests/test_unit_domain.py`):** Behåll befintliga 9 tester och lägg till enhetstester för `extractSpotifyTrackId`, `parseSpotifyMetadataPayload` och `awayGoalSilence` i `sanitizeMatchConfig`.
- [ ] **Stage 4 (`tests/oracle_hockeyjockey.py`):** Behåll befintliga kontroller och lägg till verifiering av `awayGoalSilence` i `useAppStore` + `MatchProfile`-växling + JSON-rundresa samt `fetchSpotifyTrackMetadata`.

### Fas 3: Systemtvingad Verifiering
- [ ] **Kör Gate Runner:** Exekvera från `/home/ma-auto/DEV/HockeyJockey`:
  `/home/ma-auto/DEV/bin/invoke-v2-gate --project "HockeyJockey" --required-tools "git,node,npm,python,gh" --oracle-script "tests/oracle_hockeyjockey.py"`
- [ ] **Kontrollera `.gate_telemetry.json`:** Bekräfta `"overall_status": "VERIFIED"` och `"exit_code": 0`.

---

## 3. Acceptanskriterier
1. Samtliga tester i Stage 2 och Stage 4 passerar utan ändringar i `src/`.
2. `invoke-v2-gate` returnerar `exit code 0`.
3. Hela innehållet i `.gate_telemetry.json` bifogas i slutrapporten.
