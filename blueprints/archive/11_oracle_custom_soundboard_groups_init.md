# Blueprint: 11_oracle_custom_soundboard_groups (Init V2)
Status: READY_TO_EXECUTE

> [!IMPORTANT]
> **READ-ONLY KONTRAKT FÖR SUB-AGENTER:**  
> Denna fil utgör "Sacred Truth" för modulen. Sub-agenter får **ALDRIG skriva till eller modifiera denna fil**.

---

## 1. Syfte & Strategiskt Mål
Utöka Stage 2-enhetstesterna (`tests/test_unit_domain.py`) och Stage 4-funktionsoraklet (`tests/oracle_hockeyjockey.py`) för att verifiera användardefinierade soundboard-grupper (`SoundboardGroup`), omordning, borttagning med pad-omplacering samt profil- och JSON-persistens.

---

## 2. Rollfördelning
*   **`Agent-Oracle` (`Gemini 4 Neon (High)`):** Strikt isolerad från `src/`; uppdaterar endast `tests/` och kör `/home/ma-auto/DEV/bin/invoke-v2-gate`.
*   **`Agent-IO` (`Gemini 3.8 Flash (Low)`):** Arkiverar `10_*` och `11_*`, committar och pushar till GitHub (`5w00t3dL10n/HockeyJockey`), samt bekräftar att dev-servern på `http://127.0.0.1:5173` är aktiv med HTTP `200`.

---

## 3. Tech Stack & Tool-First Audit (MANDATORY)

| Område | Frågeställning | Audit-resultat |
| :--- | :--- | :--- |
| **Nivå 1 (OS-Native)** | Kan orakeltester lösas enbart med Bash? | **Nej** (testlogik), **Ja** (arkivering & git push via `Agent-IO`). |
| **Motivering (varför Nivå 1 förkastas)** | *Obligatoriskt för Stage 2 & Stage 4:* | Kräver körning av TypeScript-domänlogik (`sanitizeSoundboardGroups`, `sanitizeMatchConfig`) och `useAppStore` via `npx tsx` samt produktionsbygge. |
| **Nivå 2 (Etablerade CLI-verktyg)** | Finns etablerade CLI-verktyg? | **Ja** – `/home/ma-auto/DEV/bin/invoke-v2-gate`, `python3`, `npx`, `npm`, `git`, `gh`. |
| **Gate Runner Integration** | Exakt kommando | `/home/ma-auto/DEV/bin/invoke-v2-gate --project "HockeyJockey" --required-tools "git,node,npm,python,gh" --oracle-script "tests/oracle_hockeyjockey.py"` |

---

## 4. Oracle Contract (Stage 2 & Stage 4 Krav)
1. **Stage 2 (`tests/test_unit_domain.py`):** Utöver befintliga 12 tester:
   * Verifiera `sanitizeSoundboardGroups` & `sanitizeMatchConfig` med anpassade grupper (`'group-intro'`, `'Intro & Uppvärmning'`), exkludering av händelsekategorier samt självläkande gruppregistrering när en `SoundPad` har en okänd anpassad kategori.
2. **Stage 4 (`tests/oracle_hockeyjockey.py`):** Utöver befintliga 13 kontroller:
   * Verifiera `useAppStore`-operationer: `addSoundboardGroup`, `updateSoundboardGroup`, `moveSoundboardGroup`, `deleteSoundboardGroup` (inkl. automatisk flytt av tillhörande knappar till kvarvarande grupp så inga knappar tappas), `MatchProfile`-växling med egna grupper samt JSON export/import-rundresa (`exportConfigJson` -> `importConfigJson`).
