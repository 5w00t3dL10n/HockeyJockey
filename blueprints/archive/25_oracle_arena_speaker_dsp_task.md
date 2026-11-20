# Task Contract: 25_oracle_arena_speaker_dsp
**Init Reference:** [25_oracle_arena_speaker_dsp_init.md](file:///home/ma-auto/DEV/blueprints/HockeyJockey/25_oracle_arena_speaker_dsp_init.md)
**Assigned Sub-Agents:**
1. `Agent-Oracle` (`Gemini 4 Neon (High)`) — Testutökning + Gate Runner (`Fas 1–3`)
2. `Agent-IO` (`Gemini 3.8 Flash (Low)`) — Arkivering, Git Push & Dev Server Omstart (`Fas 4–5`, startas av Master Coordinator först efter VERIFIED Gate)
**Execution Mode:** Sandbox Mode

---

## Pre-Flight Guardrail (OBLIGATORISK för `Agent-Oracle`)
- Du FÅR **INTE** modifiera några filer under `src/`, `vite.config.ts`, `package.json` eller `blueprints/`.
- Läs slutet av `tests/test_unit_domain.py`, slutet av `tests/oracle_hockeyjockey.py`, `src/utils/domain.ts`, `src/services/ttsService.ts`, `src/data/defaults.ts` och `vite.config.ts` innan testimplementation.
- Kör slutverifiering inifrån `/home/ma-auto/DEV/HockeyJockey` via:
  `/home/ma-auto/DEV/bin/invoke-v2-gate --project "HockeyJockey" --required-tools "git,node,npm,python,gh" --oracle-script "tests/oracle_hockeyjockey.py"`

---

## Sekventiella Faser

### Fas 1: Utöka Stage 2 Enhetstester (`tests/test_unit_domain.py`) (`Agent-Oracle`)
Lägg till enhetstester i `tests/test_unit_domain.py` för:
1. `PIPER_VOICE_IDS` (inkluderar `'sv_SE-alma-medium'`) och `isValidTtsAudioProfile`.
2. `calculatePiperProsodyParams` (standard, anpassade värden, klampning, noll/NaN-säkerhet).
3. `formatTextForArenaProsody` (dramatisk frasering på/av, `#12`/`nr 12` -> `nummer 12`, `2 min` -> `2 minuter`, paus före spelarnamn och assist/utvisningsorsak).
4. `computeTtsDspChainConfig` (`'studio'`, `'booth'`, `'arena_pa'`, klampning av `arenaReverbMix`).
5. Bakåtkompatibel `sanitizeSettings`, `sanitizeMatchProfile` och `sanitizeMatchConfig` för de 6 nya `tts*`-fälten.

### Fas 2: Utöka Stage 4 Funktionsorakel (`tests/oracle_hockeyjockey.py`) (`Agent-Oracle`)
Lägg till kontroller i `tests/oracle_hockeyjockey.py` för:
1. Verklig offline Piper CLI-syntes med `sv_SE-alma-medium.onnx` och `--sentence_silence 0.65 --noise_scale 0.75 --noise_w 0.85` -> giltig `RIFF`/`WAVE` `> 10 000` bytes (`exit code 0`) med ren tempstädning.
2. `TtsService` + `AudioController` i Node/ESM: verifiera att `TtsService.speak()` skickar formaterad `formatTextForArenaProsody`-text + `sentenceSilence`/`noiseScale`/`noiseW` till `/api/tts` och vidarebefordrar `audioProfile`, `arenaReverbMix`, `preChimeEnabled` till `audioPlayer.playWav` samtidigt som `duckVolume -> speak -> restoreVolume` fungerar.
3. Store/`MatchProfile`/JSON-rundtur för alla 6 nya `tts*`-fält samt statisk kontroll av `sv_SE-alma-medium`, VITS-flaggor och UI-reglage.

### Fas 3: Gate Runner-Exekvering (`Agent-Oracle`)
Kör `invoke-v2-gate` inifrån `/home/ma-auto/DEV/HockeyJockey` och säkerställ `STAGE_0`–`STAGE_4` `PASS`, `"overall_status": "VERIFIED"`, `exit_code: 0`. Rensa `tests/__pycache__/` utan att skada `.gate_telemetry.json`.

### Fas 4: Arkivering & Git Push (`Agent-IO`, efter godkänd Gate)
1. Arkivera `23_*`, `24_*` och `25_*` från `/home/ma-auto/DEV/blueprints/HockeyJockey/` till `/home/ma-auto/DEV/ai-master-config/blueprints/archive/HockeyJockey/` och kopiera till `/home/ma-auto/DEV/HockeyJockey/blueprints/archive/`.
2. Committa i `/home/ma-auto/DEV/ai-master-config/`.
3. Rensa `tests/__pycache__/`, committa och pusha allt i `/home/ma-auto/DEV/HockeyJockey` till `origin main`.

### Fas 5: Dev Server Omstart & Live HTTP/TTS-verifiering (`Agent-IO`)
1. Stoppa föregående dev-server på port `5173` (`/tmp/hockeyjockey-dev.pid`) och starta ny fristående Vite dev-server på `http://127.0.0.1:5173/` (spara PID i `/tmp/hockeyjockey-dev.pid`).
2. Verifiera live:
   - `GET http://127.0.0.1:5173/` -> `HTTP 200`
   - `GET http://127.0.0.1:5173/api/tts/status` -> `HTTP 200` JSON med `"available": true` och samtliga 3 röster (`sv_SE-nst-medium`, `sv_SE-lisa-medium`, `sv_SE-alma-medium`) `"available": true`
   - `POST http://127.0.0.1:5173/api/tts` med `{"text":"Mål för Sundsvall Hockey! Målskytt: nummer 12. Emil Lindblom.","voiceId":"sv_SE-alma-medium","rate":1.0,"sentenceSilence":0.65,"noiseScale":0.75,"noiseW":0.85}` -> `HTTP 200`, `Content-Type: audio/wav`, giltig `RIFF`/`WAVE` `> 10 000` bytes.

---

## Stoppregler
- **Anti-Loop Circuit Breaker:** Om `invoke-v2-gate` misslyckas 2 gånger i rad p.g.a. fel i `src/` eller `vite.config.ts` – STOPPA, rapportera `TRIAGE_DIAGNOSTICS_REQUIRED` så Master Coordinator kan routa till `Agent-Lab`. Redigera ALDRIG `src/` själv.

---

## Definition of Done (DoD)
- `invoke-v2-gate` returnerar `"overall_status": "VERIFIED"` och `exit_code: 0`.
- Ritningar `23_*`–`25_*` arkiverade, git-push till `origin/main` genomförd och ren arbetskatalog.
- Dev-servern kör live på `http://127.0.0.1:5173` och levererar samtliga 3 svenska röster och prosodisyntes.
