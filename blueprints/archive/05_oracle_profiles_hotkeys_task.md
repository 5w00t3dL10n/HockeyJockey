# Task: 05_oracle_profiles_hotkeys (Task V2)
Status: READY_TO_EXECUTE
Tilldelad Roster-Profil: Agent-Oracle
Tilldelad Modell & Tier: Gemini 4 Neon (High)
Exekveringsmiljö: [x] Sandbox Mode (Auto-Approve)

---

## 1. Obligatorisk Pre-Flight Guardrail (Mental Självverifiering)

> [!CAUTION]
> **TILLSTÅNDSLÅSNING FÖR SUB-AGENTEN:**  
> 1. *"Jag agerar i rollen som Agent-Oracle med tilldelad modell Gemini 4 Neon (High)."*
> 2. *"Jag har READ-ONLY tillgång till `05_oracle_profiles_hotkeys_init.md` och får ALDRIG ändra filer i `src/`, `package.json` eller `*_init.md`."*
> 3. *"Jag skriver endast under `/home/ma-auto/DEV/HockeyJockey/tests/` autonomt via filverktyg."*
> 4. *"Jag exekverar `/home/ma-auto/DEV/bin/invoke-v2-gate` i Sandbox Mode och bifogar hela `.gate_telemetry.json` i min slutrapport."*

---

## 2. Exekveringssteg

### Fas 1: Förberedelser
- [ ] **Läs Sacred Truth:** Läs `/home/ma-auto/DEV/blueprints/HockeyJockey/05_oracle_profiles_hotkeys_init.md` samt exporterade signaturer i `/home/ma-auto/DEV/HockeyJockey/src/` (strikt read-only mot `src/`).

### Fas 2: Utöka Stage 2 & Stage 4 Tester
- [ ] **Stage 2 (`tests/test_unit_domain.py`):** Behåll befintliga 6 tester och lägg till enhetstester för `normalizeHotkeyString`, `formatHotkeyFromEvent`, `assignHotkey` (inkl. konfliktlösning), `resolveHotkeyMatch` och bakåtkompatibel `sanitizeMatchConfig`.
- [ ] **Stage 4 (`tests/oracle_hockeyjockey.py`):** Behåll befintliga 5 orakelkontroller och lägg till verifiering av `SavedRoster`-bibliotek, `MatchProfile`-växling, `KeyBindings` i `useAppStore`, samt fullständig JSON export/import-rundresa.

### Fas 3: Systemtvingad Verifiering
- [ ] **Kör Gate Runner:** Exekvera från `/home/ma-auto/DEV/HockeyJockey`:
  `/home/ma-auto/DEV/bin/invoke-v2-gate --project "HockeyJockey" --required-tools "git,node,npm,python,gh" --oracle-script "tests/oracle_hockeyjockey.py"`
- [ ] **Kontrollera `.gate_telemetry.json`:** Bekräfta `"overall_status": "VERIFIED"` och `"exit_code": 0`.

---

## 3. Acceptanskriterier
1. Samtliga tester i Stage 2 och Stage 4 passerar utan ändringar i `src/`.
2. `invoke-v2-gate` returnerar `exit code 0`.
3. Hela innehållet i `.gate_telemetry.json` bifogas i slutrapporten.
