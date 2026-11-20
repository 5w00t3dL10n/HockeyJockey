# Init Blueprint: 23_piper_voice_alma_provisioning
**Target Project:** HockeyJockey (`/home/ma-auto/DEV/HockeyJockey`)
**System Workspace:** `/home/ma-auto/.local/share/piper/voices/` (utanför Git-repot)
**Author:** Lead Architect (UEF-V2)
**Ansvarig Executor:** `Agent-IO` (`Gemini 3.8 Flash (Low)`)
**Status:** LOCKED / SACRED TRUTH (READ-ONLY för utvecklings- och testagenter)

---

## 1. Systemöversikt & Arkitektur (Nivå 1 & Nivå 2 Provisioning)
Detta uppdrag utökar den lokala offline-installationen av Piper TTS med den tredje officiella svenska röstmodellen:
- **`sv_SE-alma-medium`** (Kvinna/Mjuk svensk speakerröst med mildare AI-diskant)
  - Modell: `/home/ma-auto/.local/share/piper/voices/sv_SE-alma-medium.onnx` (~`63,4 MB`)
  - Konfig: `/home/ma-auto/.local/share/piper/voices/sv_SE-alma-medium.onnx.json` (`22 050 Hz`, giltig JSON)

Modellen placeras i användarens lokala katalog `/home/ma-auto/.local/share/piper/voices/` utanför Git-repot `/home/ma-auto/DEV/HockeyJockey/`.

---

## 2. Tech Stack & Tool-First Beslut
- **Nivå 1 / Nivå 2 (OS-Native + curl/python3):** All nedladdning, JSON-validering och CLI WAV-syntesverifiering sker via OS-nativa terminalkommandon genom `Agent-IO` (`Gemini 3.8 Flash (Low)`).
- **Triage-routing:** `Agent-IO` (`Gemini 3.8 Flash (Low)`). Inga källkodsfiler i `/home/ma-auto/DEV/HockeyJockey/` får modifieras i Modul 23.

---

## 3. Gränssnittskontrakt & Flaggverifiering
Verifiera att `/home/ma-auto/.local/share/piper/piper/piper` syntetiserar `sv_SE-alma-medium` med de VITS-prosodiflaggor som Modul 24 använder:
- `--model /home/ma-auto/.local/share/piper/voices/sv_SE-alma-medium.onnx`
- `--length_scale 1.0`
- `--noise_scale 0.75`
- `--noise_w 0.85`
- `--sentence_silence 0.65`
- `--output_file /tmp/piper_test_alma.wav`

Testfras: `"Mål för Sundsvall Hockey! Målskytt: nummer 12. Emil Lindblom."`

---

## 4. Kvantifierat Funktionsorakel
1. `sv_SE-alma-medium.onnx` (`> 40 MB`) och giltig JSON `sv_SE-alma-medium.onnx.json` existerar under `/home/ma-auto/.local/share/piper/voices/`.
2. Offline CLI-syntes med prosodiflaggor returnerar `exit code 0`, giltig `RIFF`/`WAVE`-header (`1 kanal`, `22 050 Hz`, `16-bit`) och filstorlek `> 10 000` bytes.
3. Temporär testfil `/tmp/piper_test_alma.wav` städas bort och `git status` i `/home/ma-auto/DEV/HockeyJockey/` är oförändrad.
