# Init Blueprint: 26_arena_speaker_calibration
**Target Project:** HockeyJockey (`/home/ma-auto/DEV/HockeyJockey`)
**Author:** Lead Architect (UEF-V2)
**Ansvarig Executor:** `Agent-Logic` (`Claude Sonnet 5.5 (Medium)`)
**Status:** LOCKED / SACRED TRUTH (READ-ONLY för utvecklings- och testagenter)

---

## 1. Bakgrund & Rotorsaker (Verifierade av Agent-Lab + Lyssning)
Akustisk analys och lyssning på tidigare syntes visade fyra specifika brister som orsakar artificiell känsla, sludder och plåtburksefterklang:
1. `formatTextForArenaProsody` injicerade en punkt (`.`) efter `"nummer 12"` före spelarnamnet (`"Målskytt, nummer 12. Emil Lindblom."`), vilket skapade fallande punkt-intonation och ~1 s död tystnad mitt i frasen samt tvingade användaren upp i `1.60x` hastighet.
2. `sv_SE-nst-medium` har `22–30 %` sub-basenergi under `80 Hz`, är nativt ~30–45 % långsammare med inbakad tystnad än `Alma`/`Lisa`, och skapar "spökvokaler" (*"tolv-eh"*, *"av-eh"*) när `noise_scale > 0.86` och `noise_w > 0.86`.
3. `espeak-ng` uttalar `"Hockey"` med svenskt y-ljud (*"Håck-e-yyy"*).
4. `BrowserTtsAudioPlayer.getOrCreateImpulseResponse` saknade L2-energinormering på `ConvolverNode`-bufferten (vilket skapade `+22,5 dB` faltningsgain och `9,1 %` klippning) samt saknade bandpassfiltrering (`280–2 600 Hz`) på den våta efterklangsgrenen.

---

## 2. Tech Stack Audit & Triage-routing
- **Nivå 3 (Custom Code motivering):** Ren svensk fonetisk/dramaturgisk textnormalisering, VITS-parameterkompensation och L2-normerad Web Audio DSP kräver typsäker domän- och ljudmotorlogik i TypeScript.
- **Triage-routing:** `Agent-Logic` (`Claude Sonnet 5.5 (Medium)`). Strikt isolerad från `tests/`.

---

## 3. Detaljerade Kalibreringskontrakt

### 3.1 `src/types/models.ts` & `src/data/defaults.ts`
- Utöka `TtsDspChainConfig` i `src/types/models.ts` med:
  - `reverbHighpassHz: number;`
  - `reverbLowpassHz: number;`
- Uppdatera standardvärden i `src/data/defaults.ts` (`DEFAULT_SETTINGS` samt alla profiler i `DEFAULT_MATCH_PROFILES`):
  - `ttsSentenceSilenceSec: 0.45`
  - `ttsExpressiveness: 0.72`
  - `ttsArenaReverbMix: 0.22`
- Uppdatera även `DEFAULT_SETTINGS` / `sanitizeSettings`-relaterade standardfallbacks där dessa tidigare stod på `0.65`, `0.75`, `0.28`.

### 3.2 `src/utils/domain.ts` (100 % ren – Noll DOM/window/AudioContext)
1. **`formatTextForArenaProsody(text: string, dramaticPauses = true): string`:**
   - Expanderar `#\s*(\d+)` / `\bnr\.?\s*(\d+)\b/gi` -> `'nummer $1'`, `\b(\d+)\s*min\.?(?=$|[\s,.;:!?)])/gi` -> `'$1 minuter'`.
   - **Svenskt hockey-uttalslexikon för `espeak-ng`:**
     - `\bishockey(n|ns)?\b/gi`: bevara stor begynnelsebokstav (`'Ishåcki$1'` om första tecknet är versal `I`, annars `'ishåcki$1'`).
     - `\bhockey(n|ns|lag|laget|match|matchen)?\b/gi`: bevara stor begynnelsebokstav (`'Håcki$1'` om första tecknet är versal `H`, annars `'håcki$1'`).
     - *(OBS: Kör uttalslexikonet för `dramaticPauses` såväl `true` som `false`! Kontrollera exakt regex så t.ex. `Sundsvall Hockey!` -> `Sundsvall Håcki!` och `Ishockeylag` / `Hockeymatch` blir `Ishåckilag` / `Håckimatch`.)*
   - **Sluta injicera punkt efter `nummer \d+`!** Behåll sammanhängande kommapaus: `"Målskytt nummer 12, Emil Lindblom."`.
   - Lägg INTE till kommatecken direkt efter `"Målskytt"`, `"Framspelad av"` eller `"Assisterad av"` när `"nummer"` följer.
   - När `dramaticPauses === true`:
     - Säkerställ tydlig meningsgräns (`. `) **före** `"Målskytt"`, `"Framspelad av"`, `"Assisterad av"` och **före** `"\b\d+\s+minuter\s+för\b"` (när träffen inte ligger på `offset === 0`), så huvudsatserna får tydlig andningspaus medan `nummer X, Spelarnamn` hålls ihop.
     - Fäll ihop upprepade skiljetecken (`..`, `!.`, `, .`) och trimma mellanslag rent.
2. **`calculatePiperProsodyParams(options?: { rate?: number; sentenceSilenceSec?: number; expressiveness?: number; voiceId?: PiperVoiceId })`:**
   - `rawLengthScale = calculatePiperLengthScale(options?.rate ?? 1.0)`
   - Om `options?.voiceId === 'sv_SE-nst-medium'`: `lengthScale = Number(clampNumber(rawLengthScale * 0.84, 0.45, 2.0, 0.84).toFixed(3))`; annars `lengthScale = rawLengthScale`.
   - Mappa `expressiveness` (`[0.3, 1.2]`, default `0.72`) till säkert VITS latent intervall `[0.50, 0.86]`:
     - `rawExpr = clampNumber(toNumericInput(options?.expressiveness), 0.3, 1.2, 0.72)`
     - Om `rawExpr <= 0.82`: `noiseScale = Number(clampNumber(rawExpr, 0.50, 0.82, 0.72).toFixed(3))`
     - Om `rawExpr > 0.82`: `noiseScale = Number((0.82 + ((rawExpr - 0.82) / 0.38) * 0.04).toFixed(3))`
   - Mappa `noiseW` till `[0.65, 0.86]`:
     - `noiseW = Number(clampNumber(0.76 + (noiseScale - 0.667) * 0.45, 0.65, 0.86, 0.784).toFixed(3))`
   - `rawSilence = clampNumber(toNumericInput(options?.sentenceSilenceSec), 0.1, 1.5, 0.45)`
   - Om `options?.voiceId === 'sv_SE-nst-medium'`: `sentenceSilence = Number(clampNumber(rawSilence * 0.65, 0.1, 0.95, 0.293).toFixed(3))`; annars `sentenceSilence = Number(rawSilence.toFixed(3))`.
3. **`computeTtsDspChainConfig(profile: TtsAudioProfile, arenaReverbMix = 0.22, voiceId?: PiperVoiceId): TtsDspChainConfig`:**
   - Validera `profile` (fallback `'arena_pa'`), klampa `clampedMix = clampNumber(toNumericInput(arenaReverbMix), 0.0, 0.8, 0.22)`.
   - `voiceHighpass = voiceId === 'sv_SE-nst-medium' ? 145 : 125`.
   - `'studio'`: `bypass: true`, `highpassHz: 20`, `chestGainDb: 0`, `presenceGainDb: 0`, `deHarshLowpassHz: 20000`, `compressor` passiv (`ratio: 1, thresholdDb: 0, makeupGain: 1.0`), `reverbHighpassHz: 20`, `reverbLowpassHz: 20000`, `slapbackDelaySec: 0`, `slapbackFeedback: 0`, `reverbDurationSec: 0`, `wetMix: 0`, `dryMix: 1.0`.
   - `'booth'`: `bypass: false`, `highpassHz: voiceHighpass`, `chestPeakHz: 220`, `chestGainDb: 2.2`, `chestQ: 1.2`, `presencePeakHz: 3100`, `presenceGainDb: 3.5`, `presenceQ: 1.1`, `deHarshLowpassHz: 7800`, `deHarshQ: 0.707`, `compressor: { thresholdDb: -20, kneeDb: 10, ratio: 4.0, attackSec: 0.005, releaseSec: 0.15, makeupGain: 1.18 }`, `slapbackDelaySec: 0`, `slapbackFeedback: 0`, `reverbDurationSec: 0`, `reverbDecay: 2.8`, `reverbHighpassHz: 20`, `reverbLowpassHz: 20000`, `wetMix: 0`, `dryMix: 1.0`.
   - `'arena_pa'`: `bypass: false`, `highpassHz: voiceHighpass`, `chestPeakHz: 220`, `chestGainDb: 1.6`, `chestQ: 1.2`, `presencePeakHz: 3100`, `presenceGainDb: 4.2`, `presenceQ: 1.1`, `deHarshLowpassHz: 7800`, `deHarshQ: 0.707`, `compressor: { thresholdDb: -20, kneeDb: 10, ratio: 4.0, attackSec: 0.005, releaseSec: 0.15, makeupGain: 1.18 }`, `slapbackDelaySec: 0.075`, `slapbackFeedback: 0.12`, `reverbDurationSec: 1.15`, `reverbDecay: 2.8`, `reverbHighpassHz: 280`, `reverbLowpassHz: 2600`, `wetMix: Number((clampedMix * 0.45).toFixed(3))`, `dryMix: Number((1.0 - clampedMix * 0.18).toFixed(3))`.

### 3.3 `src/services/ttsService.ts` & `vite.config.ts`
- `src/services/ttsService.ts`:
  - Utöka `TtsAudioPlayerOptions` med `voiceId?: PiperVoiceId`.
  - I `BrowserTtsAudioPlayer.getOrCreateImpulseResponse`: L2-normera varje kanal uttryckligen (`energy = Math.sqrt(sum(sample^2))`, skala med `0.45 / energy`) och sätt `convolver.normalize = false` innan `convolver.buffer` tilldelas.
  - I `BrowserTtsAudioPlayer.buildDspChain`: koppla `reverbHighpass` (`dspConfig.reverbHighpassHz`) och `reverbLowpass` (`dspConfig.reverbLowpassHz`) i serie med `convolver` på reverb-grenen, sätt lågpassfilter `2600 Hz` på slapback-delay-grenen samt sänk `slapbackOutGain` till `0.22`.
  - I `BrowserTtsAudioPlayer.playWithWebAudio`: skicka `options.voiceId` till `computeTtsDspChainConfig`. Vid naturligt slut av `voiceSource` låt ev. efterklang klinga ut i `dspConfig.wetMix > 0 ? 220 : 0` ms innan noder kopplas bort (avbryts direkt av `stop()` eller `AbortSignal`).
  - I `TtsService.speak`: skicka `voiceId` till `calculatePiperProsodyParams` och `audioPlayer.playWav(..., { volume, signal, audioProfile, arenaReverbMix, preChimeEnabled, voiceId })`. Bevara `duckVolume -> speak -> restoreVolume` exakt.
- `vite.config.ts`:
  - Skicka `voiceId` till `calculatePiperProsodyParams` för serverberäknade anrop, samtidigt som explicita färdigberäknade `sentenceSilence`/`noiseScale`/`noiseW`-värden (t.ex. när `TtsService` redan beräknat dem för `voiceId` inom tillåtna gränser) hanteras rent och konsekvent (om anroparen skickar rå `expressiveness` + `voiceId` används `calculatePiperProsodyParams`, och om explicita `noiseScale`/`noiseW`/`sentenceSilence` skickas från `TtsService` klampas de säkert i `[0.50, 0.86]`, `[0.65, 0.86]`, `[0.1, 1.5]`).

### 3.4 `src/components/SetupView.tsx`
- Lägg till en knapp **"Återställ optimal Arena-kalibrering"** i `TtsSettingsSection` som med ett klick återställer `ttsRate: 1.05`, `ttsSentenceSilenceSec: 0.45`, `ttsExpressiveness: 0.72`, `ttsArenaReverbMix: 0.22`, `ttsAudioProfile: 'arena_pa'` och `ttsDramaticPauses: true` i `useAppStore`, och uppdatera reglagens standardmarkeringar (`0.45s (standard)`, `0.72`, `22% (standard)`).

---

## 4. Kvantifierat Funktionsorakel
1. `npx tsc --noEmit && npm run build` passerar med `exit code 0`.
2. `src/utils/domain.ts` förblir 100 % ren TypeScript (noll DOM/`window`/`AudioContext`/`localStorage`/`fetch`).
3. Samtliga 4 kalibreringspelare fungerar konsekvent över `domain.ts`, `ttsService.ts`, `vite.config.ts`, `defaults.ts` och `SetupView.tsx`.
