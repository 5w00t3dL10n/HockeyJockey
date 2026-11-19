# Blueprint: 09_oracle_spotify_resilience (Init V2)
Status: READY_TO_EXECUTE

> [!IMPORTANT]
> **READ-ONLY KONTRAKT FÖR SUB-AGENTER:**  
> Denna fil utgör "Sacred Truth" för modulen. Sub-agenter får **ALDRIG skriva till eller modifiera denna fil**.

---

## 1. Syfte & Strategiskt Mål
Utöka Stage 4-funktionsoraklet (`tests/oracle_hockeyjockey.py`) för att bevisa att den självläkande Spotify-transporten (`SpotifyPlayerService` + `AudioController`) fungerar deterministiskt både med lokal `ensureReady()`-återhämtning, med Spotify Connect-fallback vid saknad DRM/SDK (`GET /v1/me/player/devices`), med throttlad Connect-volymstyrning samt att det ursprungliga Calm Tech-fallback-oraklet vid permanent nätverks-/API-fel fortsatt passerar.

---

## 2. Rollfördelning
*   **`Agent-Oracle` (`Gemini 4 Neon (High)`):** Strikt isolerad från `src/`; uppdaterar endast `tests/oracle_hockeyjockey.py` och kör `/home/ma-auto/DEV/bin/invoke-v2-gate`.
*   **`Agent-IO` (`Gemini 3.8 Flash (Low)`):** Arkiverar `08_*` och `09_*`, committar och pushar till GitHub (`5w00t3dL10n/HockeyJockey`), samt startar om/verifierar dev-servern på `http://127.0.0.1:5173`.

---

## 3. Tech Stack & Tool-First Audit (MANDATORY)

| Område | Frågeställning | Audit-resultat |
| :--- | :--- | :--- |
| **Nivå 1 (OS-Native)** | Kan orakeltester lösas enbart med Bash? | **Nej** (testlogik), **Ja** (arkivering & git push via `Agent-IO`). |
| **Motivering (varför Nivå 1 förkastas)** | *Obligatoriskt för Stage 4:* | Kräver exekvering av `AudioController` och `SpotifyPlayerService` i Node/`npx tsx` med deterministiska fetch-/adapter-stubbar samt produktionsbygge. |
| **Nivå 2 (Etablerade CLI-verktyg)** | Finns etablerade CLI-verktyg? | **Ja** – `/home/ma-auto/DEV/bin/invoke-v2-gate`, `python3`, `npx`, `npm`, `git`, `gh`. |
| **Gate Runner Integration** | Exakt kommando | `/home/ma-auto/DEV/bin/invoke-v2-gate --project "HockeyJockey" --required-tools "git,node,npm,python,gh" --oracle-script "tests/oracle_hockeyjockey.py"` |

---

## 4. Oracle Contract (Utökade Stage 4-krav i `tests/oracle_hockeyjockey.py`)
Utöver befintliga 11 orakelkontroller ska `tests/oracle_hockeyjockey.py` verifiera:
1. **Självläkande `AudioController.playAt()` via `ensureReady()`:**
   * En adapter som initialt har `isReady() === false`, men där `ensureReady()` sätter enheten redo (`deviceId = 'connect-dev-1'`, `deviceName = 'Spotify Desktop'`), gör att `playAt()` kör i `mode: 'spotify'`, sätter `deviceName: 'Spotify Desktop'` och anropar `playTrack` utan att fastna i `'simulated'`.
   * Befintlig kontroll av permanent misslyckande (`customFailingAdapter` utan `ensureReady`) faller fortfarande tillbaka till `mode: 'simulated'`.
2. **Spotify Connect Device Discovery & Transport (`SpotifyPlayerService`):**
   * Med giltig lagrad token och stubbad `globalThis.fetch` som svarar på `GET /v1/me/player/devices` (t.ex. med en inaktiv Restricted-enhet och en aktiv/tillgänglig `"Linux Desktop"`-enhet), väljer `discoverConnectDevice()` rätt enhet (`id` och `name`), sätter `getTransportMode() === 'connect'`, `isReady() === true`, och kör `playTrack` (inkl. 404-retry), `pause()` och throttlad `setVolume()` med slutvärde levererat.
