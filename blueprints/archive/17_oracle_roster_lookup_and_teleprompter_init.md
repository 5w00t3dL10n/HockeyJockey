# Blueprint: 17_oracle_roster_lookup_and_teleprompter (Init V2)
Status: READY_TO_EXECUTE

> [!IMPORTANT]
> **READ-ONLY KONTRAKT FÖR SUB-AGENTER:**  
> Denna fil utgör "Sacred Truth" för modulen. Sub-agenter får **ALDRIG skriva till eller modifiera denna fil**.

---

## 1. Syfte & Strategiskt Mål
Utöka Stage 2-enhetstesterna (`tests/test_unit_domain.py`) och Stage 4-funktionsoraklet (`tests/oracle_hockeyjockey.py`) för att verifiera tolerant tröjnummernormalisering, `lookupPlayerName`, utökad `parseRosterText` och robust talmanusgenerering (`generateGoalScript` och `generatePenaltyScript`) med garanterade spelarnamn.

---

## 2. Rollfördelning
*   **`Agent-Oracle` (`Gemini 4 Neon (High)`):** Strikt isolerad från `src/`; uppdaterar endast `tests/` och kör `/home/ma-auto/DEV/bin/invoke-v2-gate`.
*   **`Agent-IO` (`Gemini 3.8 Flash (Low)`):** Arkiverar `16_*` och `17_*`, committar och pushar till GitHub (`5w00t3dL10n/HockeyJockey`), samt bekräftar att dev-servern på `http://127.0.0.1:5173` är aktiv med HTTP `200`.

---

## 3. Tech Stack & Tool-First Audit (MANDATORY)

| Område | Frågeställning | Audit-resultat |
| :--- | :--- | :--- |
| **Nivå 1 (OS-Native)** | Kan orakeltester lösas enbart med Bash? | **Nej** (testlogik), **Ja** (arkivering & git push via `Agent-IO`). |
| **Motivering (varför Nivå 1 förkastas)** | *Obligatoriskt för Stage 2 & Stage 4:* | Kräver körning av TypeScript-domänlogik och `useAppStore` via `npx tsx` samt produktionsbygge. |
| **Nivå 2 (Etablerade CLI-verktyg)** | Finns etablerade CLI-verktyg? | **Ja** – `/home/ma-auto/DEV/bin/invoke-v2-gate`, `python3`, `npx`, `npm`, `git`, `gh`. |
| **Gate Runner Integration** | Exakt kommando | `/home/ma-auto/DEV/bin/invoke-v2-gate --project "HockeyJockey" --required-tools "git,node,npm,python,gh" --oracle-script "tests/oracle_hockeyjockey.py"` |

---

## 4. Oracle Contract (Stage 2 & Stage 4 Krav)
1. **Stage 2 (`tests/test_unit_domain.py`):** Utöver befintliga 19 tester:
   * Verifiera `normalizeJerseyNumber` och `lookupPlayerName` (`'#12'` <-> `'12'`, `'06'` <-> `'6'`, `'00'` strikt skild från `'0'`, `'12.'` -> `'12'`, `'Nr 6'` -> `'6'`).
   * Verifiera utökad `parseRosterText` med `'12. Kalle Svensson'`, `'Nr 6 Erik Lind'`, `'# 14 - Erik Svensson'`, `'Kalle Svensson #12'`, `'22 Rasmus Karlsson'` och `'00 Oscar Holm (MV)'`.
   * Verifiera `generateGoalScript` och `generatePenaltyScript` med `roster`-fallback, alias-platshållare och garanterad namninfogning även om en mall saknar `{scorerName}`.
2. **Stage 4 (`tests/oracle_hockeyjockey.py`):** Utöver befintliga 20 kontroller:
   * Verifiera att `DEFAULT_TEAMS.home` (*Sundsvall Hockey*) innehåller spelare för bl.a. `#12`, `#6`, `#22` och `#00`, samt att `useAppStore.upsertPlayer` normaliserar `'#12'` -> `'12'` och att `generateGoalScript` med målskytt `#12` och assist `#6` mot `DEFAULT_TEAMS.home.roster` producerar fullständiga namn i talmanuset.
