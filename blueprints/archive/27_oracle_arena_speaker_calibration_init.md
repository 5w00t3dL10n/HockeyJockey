# Init Blueprint: 27_oracle_arena_speaker_calibration
**Target Project:** HockeyJockey (`/home/ma-auto/DEV/HockeyJockey`)
**Author:** Lead Architect (UEF-V2)
**Ansvarig Executor:** `Agent-Oracle` (`Gemini 4 Neon (High)`) -> `Agent-Lab` (`Gemini 4 Neon (Medium)`) -> `Agent-IO` (`Gemini 3.8 Flash (Low)`)
**Status:** LOCKED / SACRED TRUTH (READ-ONLY för utvecklings- och testagenter)

---

## 1. Systemöversikt & Kvantifierat Funktionsorakel
Detta uppdrag verifierar samtliga akustiska och prosodiska kalibreringar från Modul 26 i Stage 2 + Stage 4 via `invoke-v2-gate`, kompletterat med akustisk klippnings-/pausverifiering av `Agent-Lab` samt arkivering, Git-push och live dev-serveromstart via `Agent-IO`.

### Kvantifierade Orakelkontroller
1. **Stage 2 (`tests/test_unit_domain.py`):**
   - `formatTextForArenaProsody`: behåller `"nummer 12, Emil Lindblom"` utan mitt-i-frasen-punkt, sätter paus före `"Målskytt"`, `"Framspelad av"`, `"2 minuter för"` och normaliserar `"Hockey"` → `"Håcki"`, `"Ishockey"` → `"Ishåcki"`.
   - `calculatePiperProsodyParams`: takar `noiseScale <= 0.86` och `noiseW <= 0.86` över hela reglageintervallet `[0.3, 1.2]`, applicerar `0.84` på `lengthScale` och `0.65` på `sentenceSilence` för `voiceId: 'sv_SE-nst-medium'`, samt behåller standardskalning för `Alma`/`Lisa`/utelämnat `voiceId`.
   - `computeTtsDspChainConfig`: verifierar `reverbHighpassHz: 280`, `reverbLowpassHz: 2600`, `highpassHz: 145` för NST (`125` för Alma/Lisa), `wetMix = clampedMix * 0.45` och `dryMix = 1.0 - clampedMix * 0.18`.
   - `DEFAULT_SETTINGS`, `DEFAULT_MATCH_PROFILES`, `sanitizeSettings`, `sanitizeMatchProfile` med de nya kalibrerade standardvärdena (`0.45`, `0.72`, `0.22`).
2. **Stage 4 (`tests/oracle_hockeyjockey.py`):**
   - Verifierar `TtsService.speak` + `AudioController` med det nya prosodi-/uttalskontraktet (`voiceId` i `calculatePiperProsodyParams` och `playWav`, kalibrerad text utan mittpunkt och med `Håcki`, samt `duckVolume -> speak -> restoreVolume`).
   - Verifierar `invoke-v2-gate` komplett med `STAGE_0`–`STAGE_4` `PASS`, `"overall_status": "VERIFIED"`, `exit_code: 0`.
