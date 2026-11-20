# Task Contract: 23_piper_voice_alma_provisioning
**Init Reference:** [23_piper_voice_alma_provisioning_init.md](file:///home/ma-auto/DEV/blueprints/HockeyJockey/23_piper_voice_alma_provisioning_init.md)
**Assigned Sub-Agent:** `Agent-IO` (`Gemini 3.8 Flash (Low)`)
**Execution Mode:** Sandbox Mode (OS-Native Provisioning)

---

## Pre-Flight Guardrail (OBLIGATORISK)
- Du FÅR **INTE** ändra eller skapa några filer inuti `/home/ma-auto/DEV/HockeyJockey/`.
- Du FÅR **INTE** ändra denna `_task.md` eller `_init.md`.
- Kontrollera först om filerna redan existerar i `/home/ma-auto/.local/share/piper/voices/` med fullständig storlek innan nedladdning.

---

## Sekventiella Faser

### Fas 1: Ladda ner `sv_SE-alma-medium` till lokal röstkatalog
Ladda ner via `curl -fSL` (om saknad eller ogiltig) till `/home/ma-auto/.local/share/piper/voices/`:
1. `https://huggingface.co/rhasspy/piper-voices/resolve/main/sv/sv_SE/alma/medium/sv_SE-alma-medium.onnx`
2. `https://huggingface.co/rhasspy/piper-voices/resolve/main/sv/sv_SE/alma/medium/sv_SE-alma-medium.onnx.json`

Verifiera filstorlekar (`.onnx` ca `63 MB`, `.onnx.json` giltig JSON med `sample_rate`).

### Fas 2: Offline VITS-prosodiverifiering & Städning
1. Kör `/home/ma-auto/.local/share/piper/piper/piper` (eller `/home/ma-auto/.local/bin/piper`) med:
   - `--model /home/ma-auto/.local/share/piper/voices/sv_SE-alma-medium.onnx`
   - `--length_scale 1.0 --noise_scale 0.75 --noise_w 0.85 --sentence_silence 0.65`
   - `--output_file /tmp/piper_test_alma.wav`
   - Stdin: `"Mål för Sundsvall Hockey! Målskytt: nummer 12. Emil Lindblom."`
2. Verifiera med Python/shell att `/tmp/piper_test_alma.wav` har `RIFF`/`WAVE` header och storlek `> 10 000` bytes samt exit code `0`.
3. Radera `/tmp/piper_test_alma.wav` och verifiera att `git -C /home/ma-auto/DEV/HockeyJockey status -s` är tom.

---

## Stoppregler
- Om nedladdningen från HuggingFace misslyckas (HTTP `403`/`404` eller korrupt WAV) – stoppa omedelbart och rapportera exakt HTTP-status/fel utan ad-hoc ersättningsskript.

---

## Definition of Done (DoD)
- `sv_SE-alma-medium.onnx` och `sv_SE-alma-medium.onnx.json` existerar i `/home/ma-auto/.local/share/piper/voices/`.
- Offline syntes med `--length_scale 1.0 --noise_scale 0.75 --noise_w 0.85 --sentence_silence 0.65` gav giltig WAV (`> 10 000` bytes, `exit code 0`).
- `/tmp/piper_test_alma.wav` borttagen och `/home/ma-auto/DEV/HockeyJockey` helt orörd.
