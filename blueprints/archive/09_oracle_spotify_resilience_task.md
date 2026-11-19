# Task: 09_oracle_spotify_resilience (Task V2)
Status: READY_TO_EXECUTE
Tilldelad Roster-Profil: Agent-Oracle
Tilldelad Modell & Tier: Gemini 4 Neon (High)
Exekveringsmiljö: [x] Sandbox Mode (Auto-Approve)

---

## 1. Obligatorisk Pre-Flight Guardrail

> [!CAUTION]
> 1. *"Jag agerar i rollen som Agent-Oracle med tilldelad modell Gemini 4 Neon (High)."*
> 2. *"Jag har READ-ONLY tillgång till `09_oracle_spotify_resilience_init.md` och får ALDRIG ändra `src/`, `package.json` eller `*_init.md`."*
> 3. *"Jag skriver endast under `/home/ma-auto/DEV/HockeyJockey/tests/` autonomt via filverktyg."*
> 4. *"Jag kör `/home/ma-auto/DEV/bin/invoke-v2-gate` i Sandbox Mode och bifogar hela `.gate_telemetry.json` i slutrapporten."*

---

## 2. Exekveringssteg
- [ ] **Läs Sacred Truth:** Läs `/home/ma-auto/DEV/blueprints/HockeyJockey/09_oracle_spotify_resilience_init.md` och verifiera exporterade signaturer i `src/services/spotifyPlayer.ts`, `src/services/audioController.ts` och `src/services/spotifyAuth.ts`.
- [ ] **Utöka `tests/oracle_hockeyjockey.py`:** Lägg till verifiering av självläkande `AudioController` (`ensureReady`) samt `SpotifyPlayerService.discoverConnectDevice()` + `'connect'`-transport (`playTrack` 404-retry, `pause`, throttlad `setVolume`). Behåll alla befintliga 11 kontroller intakta.
- [ ] **Kör Gate Runner:** Exekvera `/home/ma-auto/DEV/bin/invoke-v2-gate --project "HockeyJockey" --required-tools "git,node,npm,python,gh" --oracle-script "tests/oracle_hockeyjockey.py"` från `/home/ma-auto/DEV/HockeyJockey`.
- [ ] **Rapportera Telemetri:** Läs och bifoga hela `/home/ma-auto/DEV/HockeyJockey/.gate_telemetry.json`.
