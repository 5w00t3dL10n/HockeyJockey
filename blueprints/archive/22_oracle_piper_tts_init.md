# Init Blueprint: 22_oracle_piper_tts
**Target Project:** HockeyJockey (`/home/ma-auto/DEV/HockeyJockey`)
**Author:** Lead Architect (UEF-V2)
**Ansvarig Executor:** `Agent-Oracle` (`Gemini 4 Neon (High)`) -> `Agent-IO` (`Gemini 3.8 Flash (Low)`)
**Status:** LOCKED / SACRED TRUTH (READ-ONLY för utvecklings- och testagenter)

---

## 1. Systemöversikt & Kvantifierat Funktionsorakel
Detta uppdrag verifierar hela **Piper TTS + Smart samspel med ljudmotorn** i både Stage 2 (enhetstester för ren domänlogik) och Stage 4 (system- och integrationsobjective via `invoke-v2-gate`) samt paketerar leveransen till GitHub och startar om dev-servern.

### Kvantifierade Orakelkontroller (Utöver befintliga kontroller 1–22)
1. **Stage 2 (`tests/test_unit_domain.py`):**
   - `PIPER_VOICE_IDS` / `isValidPiperVoiceId`: godkänner `'sv_SE-nst-medium'` & `'sv_SE-lisa-medium'`, avvisar ogiltiga/path-traversal-strängar (`'../etc/passwd'`, `''`, `'en_US'`).
   - `calculatePiperLengthScale`: verifierar `1.0 -> 1.0`, `1.25 -> 0.8`, `0.5 -> 2.0`, `2.0 -> 0.5`, klampning av extremvärden (`0.1 -> 2.0`, `5.0 -> 0.5`) samt noll/NaN-säkerhet (`0 -> 1.0`, `NaN -> 1.0`).
   - `sanitizeSettings` & `sanitizeMatchProfile` & `sanitizeMatchConfig`: verifierar bakåtkompatibilitet när äldre JSON saknar `tts*`-fält samt klampning av ogiltiga värden.
2. **Stage 4 (`tests/oracle_hockeyjockey.py`):**
   - **Kontroll A (Offline Piper CLI & Röstmodeller):** Verifierar att `/home/ma-auto/.local/share/piper/piper/piper` + både `sv_SE-nst-medium.onnx` och `sv_SE-lisa-medium.onnx` kan syntetisera svensk hockeytext headlessly (`exit code 0`, `RIFF` + `WAVE` header, `> 10 000` bytes) med rena tempfiler.
   - **Kontroll B (Smart Samspel: `TtsService` + `AudioController` i kompilerad TS/ESM):**
     - När musik spelas på volym `1.0` och `ttsService.speak(...)` anropas med `duckVolume = 0.25` och `ttsRestoreMusicAfter = true`, ska `audioController.duckVolume` köras och sänka volymen till `0.25` **före** TTS-ljudet spelas, och `audioController.restoreVolume` höja volymen tillbaka mot `1.0` **efter** att TTS avslutas.
     - När `/api/tts` returnerar `HTTP 503`, ska `TtsService` falla över till Web Speech (`usedFallback === true`) utan krasch och ändå utföra `restoreVolume` efter avslutat tal.
     - När `ttsRestoreMusicAfter === false`, ska `restoreVolume` **inte** anropas automatiskt efter talet.
     - När `ttsService.stop()` anropas under pågående tal ska talet avbrytas och senkommen `restoreVolume` från det avbrutna talet inte köras.
   - **Kontroll C (Statisk + Schema- & Profilrundtur):** Verifierar att `tts*`-inställningar överlever `MatchProfile`- och JSON-export/import-rundtur samt att Vite-endpoints `/api/tts/status` och `/api/tts` finns registrerade och typade i `vite.config.ts` och UI-komponenterna.

---

## 2. Tech Stack & Triage-routing
- **Testdesign & Gate-exekvering:** `Agent-Oracle` (`Gemini 4 Neon (High)`). Strikt förbjuden att röra `src/`, `vite.config.ts`, `package.json` eller `*_init.md`.
- **Arkivering, Git Push & Dev Server Restart:** `Agent-IO` (`Gemini 3.8 Flash (Low)`). Startas **endast efter** att `Agent-Oracle` rapporterat `overall_status: "VERIFIED"` och `exit_code: 0`.
