# Task Contract: 27_oracle_arena_speaker_calibration
**Init Reference:** [27_oracle_arena_speaker_calibration_init.md](file:///home/ma-auto/DEV/blueprints/HockeyJockey/27_oracle_arena_speaker_calibration_init.md)
**Assigned Sub-Agents:**
1. `Agent-Oracle` (`Gemini 4 Neon (High)`) — Testuppdatering + Gate Runner (`Fas 1–3`)
2. `Agent-IO` (`Gemini 3.8 Flash (Low)`) — Arkivering, Git Push & Live Dev Server Omstart (`Fas 4–5`, körs först efter VERIFIED Gate + akustisk verifikation)
**Execution Mode:** Sandbox Mode

---

## Pre-Flight Guardrail (OBLIGATORISK för `Agent-Oracle`)
- Du FÅR **INTE** modifiera några filer under `src/`, `vite.config.ts`, `package.json` eller `blueprints/`.
- Läs relevanta tester i `tests/test_unit_domain.py`, `tests/oracle_hockeyjockey.py` samt de uppdaterade funktionerna i `src/utils/domain.ts`, `src/services/ttsService.ts`, `src/data/defaults.ts` och `src/components/SetupView.tsx` innan du uppdaterar testerna.

---

## Sekventiella Faser

### Fas 1: Uppdatera & Utöka Stage 2 Enhetstester (`tests/test_unit_domain.py`) (`Agent-Oracle`)
1. Uppdatera befintliga påståenden i `test_27`, `test_28`, `test_29`, `test_30` till de kalibrerade kontrakten (frasering utan mittpunkt + `"Håcki"`, `noiseScale <= 0.86`, `noiseW <= 0.86`, NST-kompensation `0.84` / `0.65`, `reverbHighpassHz: 280`, `reverbLowpassHz: 2600`, `highpassHz: 145`/`125`, `wetMix = mix * 0.45`, `dryMix = 1 - mix * 0.18`, standardvärden `0.45`/`0.72`/`0.22`).
2. Lägg till riktade enhetstester för:
   - Uttalslexikon (`Hockey` -> `Håcki`, `Sundsvall Hockey!` -> `Sundsvall Håcki!`, `ishockey` -> `ishåcki`).
   - VITS sweet-spot komprimering när användaren ställer reglaget på `1.20` (`noiseScale === 0.86`).
   - NST-kompensation vs Alma/Lisa.

### Fas 2: Uppdatera Stage 4 Orakel (`tests/oracle_hockeyjockey.py`) (`Agent-Oracle`)
1. Uppdatera `Oracle 24` och `Oracle 27` så förväntad `spokenText`, `sentenceSilence`, `noiseScale`, `noiseW` och `voiceId` i `playWav` matchar det kalibrerade kontraktet, samtidigt som `duckVolume -> speak -> restoreVolume` testas fullt ut.
2. Kontrollera statiskt att `convolver.normalize = false`, `reverbHighpass`, `reverbLowpass` och knappen **"Återställ optimal Arena-kalibrering"** finns på plats.

### Fas 3: Gate Runner-Exekvering (`Agent-Oracle`)
Kör inifrån `/home/ma-auto/DEV/HockeyJockey`:
`/home/ma-auto/DEV/bin/invoke-v2-gate --project "HockeyJockey" --required-tools "git,node,npm,python,gh" --oracle-script "tests/oracle_hockeyjockey.py"`
Bekräfta att `STAGE_0`–`STAGE_4` alla visar `PASS`, `"overall_status": "VERIFIED"`, `exit_code: 0`. Rensa `tests/__pycache__/` utan att påverka `.gate_telemetry.json`.

### Fas 4: Arkivering & Git Push (`Agent-IO`, efter godkänd Gate & akustisk kontroll)
1. Arkivera `26_*` och `27_*` till `/home/ma-auto/DEV/ai-master-config/blueprints/archive/HockeyJockey/` och `/home/ma-auto/DEV/HockeyJockey/blueprints/archive/`.
2. Committa i `/home/ma-auto/DEV/ai-master-config/`.
3. Rensa ev. `tests/__pycache__/`, committa och pusha allt i `/home/ma-auto/DEV/HockeyJockey` till `origin main`.

### Fas 5: Dev Server Omstart & Live HTTP-verifiering (`Agent-IO`)
1. Stoppa föregående dev-server på `5173` (`/tmp/hockeyjockey-dev.pid`) och starta ny fristående Vite dev-server på `http://127.0.0.1:5173/`.
2. Verifiera live `HTTP 200` på `/`, `/api/tts/status` och `POST /api/tts`.

---

## Stoppregler
- **Anti-Loop Circuit Breaker:** Om `invoke-v2-gate` misslyckas 2 gånger i rad p.g.a. fel i `src/` eller `vite.config.ts` – STOPPA, rapportera `TRIAGE_DIAGNOSTICS_REQUIRED` så Master Coordinator routar till `Agent-Lab`. Redigera ALDRIG `src/` själv.

---

## Definition of Done (DoD)
- `invoke-v2-gate` passerar komplett med `"overall_status": "VERIFIED"` och `exit_code: 0`.
- Ritningar `26_*`–`27_*` arkiverade, git-push till `origin/main` genomförd och dev-servern kör live.
