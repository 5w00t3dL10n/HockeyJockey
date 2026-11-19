# Blueprint: 16_roster_lookup_and_teleprompter_names (Init V2)
Status: READY_TO_EXECUTE

> [!IMPORTANT]
> **READ-ONLY KONTRAKT FÖR SUB-AGENTER:**  
> Denna fil utgör "Sacred Truth" för modulen. Sub-agenter instrueras att läsa denna fil exakt en gång vid uppstart och betrakta den som orubblig lag. Sub-agenter får **ALDRIG skriva till eller modifiera denna fil**. Om ett gränssnitt behöver ändras, MÅSTE agenten stanna, eskalera till Master Coordinator och invänta en uppdaterad blueprint.

---

## 1. Syfte & Strategiskt Mål
Garantera att spelarnamn alltid kommer med korrekt och tillförlitligt i **HockeyJockeys** talmanus (teleprompter) för både Mål och Utvisning, genom:
1. Tolerant tröjnummernormalisering och smart roster-uppslagning (`normalizeJerseyNumber`, `lookupPlayerName`).
2. Utökad `parseRosterText` som hanterar punkter (`12. Namn`), mellanslag efter `#` (`# 12 Namn`), `Nr 12`, tabb-separerade rader och `Namn #12`.
3. Säkrad `generateGoalScript` och `generatePenaltyScript` med automatisk roster-fallback och alias-platshållare.
4. Kompletta standardtrupper (`#00`, `#1`–`#35`, inkl. `#6` och `#12`) i `DEFAULT_TEAMS` och `DEFAULT_SAVED_ROSTERS`.
5. Klickbara spelarchips (*Snabbval ur truppen*) och direkt namninmatning/komplettering inne i `GoalFlowModal.tsx` och `PenaltyFlowModal.tsx`.

---

## 2. Rollfördelning & Ansvarsområden
*   **Lead Architect (Master-agenten i ai-master-config):** Äger denna Sacred Truth-specifikation.
*   **`Agent-Logic` (`Claude Sonnet 5.5 (Medium)`):** Implementerar ändringarna i `/home/ma-auto/DEV/HockeyJockey/src/` autonomt i Sandbox Mode utan att röra `tests/` eller `*_init.md`.

---

## 3. Tech Stack & Tool-First Audit (MANDATORY)

| Område | Frågeställning | Audit-resultat |
| :--- | :--- | :--- |
| **Nivå 1 (OS-Native)** | Kan uppgiften lösas med inbyggda terminalkommandon? | **Nej** |
| **Motivering (varför Nivå 1 förkastas)** | *Obligatoriskt eftersom Nivå 3 väljs:* | Kräver deterministisk tröjnummer-normalisering (`"00"` vs `"0"`, `"06"` vs `"6"`), flerradig textparsning, mallinterpolering med fallback-uppslagning samt interaktiva klickbara spelarlistor och direkta formulär i React-modalerna. |
| **Nivå 2 (Etablerade CLI-verktyg)** | Finns etablerade CLI-verktyg? | **Ja** – `npm`, `tsc`, `vite`, `git`. |
| **Maskinberoende (Capabilities)** | Krävs specifika verktyg? | `node,npm,git,python` |
| **Gate Runner Integration** | Deterministiska kontroller | Stage 1: `npx tsc --noEmit`; full 5-stegsgrind exekveras i modul `17_oracle_roster_lookup_and_teleprompter`. |

---

## 4. Sacred Truth (Design & Arkitektur)

### 4.1 Normalisering, Smart Uppslagning & Talmanus (`src/utils/domain.ts`)
Filen ska förbli 100 % fri från DOM/`window`/`localStorage`-beroenden.
1. **`normalizeJerseyNumber(input: string): string`:**
   * Trimmar strängen, tar bort ledande `#`, `nr.`, `nr`, `no.`, `no`, samt avslutande `.` / `:` / `,` / `-` runt siffror (t.ex. `'#12'` -> `'12'`, `'12.'` -> `'12'`, `'Nr 6'` -> `'6'`, `'# 00'` -> `'00'`).
2. **`lookupPlayerName(roster: Record<string, string> | undefined, jerseyNumber: string): string | undefined`:**
   * Om `roster` saknas eller `jerseyNumber` är tomt -> returnera `undefined`.
   * Sökordning:
     1. Exakt match: `roster[trimmed]`
     2. Normaliserad match: `roster[normalized]` (via `normalizeJerseyNumber`)
     3. Normaliserad nyckelskanning över `Object.entries(roster)` där `normalizeJerseyNumber(key) === normalized`
     4. Heltalsmatchning för nummer `> 0` när ena sidan har ledande nolla och den andra inte (t.ex. `'06'` matchar `'6'` och `'6'` matchar `'06'`, medan `'0'` och `'00'` aldrig matchar varandra!).
   * Returnera trimmat icke-tomt namn eller `undefined`.
3. **Utökad `parseRosterText(text: string): Record<string, string>`:**
   * Stöder formaten:
     * `'22 Rasmus Karlsson'`, `'00 Oscar Holm (MV)'`
     * `'12. Kalle Svensson'`, `'6. Erik Lind'`
     * `'#12 Kalle Svensson'`, `'# 12 - Kalle Svensson'`
     * `'Nr 12 Kalle Svensson'`, `'Nr. 12: Kalle Svensson'`
     * `'12\tKalle Svensson\tForward'` (bevarar namn / rensar separator)
     * `'Kalle Svensson #12'`, `'Kalle Svensson (12)'`
   * Normaliserar tröjnummer med `normalizeJerseyNumber` (bevarar `'00'`).
4. **Robust `generateGoalScript` & `generatePenaltyScript`:**
   * `generateGoalScript` utökas med valfritt fält `roster?: Record<string, string>` i `params`: om `params.scorerName` saknas/är tomt men `params.roster` finns, slås `scorerName` automatiskt upp via `lookupPlayerName(params.roster, scorerNumber)`. Samma gäller för varje assist i `params.assists` om `assist.name` saknas men `params.roster` finns.
   * `generatePenaltyScript` utökas med valfritt fält `roster?: Record<string, string>` i `params`: om `params.playerName` saknas/är tomt men `params.roster` finns, slås `playerName` upp via `lookupPlayerName(params.roster, playerNumber)`.
   * Alias-stöd i mallar:
     * `generateGoalScript`: stöder även `{name}` / `{playerName}` som alias för `{scorerName}` och `{number}` / `{playerNumber}` som alias för `{scorerNumber}`. Om en användarredigerad målmall innehåller `{scorerNumber}` men saknar `{scorerName}` (och `{name}`/`{playerName}`) trots att ett icke-tomt `scorerName` finns, infogas `, {scorerName}` automatiskt direkt efter `{scorerNumber}`!
     * `generatePenaltyScript`: stöder även `{playerName}` / `{scorerName}` som alias för `{name}` och `{playerNumber}` / `{scorerNumber}` som alias för `{number}`.
   * Befintligt kontrakt när namn saknas: `, {scorerName}` / `, {name}` tas bort rent utan dubbelkomman eller lösa mellanslag (100 % bakåtkompatibelt med befintligt `test_06`).
5. **Uppdaterad `sanitizeTeam` (`src/utils/domain.ts`) & `upsertPlayer` (`src/store/useAppStore.ts`):**
   * Normaliserar tröjnummernycklar via `normalizeJerseyNumber` vid sparning och sanering.

### 4.2 Utökade Standardtrupper (`src/data/defaults.ts`)
* `DEFAULT_TEAMS.home` (*Sundsvall Hockey*) och `DEFAULT_TEAMS.away` (*Timrå IK*) samt motsvarande lag i `DEFAULT_SAVED_ROSTERS` utökas till kompletta matchtrupper (ca 20–24 spelare inkl. målvakter `'00'`, `'1'`/`'30'` och utespelare inklusive `#2`, `#3`, `#6`, `#9`, `#11`, `#12`, `#15`, `#16`, `#18`, `#20`, `#23`, `#25`, `#28`, `#33`) samtidigt som alla befintliga nummer och namn (`00 Oscar Holm (MV)`, `7 Anna Berg`, `14 Erik Svensson`, `22 Rasmus Karlsson`, etc.) behålls exakt som tidigare.

### 4.3 Gränssnitt i `GoalFlowModal.tsx`, `PenaltyFlowModal.tsx` & `App.tsx`
1. **Smart uppslagning överallt:** `GoalFlowModal` och `PenaltyFlowModal` använder `lookupPlayerName(team.roster, ...)` för live-uppslagning och skickar även med `roster: team.roster` till `generateGoalScript` och `generatePenaltyScript`.
2. **Klickbara Spelarchips (*Snabbval ur truppen*):**
   * I både `GoalFlowModal.tsx` (under `scorer`, `assist1`, `assist2`) och `PenaltyFlowModal.tsx` (under `player`) visas en kompakt panel med klickbara spelarknappar `#{nr} {namn}` sorterade efter tröjnummer (filtreras/markeras automatiskt utifrån inmatade siffror). Klick på ett chip sätter numret direkt (och kan gå vidare eller direkt fylla inmatningen med ett klick).
3. **Direkt Namnkomplettering i Modalen:**
   * När speakern har slagit in ett tröjnummer i `GoalFlowModal` eller `PenaltyFlowModal` som saknar namn i `team.roster` (eller vill korrigera ett namn direkt), finns ett textfält *"Spelarnamn för #{nr} (sparas i truppen)"* direkt under live-uppslagningen. Sparas via `onUpsertPlayer(nr, namn)` -> `upsertPlayer(team.id, nr, namn)` i `useAppStore` så att namnet omedelbart hamnar både i talmanuset och i lagets trupp!
   * Även i manussteget (Steg 2 i `GoalFlowModal`, Steg 3 i `PenaltyFlowModal`): om målskytt, assist eller utvisad spelare saknar namn visas en diskret snabbpanel för att direkt komplettera namnet utan att behöva backa ut i Setup-vyn!
4. **Auto-sparning av pågående inmatning i `GoalFlowModal.tsx`:**
   * Säkerställ att om `currentInput` innehåller en siffra under `assist1` eller `assist2` och användaren klickar `KLAR / GÅ TILL MANUS`, sparas `currentInput` + uppslaget namn alltid.

---

## 5. Oracle Contract (The Gate of Truth)
Verifieras av `Agent-Oracle` i Modul `17_oracle_roster_lookup_and_teleprompter` via `tests/test_unit_domain.py`, `tests/oracle_hockeyjockey.py` och `/home/ma-auto/DEV/bin/invoke-v2-gate` med `exit code 0` och `"overall_status": "VERIFIED"`.

---

## 6. Resursallokering & Sub-Agent Roster

| Roster-Profil | Tilldelad Modell & Tier (`models.json`) | Ansvarsområde |
| :--- | :--- | :--- |
| **`Agent-Logic`** | **Claude Sonnet 5.5 (Medium)** | Nivå 3 Custom Code för Modul 16 (`src/`). |

**Tilldelad Roster-Profil för denna modul:** `Agent-Logic`  
**Tilldelad Modell:** `Claude Sonnet 5.5 (Medium)`
