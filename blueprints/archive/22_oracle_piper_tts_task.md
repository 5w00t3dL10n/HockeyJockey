# Task Contract: 22_oracle_piper_tts
**Init Reference:** [22_oracle_piper_tts_init.md](file:///home/ma-auto/DEV/blueprints/HockeyJockey/22_oracle_piper_tts_init.md)
**Assigned Sub-Agents:**
1. `Agent-Oracle` (`Gemini 4 Neon (High)`) — Testutökning + Gate Runner (`Fas 1–3`)
2. `Agent-IO` (`Gemini 3.8 Flash (Low)`) — Arkivering, Git Push & Dev Server Omstart (`Fas 4–5`, startas av Master Coordinator först efter VERIFIED Gate)
**Execution Mode:** Sandbox Mode

---

## Pre-Flight Guardrail (OBLIGATORISK för `Agent-Oracle`)
- Du FÅR **INTE** modifiera några filer under `src/`, `vite.config.ts`, `package.json` eller `*_init.md` / `*_task.md`.
- Läs slutet av `tests/test_unit_domain.py`, slutet av `tests/oracle_hockeyjockey.py`, `src/utils/domain.ts`, `src/services/ttsService.ts` och `vite.config.ts` så att alla exakta symbolnamn stämmer innan du skriver tester.
- All slutlig verifiering sker via:
  `/home/ma-auto/DEV/bin/invoke-v2-gate --project "HockeyJockey" --required-tools "git,node,npm,python,gh" --oracle-script "tests/oracle_hockeyjockey.py"`

---

## Sekventiella Faser

### Fas 1: Utöka Stage 2 Enhetstester (`tests/test_unit_domain.py`) (`Agent-Oracle`)
Lägg till enhetstester i `tests/test_unit_domain.py` som kompilerar/kör `src/utils/domain.ts` och verifierar:
1. `PIPER_VOICE_IDS` & `isValidPiperVoiceId` för giltiga och ogiltiga ID:n.
2. `calculatePiperLengthScale` för `1.0`, `1.25`, `0.5`, `2.0`, klampning samt `0`/`NaN`.
3. Bakåtkompatibel `sanitizeSettings`, `sanitizeMatchProfile` och `sanitizeMatchConfig` när `tts*`-fält saknas respektive innehåller ogiltiga värden.

### Fas 2: Utöka Stage 4 Funktionsorakel (`tests/oracle_hockeyjockey.py`) (`Agent-Oracle`)
Lägg till deterministiska kontroller i `tests/oracle_hockeyjockey.py`:
1. Verifiera lokal Piper CLI-syntes (`sv_SE-nst-medium` och `sv_SE-lisa-medium`) -> RIFF/WAVE `> 10 000` bytes (och städa upp tempfiler).
2. Verifiera `TtsService` + `AudioController` i Node/ESM:
   - Sekvensordning: `duckVolume` -> `speak` -> `restoreVolume` vid spelande musik.
   - Calm Tech Web Speech fallback vid simulerad HTTP 503 från `/api/tts`.
   - `ttsRestoreMusicAfter: false` hoppar över återställning.
   - `stop()` avbryter sekvensen rent utan senkommen `restoreVolume`.
3. Verifiera att `tts*`-inställningar bevaras genom `DEFAULT_SETTINGS` och `MatchProfile`/JSON-rundtur samt att `/api/tts/status`, `/api/tts` och UI-knappar finns implementerade.

### Fas 3: Gate Runner-Exekvering (`Agent-Oracle`)
Kör:
`/home/ma-auto/DEV/bin/invoke-v2-gate --project "HockeyJockey" --required-tools "git,node,npm,python,gh" --oracle-script "tests/oracle_hockeyjockey.py"`
Säkerställ att `STAGE_0` till `STAGE_4` alla visar `PASS`, `"overall_status": "VERIFIED"`, `exit_code: 0`. Rensa eventuella kvarvarande temporära kataloger i `/tmp` och `tests/__pycache__` om lämpligt (utan att bryta `.gate_telemetry.json`).

### Fas 4: Arkivering & Git Push (`Agent-IO`, efter godkänd Gate)
1. Arkivera `20_*`, `21_*` och `22_*` från `/home/ma-auto/DEV/blueprints/HockeyJockey/` till `/home/ma-auto/DEV/ai-master-config/blueprints/archive/HockeyJockey/` samt `/home/ma-auto/DEV/HockeyJockey/blueprints/archive/`.
2. Committa arkiveringen i `/home/ma-auto/DEV/ai-master-config/`.
3. Rensa `tests/__pycache__/`, lägg till och committa samtliga ändringar i `/home/ma-auto/DEV/HockeyJockey` och kör `git push origin main`.

### Fas 5: Dev Server Omstart & Live HTTP/TTS Smoke-Check (`Agent-IO`)
1. Stoppa tidigare dev-server på port `5173` (`/tmp/hockeyjockey-dev.pid` / process på `5173`).
2. Starta ny fristående Vite dev-server i `/home/ma-auto/DEV/HockeyJockey` (`nohup npm run dev -- --host 127.0.0.1 --port 5173 > /tmp/hockeyjockey-dev.log 2>&1 < /dev/null &`) och spara PID i `/tmp/hockeyjockey-dev.pid`.
3. Verifiera live:
   - `GET http://127.0.0.1:5173/` -> `HTTP 200`
   - `GET http://127.0.0.1:5173/api/tts/status` -> `HTTP 200` JSON med `"available": true` och båda rösterna tillgängliga
   - `POST http://127.0.0.1:5173/api/tts` med `{"text":"Mål för hemmalaget!","voiceId":"sv_SE-nst-medium","rate":1.0}` -> `HTTP 200`, `Content-Type: audio/wav`, RIFF/WAVE `> 10 000` bytes.

---

## Stoppregler
- **Anti-Loop Circuit Breaker:** Om `invoke-v2-gate` misslyckas 2 gånger i rad p.g.a. fel i `src/` eller `vite.config.ts` – STOPPA, rapportera `TRIAGE_DIAGNOSTICS_REQUIRED` så Master Coordinator kan routa till `Agent-Lab`. Redigera ALDRIG `src/` själv.

---

## Definition of Done (DoD)
- `invoke-v2-gate` har kört komplett efter sista ändringen med `exit code 0` och `"overall_status": "VERIFIED"`.
- Samtliga blueprints `20_*`–`22_*` är arkiverade och git-pushen till `origin/main` lyckades.
- Dev-servern kör på `http://127.0.0.1:5173` och levererar både status-JSON och riktig svensk WAV-syntes live.
