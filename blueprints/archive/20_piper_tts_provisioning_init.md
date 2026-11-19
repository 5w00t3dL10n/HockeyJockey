# Init Blueprint: 20_piper_tts_provisioning
**Target Project:** HockeyJockey (`/home/ma-auto/DEV/HockeyJockey`)
**System Workspace:** `/home/ma-auto/.local/share/piper/` (utanför Git-repot)
**Author:** Lead Architect (UEF-V2)
**Ansvarig Executor:** `Agent-IO` (`Gemini 3.8 Flash (Low)`)
**Status:** LOCKED / SACRED TRUTH (READ-ONLY för utvecklings- och testagenter)

---

## 1. Systemöversikt & Arkitektur (Nivå 1 & Nivå 2 Provisioning)
Detta uppdrag etablerar **Piper TTS** som ett lokalt, offline-kompatibelt, noll-token neuralt talsyntesverktyg (VITS/ONNX) på Linux-värden för HockeyJockey.

Eftersom ONNX-röstmodeller och kompilerade binärer är stora (~60–75 MB per röst) ska de **inte** läggas i projektets Git-repository under `/home/ma-auto/DEV/HockeyJockey/`. All installation sker i användarens lokala verktygskatalog:
- Rotkatalog: `/home/ma-auto/.local/share/piper/`
- Binärkatalog: `/home/ma-auto/.local/share/piper/piper/` (innehåller körbar `piper` samt medföljande `.so`-bibliotek som `libpiper_phonemize.so`, `libonnxruntime.so`, `espeak-ng-data`).
- PATH-exponering: `/home/ma-auto/.local/bin/piper` (symlink eller wrapper som säkerställer `LD_LIBRARY_PATH=/home/ma-auto/.local/share/piper/piper`).
- Röstkatalog: `/home/ma-auto/.local/share/piper/voices/`

### Installerade Svenska Röstmodeller
1. **`sv_SE-nst-medium`** (Man/Neutral svensk speakerröst)
   - Modell: `/home/ma-auto/.local/share/piper/voices/sv_SE-nst-medium.onnx`
   - Konfig: `/home/ma-auto/.local/share/piper/voices/sv_SE-nst-medium.onnx.json`
2. **`sv_SE-lisa-medium`** (Kvinna svensk speakerröst)
   - Modell: `/home/ma-auto/.local/share/piper/voices/sv_SE-lisa-medium.onnx`
   - Konfig: `/home/ma-auto/.local/share/piper/voices/sv_SE-lisa-medium.onnx.json`

---

## 2. Tech Stack & Tool-First Beslut
- **Nivå 1 / Nivå 2 (OS-Native + curl/tar/file/python3):** All nedladdning, uppackning, rättighetssättning och WAV-validering sker med OS-nativa verktyg via `Agent-IO` (`Gemini 3.8 Flash (Low)`). Ingen custom applikationskod i `src/` får ändras eller skapas i Modul 20.
- **Triage-routing:** `Agent-IO` (`Gemini 3.8 Flash (Low)`).

---

## 3. Gränssnittskontrakt (CLI & Filsystem)
- `/home/ma-auto/.local/share/piper/piper/piper` måste ha körbarhetsbit (`+x`) och kunna syntetisera PCM/WAVE via `--model <path.onnx> --length_scale <float> --output_file <wav_path>`.
- Om Piper stödjer `--output_file -` (stdout RIFF/WAVE) ska det verifieras och rapporteras tydligt i slutrapporten; oavsett ska filbaserad `--output_file <path>` vara 100 % verifierad.
- Inga tunga modellfiler eller temporära `.wav`-filer får lämnas kvar i `/home/ma-auto/DEV/HockeyJockey/`.

---

## 4. Kvantifierat Funktionsorakel (Kriterier för godkänd miljö)
1. Binären `/home/ma-auto/.local/share/piper/piper/piper` existerar och kör `--help` med `exit code 0`.
2. Alla fyra röstfiler (`sv_SE-nst-medium.onnx`, `sv_SE-nst-medium.onnx.json`, `sv_SE-lisa-medium.onnx`, `sv_SE-lisa-medium.onnx.json`) existerar och har rimlig storlek (`> 50 MB` för `.onnx`, giltig JSON för `.onnx.json`).
3. Båda rösterna genererar giltiga `RIFF`/`WAVE` WAV-filer större än `10 000` bytes för svensk hockeyfras med `exit code 0`.
4. `git status` i `/home/ma-auto/DEV/HockeyJockey` förblir orörd av Modul 20.
