# Init Blueprint: 25_oracle_arena_speaker_dsp
**Target Project:** HockeyJockey (`/home/ma-auto/DEV/HockeyJockey`)
**Author:** Lead Architect (UEF-V2)
**Ansvarig Executor:** `Agent-Oracle` (`Gemini 4 Neon (High)`) -> `Agent-IO` (`Gemini 3.8 Flash (Low)`)
**Status:** LOCKED / SACRED TRUTH (READ-ONLY för utvecklings- och testagenter)

---

## 1. Systemöversikt & Kvantifierat Funktionsorakel
Detta uppdrag verifierar hela **Arena Speaker DSP, VITS-prosodituning, Svensk Arena-dramaturgi & `sv_SE-alma-medium`** i Stage 2 + Stage 4 via `invoke-v2-gate`, samt arkiverar ritningarna, pushar till GitHub och verifierar dev-servern live.

### Kvantifierade Orakelkontroller (Utöver befintliga kontroller 1–25)
1. **Stage 2 (`tests/test_unit_domain.py`):**
   - `PIPER_VOICE_IDS` innehåller `'sv_SE-alma-medium'` (totalt 3 svenska röster).
   - `isValidTtsAudioProfile` accepterar `'studio'`, `'booth'`, `'arena_pa'` och avvisar ogiltiga värden.
   - `calculatePiperProsodyParams` verifierar exakt beräkning + klampning för `lengthScale`, `sentenceSilence` (`[0.1, 1.5]`), `noiseScale` (`[0.3, 1.2]`) och `noiseW` (`[0.5, 1.1]`) inklusive `NaN`/noll-säkerhet.
   - `formatTextForArenaProsody` verifierar:
     - `dramaticPauses = true` vs `false`
     - `#12` / `nr 12` -> `nummer 12`
     - `2 min` -> `2 minuter`
     - Komma efter `"nummer 12, Emil Lindblom"` -> dramatisk meningspaus `". "` före spelarnamn och pauser runt `"Målskytt"`, `"Framspelad av"` / `"minuter för"`.
   - `computeTtsDspChainConfig` verifierar exakta skillnader mellan `'studio'` (`bypass: true, wetMix: 0`), `'booth'` (`bypass: false, wetMix: 0, deHarshLowpassHz: 7400`) och `'arena_pa'` (`bypass: false, wetMix > 0, slapbackDelaySec: 0.085, reverbDurationSec: 1.35`) samt klampning av `arenaReverbMix`.
   - Bakåtkompatibel `sanitizeSettings` / `sanitizeMatchProfile` / `sanitizeMatchConfig` när äldre JSON saknar de 6 nya fälten respektive har värden utanför intervall.
2. **Stage 4 (`tests/oracle_hockeyjockey.py`):**
   - **Kontroll A (Offline Piper CLI på `sv_SE-alma-medium` med VITS-prosodi):** Verifierar riktig headless syntes med `/home/ma-auto/.local/share/piper/piper/piper` + `/home/ma-auto/.local/share/piper/voices/sv_SE-alma-medium.onnx` och flaggorna `--sentence_silence 0.65 --noise_scale 0.75 --noise_w 0.85` -> `RIFF`/`WAVE` `> 10 000` bytes (`exit code 0`, ren tempstädning).
   - **Kontroll B (`TtsService` prosodi- & DSP-koordinering mot `AudioController`):** Verifierar i kompilerad TS/ESM att `TtsService.speak()` skickar formaterad `formatTextForArenaProsody`-text samt `sentenceSilence`, `noiseScale`, `noiseW` i POST-body till `/api/tts` och vidarebefordrar `audioProfile`, `arenaReverbMix` och `preChimeEnabled` till `audioPlayer.playWav` samtidigt som `duckVolume -> speak -> restoreVolume` mot `AudioController` är intakt.
   - **Kontroll C (Schema-, Profilrundtur & Statisk Wiring):** Verifierar att alla 6 nya `tts*`-fält rundturar i `DEFAULT_SETTINGS`, `MatchProfile` och JSON-export/import, samt att `sv_SE-alma-medium`, prosodiflaggar och UI-reglage finns i `vite.config.ts` och `SetupView.tsx`.

---

## 2. Tech Stack & Triage-routing
- **Testdesign & Gate-exekvering:** `Agent-Oracle` (`Gemini 4 Neon (High)`). Strikt förbjuden att röra `src/`, `vite.config.ts`, `package.json` eller `blueprints/`.
- **Arkivering, Git Push & Dev Server Restart:** `Agent-IO` (`Gemini 3.8 Flash (Low)`). Startas **endast efter** `VERIFIED` och `exit_code: 0` från `Agent-Oracle`.
