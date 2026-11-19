# Blueprint: 15_oracle_embedded_media_archive (Init V2)
Status: READY_TO_EXECUTE

> [!IMPORTANT]
> **READ-ONLY KONTRAKT FÖR SUB-AGENTER:**  
> Denna fil utgör "Sacred Truth" för modulen. Sub-agenter får **ALDRIG skriva till eller modifiera denna fil**.

---

## 1. Syfte & Strategiskt Mål
Utöka Stage 2-enhetstesterna (`tests/test_unit_domain.py`) och Stage 4-funktionsoraklet (`tests/oracle_hockeyjockey.py`) för att verifiera det inbäddade mediaarkivet (`HockeyJockey/src/media`), inklusive filter för accepterade ljudformat, deterministisk arkiv-URI, idempotent automatisk import i `useAppStore` och uppspelnings-URL-registrering i `localAudioStorage`.

---

## 2. Rollfördelning
*   **`Agent-Oracle` (`Gemini 4 Neon (High)`):** Strikt isolerad från `src/` och `vite.config.ts`; uppdaterar endast `tests/` och kör `/home/ma-auto/DEV/bin/invoke-v2-gate`.
*   **`Agent-IO` (`Gemini 3.8 Flash (Low)`):** Arkiverar `14_*` och `15_*`, committar och pushar till GitHub (`5w00t3dL10n/HockeyJockey`), startar om dev-servern så `/api/media-archive` aktiveras, och verifierar HTTP `200` på både appen och `/api/media-archive`.

---

## 3. Tech Stack & Tool-First Audit (MANDATORY)

| Område | Frågeställning | Audit-resultat |
| :--- | :--- | :--- |
| **Nivå 1 (OS-Native)** | Kan orakeltester lösas enbart med Bash? | **Nej** (testlogik), **Ja** (arkivering, git push & serveromstart via `Agent-IO`). |
| **Motivering (varför Nivå 1 förkastas)** | *Obligatoriskt för Stage 2 & Stage 4:* | Kräver körning av TypeScript-domänlogik, `localAudioStorage` och `useAppStore` via `npx tsx` samt produktionsbygge. |
| **Nivå 2 (Etablerade CLI-verktyg)** | Finns etablerade CLI-verktyg? | **Ja** – `/home/ma-auto/DEV/bin/invoke-v2-gate`, `python3`, `npx`, `npm`, `git`, `gh`. |
| **Gate Runner Integration** | Exakt kommando | `/home/ma-auto/DEV/bin/invoke-v2-gate --project "HockeyJockey" --required-tools "git,node,npm,python,gh" --oracle-script "tests/oracle_hockeyjockey.py"` |

---

## 4. Oracle Contract (Stage 2 & Stage 4 Krav)
1. **Stage 2 (`tests/test_unit_domain.py`):** Utöver befintliga 16 tester:
   * Verifiera `isAcceptedAudioFileName` (accepterar `.mp3`, `.wav`, `.ogg`, `.m4a`, `.flac`, `.aac`, `.webm`, `.opus` skiftlägesokänsligt; avvisar `.txt`, `.png`, `.gitkeep`, dolda `.mp3`-filer), `inferAudioMimeType`, samt att `buildEmbeddedMediaUri` genererar deterministiska, giltiga och kollisionsfria `local:audio:media-...`-URI:er.
2. **Stage 4 (`tests/oracle_hockeyjockey.py`):** Utöver befintliga 18 kontroller:
   * Verifiera att `/home/ma-auto/DEV/HockeyJockey/src/media` existerar, att `registerEmbeddedMediaItems` + `getLocalAudioPlaybackUrl` i `localAudioStorage` löser inbäddade `streamUrl`-adresser korrekt, och att `importEmbeddedMediaArchive` i `useAppStore` automatiskt skapar soundboard-knappar i gruppen `'media_archive'` vid första importen men är idempotent vid efterföljande laddningar (skapar ej dubbletter om användaren redan importerat eller tagit bort en knapp).
