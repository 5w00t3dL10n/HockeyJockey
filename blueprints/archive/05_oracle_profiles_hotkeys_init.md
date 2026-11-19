# Blueprint: 05_oracle_profiles_hotkeys (Init V2)
Status: READY_TO_EXECUTE

> [!IMPORTANT]
> **READ-ONLY KONTRAKT FÖR SUB-AGENTER:**  
> Denna fil utgör "Sacred Truth" för modulen. Sub-agenter instrueras att läsa denna fil exakt en gång vid uppstart och betrakta den som orubblig lag. Sub-agenter får **ALDRIG skriva till eller modifiera denna fil**.

---

## 1. Syfte & Strategiskt Mål
Utöka oberoende enhetstester (Stage 2) och funktionsoraklet (Stage 4) för att verifiera anpassningsbara snabbkommandon (`KeyBindings`), matchprofiler (`MatchProfile`) och roster-bibliotek (`SavedRoster`) i **HockeyJockey**, exekvera `invoke-v2-gate`, arkivera ritningarna, pusha till GitHub och bekräfta att utvecklingsservern på `http://127.0.0.1:5173` är aktiv.

---

## 2. Rollfördelning & Ansvarsområden
*   **`Agent-Oracle` (`Gemini 4 Neon (High)`):**
    *   Strikt isolerad från `src/` (får aldrig redigera `src/`, `package.json` eller `*_init.md`).
    *   Utökar `tests/test_unit_domain.py` och `tests/oracle_hockeyjockey.py`.
    *   Kör `/home/ma-auto/DEV/bin/invoke-v2-gate --project "HockeyJockey" --required-tools "git,node,npm,python,gh" --oracle-script "tests/oracle_hockeyjockey.py"`.
*   **`Agent-IO` (`Gemini 3.8 Flash (Low)`):**
    *   Synkar/arkiverar ritningar `04_*` och `05_*` till `blueprints/archive/`, committar och pushar till `https://github.com/5w00t3dL10n/HockeyJockey`, samt bekräftar att servern på `http://127.0.0.1:5173` levererar den uppdaterade appen med HTTP `200`.

---

## 3. Tech Stack & Tool-First Audit (MANDATORY)

| Område | Frågeställning | Audit-resultat |
| :--- | :--- | :--- |
| **Nivå 1 (OS-Native)** | Kan testsviter och funktionsorakel lösas enbart med Bash? | **Nej** (testlogik), **Ja** (arkivering, git-push & serverkontroll via `Agent-IO`). |
| **Motivering (varför Nivå 1 förkastas)** | *Obligatoriskt för Stage 2 & Stage 4:* | Kräver körning av TypeScript-domänlogik och Zustand-store via `npx tsx`, konfliktlösningstest av hotkeys, tillståndsbyten mellan profiler/lag samt verifiering av produktionsbygge (`dist/`). |
| **Nivå 2 (Etablerade CLI-verktyg)** | Finns etablerade CLI-verktyg? | **Ja** – `/home/ma-auto/DEV/bin/invoke-v2-gate`, `python3`, `node`, `npx`, `npm`, `git`, `gh`. |
| **Maskinberoende (Capabilities)** | Krävs specifika verktyg? | `git,node,npm,python,gh` |
| **Gate Runner Integration** | Exakt kommando | `/home/ma-auto/DEV/bin/invoke-v2-gate --project "HockeyJockey" --required-tools "git,node,npm,python,gh" --oracle-script "tests/oracle_hockeyjockey.py"` |

---

## 4. Sacred Truth (Orakelkontrakt)

### 4.1 Stage 2 Enhetstester (`tests/test_unit_domain.py`)
Utöver befintliga 6 tester MÅSTE Stage 2-sviten exekvera funktionerna i `src/utils/domain.ts` och verifiera:
1. **`normalizeHotkeyString` & `formatHotkeyFromEvent`:** Normalisering av `'space'`, `'shift+space'`, `'KeyD'`, `'d'`, `'f1'`, `'Digit1'` + `shiftKey: true` samt att ensamma modifierare returnerar `''`.
2. **`assignHotkey` & `resolveHotkeyMatch`:**
   * Tilldelning av ny tangent till en `MatchActionId` och en `SoundPad`.
   * Automatisk konfliktlösning: om samma tangent redan är bunden till annan `action` eller `pad` rensas den gamla bindningen och `replacedTarget` rapporterar exakt den ersatta målnyckeln.
   * Rensning av bindning med `''`.
3. **Bakåtkompatibel `sanitizeMatchConfig`:** Verifierar att äldre snapshot utan `keyBindings`, `savedRosters` eller `matchProfiles` samt med tomt `spotifyClientId` saneras med `DEFAULT_KEY_BINDINGS` och `35b681ec04634ec3a6a5083ce87216c4` utan dataförlust i befintliga `teams`/`soundPads`.

### 4.2 Stage 4 Objektivt Funktionsorakel (`tests/oracle_hockeyjockey.py`)
Utöver befintliga 5 kontroller MÅSTE Stage 4-oraklet exekvera den faktiska Zustand-storen (`src/store/useAppStore.ts`) och byggsystemet:
1. **Produktionsbygge (`npm run build`):** Nybyggda `dist/`-artefakter på disk.
2. **Roster-bibliotek (`SavedRoster`):** Verifierar via `useAppStore` att minst 4 förkonfigurerade lag finns, att användaren kan spara flera nya laguppställningar (inkl. `"00"`), ladda valfri sparad trupp till antingen `'home'` eller `'away'`, duplicera och radera sparad trupp.
3. **Matchprofiler (`MatchProfile`):** Verifierar via `useAppStore` att två olika matchprofiler för olika åldrar/klubbar kan sparas med olika låtar/soundpads och att `activateMatchProfile` deterministiskt växlar aktiva `soundPads` och inställningar fram och tillbaka.
4. **Anpassningsbara Snabbkommandon i Store:** Verifierar `setActionHotkey`, `setPadHotkey` (inkl. konfliktöverföring och synk till `pad.hotkey`) samt `resetHotkeysToDefault`.
5. **JSON Export/Import-rundresa:** Verifierar att `exportConfigJson` -> `importConfigJson` bevarar `savedRosters`, `matchProfiles`, `activeProfileId` och `settings.keyBindings` fullständigt.

---

## 5. Resursallokering & Sub-Agent Roster

| Roster-Profil | Tilldelad Modell & Tier (`models.json`) | Ansvarsområde |
| :--- | :--- | :--- |
| **`Agent-Oracle`** | **Gemini 4 Neon (High)** | Utökar `tests/test_unit_domain.py` & `tests/oracle_hockeyjockey.py` samt kör `invoke-v2-gate`. |
| **`Agent-IO`** | **Gemini 3.8 Flash (Low)** | Synk/arkivering, commit & GitHub-push samt kontroll av dev-server. |

**Tilldelad Roster-Profil för denna modul:** `Agent-Oracle` *(följt av `Agent-IO`)*  
**Tilldelad Modell:** `Gemini 4 Neon (High)` *(och `Gemini 3.8 Flash (Low)`)*
