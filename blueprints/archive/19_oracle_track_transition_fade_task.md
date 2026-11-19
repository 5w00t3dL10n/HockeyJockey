# Task: 19_oracle_track_transition_fade (Task V2)
Status: READY_TO_EXECUTE
Tilldelad Roster-Profil: Agent-Oracle
Tilldelad Modell & Tier: Gemini 4 Neon (High)
Exekveringsmiljö: [x] Sandbox Mode (Auto-Approve)

---

## 1. Obligatorisk Pre-Flight Guardrail

> [!CAUTION]
> 1. *"Jag agerar i rollen som Agent-Oracle med tilldelad modell Gemini 4 Neon (High)."*
> 2. *"Jag har READ-ONLY tillgång till `19_oracle_track_transition_fade_init.md` och får ALDRIG ändra `src/`, `package.json` eller `*_init.md`."*
> 3. *"Jag skriver endast under `/home/ma-auto/DEV/HockeyJockey/tests/` autonomt via filverktyg."*
> 4. *"Jag kör `/home/ma-auto/DEV/bin/invoke-v2-gate` i Sandbox Mode och bifogar hela `.gate_telemetry.json` i slutrapporten."*

---

## 2. Exekveringssteg
- [ ] **Läs Sacred Truth:** Läs `/home/ma-auto/DEV/blueprints/HockeyJockey/19_oracle_track_transition_fade_init.md` samt `src/services/audioController.ts` och `src/utils/domain.ts`.
- [ ] **Utöka Stage 2 (`tests/test_unit_domain.py`):** Lägg till enhetstest för `crossfadeEnabled` och `crossfadeDurationMs` i `sanitizeMatchConfig` och `sanitizeMatchProfile`.
- [ ] **Utöka Stage 4 (`tests/oracle_hockeyjockey.py`):** Lägg till orakelkontroll för tvåfasig Fade Out / Fade In i `AudioController.playAt()` (från tystnad, under pågående uppspelning inkl. källbyte, och med `fadeWhenPlaying: false`).
- [ ] **Kör Gate Runner:** Exekvera `/home/ma-auto/DEV/bin/invoke-v2-gate --project "HockeyJockey" --required-tools "git,node,npm,python,gh" --oracle-script "tests/oracle_hockeyjockey.py"` från `/home/ma-auto/DEV/HockeyJockey`.
- [ ] **Rapportera Telemetri:** Läs och bifoga hela `/home/ma-auto/DEV/HockeyJockey/.gate_telemetry.json`.
