# Blueprint: 18_track_transition_fade (Init V2)
Status: READY_TO_EXECUTE

> [!IMPORTANT]
> **READ-ONLY KONTRAKT FÖR SUB-AGENTER:**  
> Denna fil utgör "Sacred Truth" för modulen. Sub-agenter instrueras att läsa denna fil exakt en gång vid uppstart och betrakta den som orubblig lag. Sub-agenter får **ALDRIG skriva till eller modifiera denna fil**. Om ett gränssnitt behöver ändras, MÅSTE agenten stanna, eskalera till Master Coordinator och invänta en uppdaterad blueprint.

---

## 1. Syfte & Strategiskt Mål
Inför automatisk, mjuk **Fade Out / Fade In** när en låt redan spelas och användaren trycker på en ny Soundboard-knapp eller händelseknapp (t.ex. byte från utvisningslåt till tekningslåt). Start från tystnad ska fortsatt ske omedelbart utan någon fördröjning.

---

## 2. Rollfördelning & Ansvarsområden
*   **Lead Architect (Master-agenten i ai-master-config):** Äger denna Sacred Truth-specifikation.
*   **`Agent-Logic` (`Claude Sonnet 5.5 (Medium)`):** Implementerar ändringarna i `/home/ma-auto/DEV/HockeyJockey/src/` autonomt i Sandbox Mode utan att röra `tests/` eller `*_init.md`.

---

## 3. Tech Stack & Tool-First Audit (MANDATORY)

| Område | Frågeställning | Audit-resultat |
| :--- | :--- | :--- |
| **Nivå 1 (OS-Native)** | Kan uppgiften lösas med inbyggda terminalkommandon? | **Nej** |
| **Motivering (varför Nivå 1 förkastas)** | *Obligatoriskt eftersom Nivå 3 väljs:* | Kräver asynkron tvåfasig volymrampning i 50 ms-intervall (fade-out av pågående ljudkälla följt av källbyte och fade-in av ny ljudkälla med sekvensskydd mot race conditions) i webbläsarens ljudmotor (`AudioController`). |
| **Nivå 2 (Etablerade CLI-verktyg)** | Finns etablerade CLI-verktyg? | **Ja** – `npm`, `tsc`, `vite`, `git`. |
| **Maskinberoende (Capabilities)** | Krävs specifika verktyg? | `node,npm,git,python` |
| **Gate Runner Integration** | Deterministiska kontroller | Stage 1: `npx tsc --noEmit`; full 5-stegsgrind exekveras i modul `19_oracle_track_transition_fade`. |

---

## 4. Sacred Truth (Design & Arkitektur)

### 4.1 Datamodeller & Inställningar (`src/types/models.ts`, `src/data/defaults.ts`, `src/utils/domain.ts`, `src/store/useAppStore.ts`)
1. `AppSettings` utökas bakåtkompatibelt med:
   * `crossfadeEnabled: boolean;` (default: `true` i `DEFAULT_SETTINGS`)
   * `crossfadeDurationMs: number;` (default: `350` ms per riktning i `DEFAULT_SETTINGS`, klampat `[0, 5000]` i `sanitizeSettings`)
2. `MatchProfile['settings']` utökas med `crossfadeEnabled?: boolean;` och `crossfadeDurationMs?: number;`.
3. `sanitizeSettings`, `sanitizeMatchProfile`, `saveCurrentAsMatchProfile` och `activateMatchProfile` inkluderar och sanerar dessa fält bakåtkompatibelt.

### 4.2 Tvåfasig Fade Out / Fade In i `AudioController` (`src/services/audioController.ts`)
1. **Utökad signatur på `playAt`:**
   ```typescript
   public async playAt(
     trackUri: string,
     positionMs: number,
     targetVolume = 1.0,
     previewMs?: number,
     trackMeta?: Partial<TrackCue>,
     transitionOptions?: {
       fadeWhenPlaying?: boolean;
       fadeOutMs?: number;
       fadeInMs?: number;
     },
   ): Promise<void>
   ```
2. **Exakt tvåfasig exekveringslogik i `playAt`:**
   * Avbryt eventuell aktiv volymramp (`clearActiveRamp()`) och eventuell preview-timer (`clearPreviewTimer()`).
   * Räkna upp `const requestSeq = ++this.playRequestSeq;`.
   * Avgör övergångsbehov före start:
     * `const wasPlaying = this.state.isPlaying;`
     * `const shouldTransitionFade = wasPlaying && (transitionOptions?.fadeWhenPlaying ?? true);`
     * `const fadeOutMs = shouldTransitionFade && this.state.volume > 0 ? Math.max(0, Math.round(transitionOptions?.fadeOutMs ?? 350)) : 0;`
     * `const fadeInMs = shouldTransitionFade ? Math.max(0, Math.round(transitionOptions?.fadeInMs ?? 350)) : 0;`
   * **Fas A – Fade Out av pågående låt (`shouldTransitionFade && fadeOutMs > 0`):**
     * Medan `this.activeSourceType` fortfarande pekar på den pågående ljudkällan (lokal `HTMLAudioElement`, Spotify eller simulerad synth) körs `await this.runVolumeRamp(0.0, fadeOutMs)`.
     * Direkt efter rampen: om `requestSeq !== this.playRequestSeq`, avbryt omedelbart (`return;`).
   * **Fas B – Källbyte och uppstart av nya låten:**
     * `const initialPlayVolume = shouldTransitionFade && fadeInMs > 0 ? 0.0 : safeVolume;`
     * Starta den nya låten (lokal ljudfil, Spotify eller simulerad fallback) vid `safePosition` med initial volym `initialPlayVolume` (så att nya låten börjar på `0.0` när Fade In ska köras, eller direkt på `safeVolume` vid start från tystnad).
     * Om `requestSeq !== this.playRequestSeq`, avbryt säkert (`return;`).
     * Starta `this.startPositionTicker()`.
   * **Fas C – Fade In av nya låten (`shouldTransitionFade && fadeInMs > 0 && safeVolume > 0`):**
     * Kör `await this.runVolumeRamp(safeVolume, fadeInMs, { isDuckedOnStart: false, isDuckedOnFinish: false })`.
     * Om `requestSeq !== this.playRequestSeq`, avbryt (`return;`).
   * **Fas D – Schemalägg eventuell `previewMs`-timer:**
     * Om `previewMs > 0`, sätt `previewTimer` för `fadeOutAndPause()`.

### 4.3 Koppling & UI (`src/App.tsx` & `src/components/SetupView.tsx`)
1. **I `src/App.tsx`:**
   * I `playSoundPad` och `handlePreviewTrack`: skicka `{ fadeWhenPlaying: settings.crossfadeEnabled, fadeOutMs: settings.crossfadeDurationMs, fadeInMs: settings.crossfadeDurationMs }` till `audioController.playAt(...)` (vilket automatiskt gäller både Soundboard-knappar, Mål-/Utvisningsflöden och 5-sekunders provspelning).
2. **I `src/components/SetupView.tsx`:**
   * Under fliken **Spotify, Kortkommandon & Backup** (Ljud- & Matchinställningar): lägg till inställningskontroll för **"Mjuk övergång (Fade Out / Fade In) vid låtbyte"** med switch (`crossfadeEnabled`) och tid per riktning i ms (`crossfadeDurationMs`, t.ex. `0–2000 ms`, default `350 ms`).

---

## 5. Oracle Contract (The Gate of Truth)
Verifieras av `Agent-Oracle` i Modul `19_oracle_track_transition_fade` via `tests/test_unit_domain.py`, `tests/oracle_hockeyjockey.py` och `/home/ma-auto/DEV/bin/invoke-v2-gate` med `exit code 0` och `"overall_status": "VERIFIED"`.

---

## 6. Resursallokering & Sub-Agent Roster

| Roster-Profil | Tilldelad Modell & Tier (`models.json`) | Ansvarsområde |
| :--- | :--- | :--- |
| **`Agent-Logic`** | **Claude Sonnet 5.5 (Medium)** | Nivå 3 Custom Code för Modul 18 (`src/`). |

**Tilldelad Roster-Profil för denna modul:** `Agent-Logic`  
**Tilldelad Modell:** `Claude Sonnet 5.5 (Medium)`
