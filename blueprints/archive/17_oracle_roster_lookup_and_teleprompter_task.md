# Task: 17_oracle_roster_lookup_and_teleprompter (Task V2)
Status: READY_TO_EXECUTE
Tilldelad Roster-Profil: Agent-Oracle
Tilldelad Modell & Tier: Gemini 4 Neon (High)
Exekveringsmiljö: [x] Sandbox Mode (Auto-Approve)

---

## 1. Obligatorisk Pre-Flight Guardrail

> [!CAUTION]
> 1. *"Jag agerar i rollen som Agent-Oracle med tilldelad modell Gemini 4 Neon (High)."*
> 2. *"Jag har READ-ONLY tillgång till `17_oracle_roster_lookup_and_teleprompter_init.md` och får ALDRIG ändra `src/`, `package.json` eller `*_init.md`."*
> 3. *"Jag skriver endast under `/home/ma-auto/DEV/HockeyJockey/tests/` autonomt via filverktyg."*
> 4. *"Jag kör `/home/ma-auto/DEV/bin/invoke-v2-gate` i Sandbox Mode och bifogar hela `.gate_telemetry.json` i slutrapporten."*

---

## 2. Exekveringssteg
- [ ] **Läs Sacred Truth:** Läs `/home/ma-auto/DEV/blueprints/HockeyJockey/17_oracle_roster_lookup_and_teleprompter_init.md` samt exporterade signaturer i `src/utils/domain.ts`, `src/data/defaults.ts` och `src/store/useAppStore.ts`.
- [ ] **Utöka Stage 2 (`tests/test_unit_domain.py`):** Lägg till enhetstester för `normalizeJerseyNumber`, `lookupPlayerName`, utökad `parseRosterText` och robust `generateGoalScript`/`generatePenaltyScript`.
- [ ] **Utöka Stage 4 (`tests/oracle_hockeyjockey.py`):** Lägg till orakelkontroll för utökade `DEFAULT_TEAMS` (`#12`, `#6`, `#22`, `#00`), `upsertPlayer`-normalisering och talmanus med spelarnamn från lagets roster.
- [ ] **Kör Gate Runner:** Exekvera `/home/ma-auto/DEV/bin/invoke-v2-gate --project "HockeyJockey" --required-tools "git,node,npm,python,gh" --oracle-script "tests/oracle_hockeyjockey.py"` från `/home/ma-auto/DEV/HockeyJockey`.
- [ ] **Rapportera Telemetri:** Läs och bifoga hela `/home/ma-auto/DEV/HockeyJockey/.gate_telemetry.json`.
