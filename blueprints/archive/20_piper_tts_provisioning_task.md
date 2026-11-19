# Task Contract: 20_piper_tts_provisioning
**Init Reference:** [20_piper_tts_provisioning_init.md](file:///home/ma-auto/DEV/blueprints/HockeyJockey/20_piper_tts_provisioning_init.md)
**Assigned Sub-Agent:** `Agent-IO` (`Gemini 3.8 Flash (Low)`)
**Execution Mode:** Sandbox Mode (OS-Native Provisioning)

---

## Pre-Flight Guardrail (OBLIGATORISK)
- Du FÅR **INTE** modifiera eller skapa filer inuti `/home/ma-auto/DEV/HockeyJockey/` (varken `src/`, `tests/` eller `vite.config.ts`).
- Du FÅR **INTE** ändra denna `_task.md` eller `_init.md`.
- Kör kontroller av befintlig installation först så du undviker onödig nedladdning om binär eller röstmodell redan finns intakt.

---

## Sekventiella Faser

### Fas 1: Ladda ner och installera Piper TTS (Linux x86_64)
1. Skapa kataloger `/home/ma-auto/.local/share/piper/voices` och `/home/ma-auto/.local/bin`.
2. Kontrollera om `/home/ma-auto/.local/share/piper/piper/piper` redan fungerar (`--help`).
3. Om binären saknas: hämta senaste `piper_linux_x86_64.tar.gz` från `https://github.com/rhasspy/piper/releases/latest/download/piper_linux_x86_64.tar.gz` via `curl -fSL`, packa upp i `/home/ma-auto/.local/share/piper/` så att binären hamnar på `/home/ma-auto/.local/share/piper/piper/piper`, och säkerställ körbarhet (`chmod +x`).
4. Skapa `/home/ma-auto/.local/bin/piper` (liten körbar wrapper som sätter `LD_LIBRARY_PATH` till `/home/ma-auto/.local/share/piper/piper:${LD_LIBRARY_PATH:-}` och anropar `/home/ma-auto/.local/share/piper/piper/piper "$@"`) och säkerställ `chmod +x`.

### Fas 2: Ladda ner svenska ONNX-röstmodeller
Ladda ner (om saknas eller 0 bytes) följande fyra filer till `/home/ma-auto/.local/share/piper/voices/` via `curl -fSL`:
1. `https://huggingface.co/rhasspy/piper-voices/resolve/main/sv/sv_SE/nst/medium/sv_SE-nst-medium.onnx`
2. `https://huggingface.co/rhasspy/piper-voices/resolve/main/sv/sv_SE/nst/medium/sv_SE-nst-medium.onnx.json`
3. `https://huggingface.co/rhasspy/piper-voices/resolve/main/sv/sv_SE/lisa/medium/sv_SE-lisa-medium.onnx`
4. `https://huggingface.co/rhasspy/piper-voices/resolve/main/sv/sv_SE/lisa/medium/sv_SE-lisa-medium.onnx.json`

Verifiera att båda `.onnx.json`-filerna parsas som giltig JSON och att `.onnx`-filerna är fullständiga (`> 40 MB`).

### Fas 3: Offline Syntesverifiering & Städning
1. Testa syntes med `sv_SE-nst-medium` till `/tmp/piper_test_nst.wav` med svensk hockeytext: `"Mål för Sundsvall Hockey! Målskytt nummer 12."`
2. Testa syntes med `sv_SE-lisa-medium` till `/tmp/piper_test_lisa.wav` med svensk hockeytext: `"Sundsvall Hockey drar på sig en utvisning, 2 minuter för hakning."`
3. Verifiera båda WAV-filerna via Python/shell (exit code `0`, `RIFF` + `WAVE` header, storlek `> 10000` bytes).
4. Testa även om `--output_file -` producerar giltig `RIFF`/`WAVE` WAV på `stdout` och rapportera resultatet.
5. Radera temporära `/tmp/piper_test_*.wav` efter verifiering.

---

## Stoppregler
- Om GitHub eller HuggingFace returnerar bestående nätverksfel (`403`/`404` efter verifierad URL-kontroll mot release-API) – avbryt och rapportera exakt felkod/URL utan att hitta på ersättningskod.
- Om arkitektur saknar `x86_64`-kompatibla bibliotek (`GLIBC`/laddfel) – stoppa omedelbart och rapportera exakt `ldd`-utdata.

---

## Definition of Done (DoD)
- `/home/ma-auto/.local/share/piper/piper/piper --help` returnerar `exit code 0`.
- `/home/ma-auto/.local/bin/piper --help` returnerar `exit code 0`.
- Alla 4 röstfiler existerar och har verifierad storlek + giltig JSON-config.
- Syntesverifiering för både `sv_SE-nst-medium` och `sv_SE-lisa-medium` gav giltig `RIFF`/`WAVE` (`> 10 000` bytes).
- Inga oavsiktliga ändringar i `/home/ma-auto/DEV/HockeyJockey/`.
