# Blueprint: 13_oracle_local_audio_files (Init V2)
Status: READY_TO_EXECUTE

> [!IMPORTANT]
> **READ-ONLY KONTRAKT FÖR SUB-AGENTER:**  
> Denna fil utgör "Sacred Truth" för modulen. Sub-agenter får **ALDRIG skriva till eller modifiera denna fil**.

---

## 1. Syfte & Strategiskt Mål
Utöka Stage 2-enhetstesterna (`tests/test_unit_domain.py`) och Stage 4-funktionsoraklet (`tests/oracle_hockeyjockey.py`) för att verifiera lokala ljudfiler (`local:audio:<id>`, `parseLocalAudioFilename`, `localAudioStorage`, lokal uppspelning + volymramper i `AudioController` samt JSON-rundresa med lokala spår).

---

## 2. Rollfördelning
*   **`Agent-Oracle` (`Gemini 4 Neon (High)`):** Strikt isolerad från `src/`; uppdaterar endast `tests/` och kör `/home/ma-auto/DEV/bin/invoke-v2-gate`.
*   **`Agent-IO` (`Gemini 3.8 Flash (Low)`):** Arkiverar `12_*` och `13_*`, committar och pushar till GitHub (`5w00t3dL10n/HockeyJockey`), samt bekräftar att dev-servern på `http://127.0.0.1:5173` är aktiv med HTTP `200`.

---

## 3. Tech Stack & Tool-First Audit (MANDATORY)

| Område | Frågeställning | Audit-resultat |
| :--- | :--- | :--- |
| **Nivå 1 (OS-Native)** | Kan orakeltester lösas enbart med Bash? | **Nej** (testlogik), **Ja** (arkivering & git push via `Agent-IO`). |
| **Motivering (varför Nivå 1 förkastas)** | *Obligatoriskt för Stage 2 & Stage 4:* | Kräver körning av TypeScript-domänlogik, `localAudioStorage`, `AudioController` och `useAppStore` via `npx tsx` samt produktionsbygge. |
| **Nivå 2 (Etablerade CLI-verktyg)** | Finns etablerade CLI-verktyg? | **Ja** – `/home/ma-auto/DEV/bin/invoke-v2-gate`, `python3`, `npx`, `npm`, `git`, `gh`. |
| **Gate Runner Integration** | Exakt kommando | `/home/ma-auto/DEV/bin/invoke-v2-gate --project "HockeyJockey" --required-tools "git,node,npm,python,gh" --oracle-script "tests/oracle_hockeyjockey.py"` |

---

## 4. Oracle Contract (Stage 2 & Stage 4 Krav)
1. **Stage 2 (`tests/test_unit_domain.py`):** Utöver befintliga 14 tester:
   * Verifiera `isLocalAudioUri`, `createLocalAudioUri`, `tryParseSpotifyUri`/`parseSpotifyUri` med `local:audio:<id>` (samt att `extractSpotifyTrackId('local:audio:test_1') === null`), `parseLocalAudioFilename` (`"Zombie Nation - Kernkraft 400.mp3"` -> artist `"Zombie Nation"`, title `"Kernkraft 400"`; `"Goal_Horn_Sundsvall.wav"` -> title `"Goal Horn Sundsvall"`, artist `"Lokal ljudfil"`), samt `sanitizeMatchConfig` bevarande `sourceType: 'local'`, `localFileName` och `mimeType` för lokala spår, explicit `'spotify'` om angivet, och utelämnat `sourceType` när Spotify-spår saknade fältet (eller hade felaktigt `'local'`).
2. **Stage 4 (`tests/oracle_hockeyjockey.py`):** Utöver befintliga 15 kontroller:
   * Verifiera `localAudioStorage` (`saveLocalAudioFile`, `getLocalAudioRecord`, `getLocalAudioPlaybackUrl`, `listLocalAudioFiles`, `deleteLocalAudioFile`), `AudioController.playAt` med lokal ljudfil (och verifiering att Spotify-adapterns `setVolume` INTE anropas under lokal uppspelning/ducking, samt `duckVolume`/`restoreVolume`/`fadeOutAndPause`/`hardStop`), och fullständig `useAppStore` JSON-rundresa med ett lokalt spår.
