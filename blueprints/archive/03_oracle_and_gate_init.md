# Blueprint: 03_oracle_and_gate (Init V2)
Status: READY_TO_EXECUTE

> [!IMPORTANT]
> **READ-ONLY KONTRAKT FÖR SUB-AGENTER:**  
> Denna fil utgör "Sacred Truth" för modulen. Sub-agenter instrueras att läsa denna fil exakt en gång vid uppstart och betrakta den som orubblig lag. Sub-agenter får **ALDRIG skriva till eller modifiera denna fil**.

---

## 1. Syfte & Strategiskt Mål
Konstruera oberoende enhetstester (Stage 2) och ett objektivt funktionsorakel (Stage 4) för **HockeyJockey**, exekvera den systemtvingade 5-stegsgrinden via `/home/ma-auto/DEV/bin/invoke-v2-gate`, samt säkerställa fullständig DoD-arkivering och GitHub-push.

---

## 2. Rollfördelning & Ansvarsområden (Who Does What)
*   **`Agent-Oracle` (`Gemini 4 Neon (High)`):**
    *   Strikt isolerad från `Agent-Logic`. Får **ALDRIG** ändra källkoden i `src/`.
    *   Skriver `tests/test_unit_domain.py` (Stage 2) och `tests/oracle_hockeyjockey.py` (Stage 4).
    *   Kör `/home/ma-auto/DEV/bin/invoke-v2-gate --project "HockeyJockey" --required-tools "git,node,npm,python,gh" --oracle-script "tests/oracle_hockeyjockey.py"`.
    *   Om Gate Runnern misslyckas: rapporterar exakt felutfall till Master Coordinator utan att manipulera tester eller `src/`.
*   **`Agent-IO` (`Gemini 3.8 Flash (Low)`):**
    *   Efter att Gate Runner returnerat `exit code 0`: arkiverar ritningar till `blueprints/archive/`, committar och pushar hela projektet + `.gate_telemetry.json` till `https://github.com/5w00t3dL10n/HockeyJockey` samt committar arkiveringen i `ai-master-config`.

---

## 3. Tech Stack & Tool-First Audit (MANDATORY)

| Område | Frågeställning | Audit-resultat |
| :--- | :--- | :--- |
| **Nivå 1 (OS-Native)** | Kan testsviter och funktionsorakel lösas enbart med Bash? | **Nej** (gäller testkonstruktionen), **Ja** (gäller arkivering och git-push via `Agent-IO`). |
| **Motivering (varför Nivå 1 förkastas)** | *Obligatoriskt för Stage 2 & Stage 4:* | För att exekvera verklig TypeScript-domänlogik via Node/`tsx`, beräkna RFC 7636 PKCE SHA-256-vektorer, verifiera produktionsbygge (`npm run build` -> `dist/`) och granska strukturerade SVG/JSON-kontrakt krävs programmerade orakelskript (`tests/test_unit_domain.py` och `tests/oracle_hockeyjockey.py`). |
| **Nivå 2 (Etablerade CLI-verktyg)** | Finns etablerade CLI-verktyg? | **Ja** – `/home/ma-auto/DEV/bin/invoke-v2-gate`, `python3`, `node`, `npx`, `npm`, `git`, `gh`. |
| **Maskinberoende (Capabilities)** | Krävs specifika nodverktyg? | `git,node,npm,python,gh` |
| **Gate Runner Integration** | Exakt Gate Runner-kommando | `/home/ma-auto/DEV/bin/invoke-v2-gate --project "HockeyJockey" --required-tools "git,node,npm,python,gh" --oracle-script "tests/oracle_hockeyjockey.py"` |

---

## 4. Sacred Truth (Design & Orakelkrav)

### 4.1 Strikt Isoleringsregel
*   `Agent-Oracle` får enbart skriva under `/home/ma-auto/DEV/HockeyJockey/tests/` (t.ex. `tests/test_unit_domain.py`, `tests/oracle_hockeyjockey.py` och eventuella helper-filer i `tests/`).
*   `Agent-Oracle` får **ALDRIG** modifiera `src/`, `package.json` eller `_init.md`.
*   Inga ytliga delsträngskontroller (`"+" in code`) är godkända som orakel; alla tester måste exekvera den faktiska källkoden i `src/` (t.ex. via `npx tsx` i sub-process eller Vitest) och verifiera beräkningsresultat samt reella sidoeffekter på filsystemet.

### 4.2 Stage 2 Enhetstester (`tests/test_unit_domain.py`)
Körs automatiskt av `invoke-v2-gate` (`python3 -m unittest discover -s tests -p "*test*.py"`). Måste exekvera funktionerna i `src/utils/domain.ts` och verifiera:
1. `parseTimeMmSsToMs` och `formatMsToMmSs`: `"00:45"` -> `45000`, `"02:15"` -> `135000`, `135000` -> `"02:15"`, samt säkert skydd mot negativa värden/ogiltiga sekunder.
2. `parseSpotifyUri`: konverterar `https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc123` och `/intl-sv/track/...` till `spotify:track:4uLU6hMCjMI75M1A2tKUQC`.
3. `parseRosterText`: parsar `"22 Rasmus Karlsson\n00 Målvakt\n#14 - Erik Svensson"` och bevarar ledande nollor (`"00"`, `"22"`, `"14"`).
4. `selectNextTrack`: cyklisk rotation över en 3-låtspool (`0 -> 1 -> 2 -> 0`) utan repetition.
5. `calculateVolumeSteps`:
   * `duckVolume`: `1.0 -> 0.2` på `400 ms` med `50 ms` intervall = exakt `8` steg med slutvärde `0.2`.
   * `fadeOutAndPause`: `1.0 -> 0.0` på `600 ms` med `50 ms` intervall = exakt `12` steg med slutvärde `0.0`.
   * Nolldivisionsskydd: `durationMs = 0` returnerar giltig lista utan `NaN`/`Infinity`.
6. `generatePenaltyScript` & `generateGoalScript`: kontrollerar korrekt svensk manusgenerering för spelarutvisning, okänt nummer, lagstraff, mål utan assist, mål med 1 assist och mål med 2 assist.

### 4.3 Stage 4 Objektivt Funktionsorakel (`tests/oracle_hockeyjockey.py`)
Måste utföra verklig exekvering och kontrollera reella sidoeffekter:
1. **Produktionsbygge (Reell sidoeffekt):** Exekverar `npm run build` i `/home/ma-auto/DEV/HockeyJockey` och verifierar att `dist/index.html` samt kompilerade JS- och CSS-artefakter i `dist/assets/` skapas på disk med icke-noll storlek.
2. **RFC 7636 PKCE SHA-256 Orakel:** Exekverar `generatePkceChallenge` från `src/utils/domain.ts` med känd testvektor (`dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk`) och verifierar exakt matchning mot RFC 7636 Appendix B (`E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`).
3. **Domartecken & Standardutvisningar (13 st):** Importerar `src/data/penalties.ts` och verifierar att samtliga 13 standardförseelser existerar med unika `id`, `labelSv`, `labelEn` och `iconKey`, samt att motsvarande SVG-rendering existerar i `src/components/RefereeIcons.tsx` utan saknade nycklar.
4. **JSON Export/Import-rundresa & AudioController-kontrakt:** Exekverar `exportMatchConfig` -> `importMatchConfig` med `src/utils/domain.ts` och verifierar att lag, spelare (`"00"`), soundpads och inställningar bevaras utan dataförlust, samt verifierar att `AudioController` i `src/services/audioController.ts` kan instansieras och köra `playAt`, `duckVolume`, `restoreVolume`, `fadeOutAndPause` och `hardStop` i simulerat/fallback-läge utan webbläsar-krasch.
5. **Git & GitHub Remote-kontroll:** Verifierar att `.git` finns i `/home/ma-auto/DEV/HockeyJockey`, att branch `main` är aktiv och att remote `origin` pekar mot `5w00t3dL10n/HockeyJockey`.

---

## 5. Oracle Contract (The Gate of Truth)
*   **Orakelskript:** `tests/oracle_hockeyjockey.py`
*   **Gate Runner:** `/home/ma-auto/DEV/bin/invoke-v2-gate --project "HockeyJockey" --required-tools "git,node,npm,python,gh" --oracle-script "tests/oracle_hockeyjockey.py"`
*   **Krav för Godkännande:** `exit_code == 0`, `.gate_telemetry.json` visar `"overall_status": "VERIFIED"`, och samtliga 5 stages (`STAGE_0_PROBE`, `STAGE_1_STATIC`, `STAGE_2_NATIVE_UNIT`, `STAGE_3_HEADLESS`, `STAGE_4_ORACLE`) har status `"PASS"`.

---

## 6. Resursallokering & Sub-Agent Roster (Triage-Resultat)

| Roster-Profil | Tilldelad Modell & Tier (`models.json`) | Ansvarsområde i Denna Modul |
| :--- | :--- | :--- |
| **`Agent-Oracle`** | **Gemini 4 Neon (High)** | Skriver `tests/test_unit_domain.py` och `tests/oracle_hockeyjockey.py` samt kör `invoke-v2-gate`. *(Fallback: Gemini 3.8 Flash (High))* |
| **`Agent-IO`** | **Gemini 3.8 Flash (Low)** | Arkiverar verifierade ritningar, committar och pushar slutresultatet till GitHub. *(Fallback: Gemini 4 Neon (Low))* |

**Tilldelad Roster-Profil för denna modul:** `Agent-Oracle` *(följt av `Agent-IO` för slutpush)*  
**Tilldelad Modell:** `Gemini 4 Neon (High)` *(och `Gemini 3.8 Flash (Low)` för slutpush)*
