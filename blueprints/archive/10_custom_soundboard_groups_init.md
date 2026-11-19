# Blueprint: 10_custom_soundboard_groups (Init V2)
Status: READY_TO_EXECUTE

> [!IMPORTANT]
> **READ-ONLY KONTRAKT FÖR SUB-AGENTER:**  
> Denna fil utgör "Sacred Truth" för modulen. Sub-agenter instrueras att läsa denna fil exakt en gång vid uppstart och betrakta den som orubblig lag. Sub-agenter får **ALDRIG skriva till eller modifiera denna fil**. Om ett gränssnitt behöver ändras, MÅSTE agenten stanna, eskalera till Master Coordinator och invänta en uppdaterad blueprint.

---

## 1. Syfte & Strategiskt Mål
Utöka **HockeyJockey** så att användaren kan definiera, döpa om, ändra ordning på och ta bort **egna grupper (kategorier)** för snabbknapparna på soundboarden, välja dem i kategori-väljaren både när nya knappar skapas och på befintliga knappar, samt spara dem i `localStorage`, Matchprofiler och JSON Export/Import.

---

## 2. Rollfördelning & Ansvarsområden
*   **Lead Architect (Master-agenten i ai-master-config):** Äger denna Sacred Truth-specifikation.
*   **`Agent-Logic` (`Claude Sonnet 5.5 (Medium)`):** Implementerar ändringarna i `/home/ma-auto/DEV/HockeyJockey/src/` autonomt i Sandbox Mode utan att röra `tests/` eller `*_init.md`.

---

## 3. Tech Stack & Tool-First Audit (MANDATORY)

| Område | Frågeställning | Audit-resultat |
| :--- | :--- | :--- |
| **Nivå 1 (OS-Native)** | Kan uppgiften lösas med inbyggda terminalkommandon? | **Nej** |
| **Motivering (varför Nivå 1 förkastas)** | *Obligatoriskt eftersom Nivå 3 väljs:* | Dynamisk grupphantering, omordning, säker migrering av tillhörande `SoundPad`-poster vid borttagning och reaktiv rendering i React/Zustand kan inte lösas med OS-nativa terminalkommandon. |
| **Nivå 2 (Etablerade CLI-verktyg)** | Finns etablerade CLI-verktyg? | **Ja** – `npm`, `tsc`, `vite`, `git`. |
| **Maskinberoende (Capabilities)** | Krävs specifika verktyg? | `node,npm,git,python` |
| **Gate Runner Integration** | Deterministiska kontroller | Stage 1: `npx tsc --noEmit`; full 5-stegsgrind exekveras i modul `11_oracle_custom_soundboard_groups`. |

---

## 4. Sacred Truth (Design & Arkitektur)

### 4.1 Datamodeller & Standardgrupper (`src/types/models.ts` & `src/data/defaults.ts`)
1. **`src/types/models.ts`:**
   * `export type BuiltinPadCategory = 'goal_home' | 'goal_away' | 'penalty_home' | 'penalty_away' | 'faceoff_off' | 'faceoff_def' | 'hype' | 'organ' | 'misc';`
   * `export type PadCategory = BuiltinPadCategory | (string & {});`
   * `export interface SoundboardGroup { id: string; label: string; isBuiltin?: boolean; }`
   * `AppSettings` utökas med `soundboardGroups: SoundboardGroup[];`.
   * `MatchProfile['settings']` utökas med `soundboardGroups?: SoundboardGroup[];`.
2. **`src/data/defaults.ts`:**
   * `EVENT_PAD_CATEGORIES: BuiltinPadCategory[]` = `['goal_home', 'goal_away', 'penalty_home', 'penalty_away']`.
   * `DEFAULT_SOUNDBOARD_GROUPS: SoundboardGroup[]`:
     1. `{ id: 'faceoff_off', label: 'Tekning Anfallszon', isBuiltin: true }`
     2. `{ id: 'faceoff_def', label: 'Tekning Försvarszon', isBuiltin: true }`
     3. `{ id: 'hype', label: 'Pepp / Underläge', isBuiltin: true }`
     4. `{ id: 'organ', label: 'Orgel / Publikpepp', isBuiltin: true }`
     5. `{ id: 'misc', label: 'Timeout / Paus / Skada', isBuiltin: true }`
   * `DEFAULT_SETTINGS.soundboardGroups` = `DEFAULT_SOUNDBOARD_GROUPS`.
   * Exportera `getPadCategoryLabel(categoryId: string, soundboardGroups?: SoundboardGroup[]): string` som letar i `soundboardGroups` först, sedan `PAD_CATEGORY_LABELS`, och annars returnerar `categoryId`.

### 4.2 Ren Domänlogik (`src/utils/domain.ts`)
1. **`sanitizeSoundboardGroups(rawGroups: unknown, fallback?: SoundboardGroup[], soundPads?: SoundPad[]): SoundboardGroup[]`:**
   * Om `rawGroups` inte är en giltig icke-tom array används `fallback ?? DEFAULT_SOUNDBOARD_GROUPS`.
   * Filtrerar bort poster utan icke-tomt `id` och `label`, tar bort dubblett-`id` och exkluderar `EVENT_PAD_CATEGORIES` (`goal_home`, `goal_away`, `penalty_home`, `penalty_away`) så att händelsekategorierna förblir åtskilda.
   * **Självläkande gruppregistrering:** Om `soundPads` innehåller knappar vars `category` inte ingår i `EVENT_PAD_CATEGORIES` och saknas i den sanerade grupplistan, läggs en `SoundboardGroup` automatiskt till för det `category`-ID:t (med etikett från `PAD_CATEGORY_LABELS[id]` om den är inbyggd, annars snyggt formaterad från `id`) så att inga knappar blir osynliga i Matchläge.
2. **Uppdaterad `sanitizeSoundPads`:** Accepterar valfri icke-tom trimmad `rawPad.category`-sträng (faller tillbaka på `'misc'` endast om den saknas eller är tom).
3. **Uppdaterad `sanitizeSettings`, `sanitizeMatchProfile` & `sanitizeMatchConfig`:** Sanerar `soundboardGroups` via `sanitizeSoundboardGroups` med bakåtkompatibilitet för äldre konfigurationer och profiler.

### 4.3 Zustand-store (`src/store/useAppStore.ts`)
Nya actions i `useAppStore`:
1. `addSoundboardGroup(label: string, customId?: string): string` — Skapar en ny grupp med trimmat `label` och unikt `id` (t.ex. `customId` eller `group-<slug>-<random>`, aldrig kolliderande med befintliga grupper eller `EVENT_PAD_CATEGORIES`). Om en grupp med exakt samma namn (case-insensitive) eller `customId` redan finns returneras befintligt `id`.
2. `updateSoundboardGroup(groupId: string, label: string): void` — Uppdaterar visningsnamnet (`label`) på gruppen.
3. `moveSoundboardGroup(groupId: string, direction: 'up' | 'down'): void` — Ändrar visningsordning i `settings.soundboardGroups`.
4. `deleteSoundboardGroup(groupId: string, fallbackCategoryId?: string): void` — Tar bort gruppen (behåller minst en grupp `'misc'` om listan annars skulle bli tom) och flyttar alla `soundPads` med `pad.category === groupId` till `fallbackCategoryId` (eller första kvarvarande gruppen, annars `'misc'`) så att inga knappar försvinner.
5. `saveCurrentAsMatchProfile` & `activateMatchProfile` — Sparar och återställer `soundboardGroups` i `MatchProfile.settings` (med säker sanering om en äldre profil saknar `soundboardGroups`).

### 4.4 Gränssnitt (`src/components/SetupView.tsx`, `src/components/MatchView.tsx`, `src/App.tsx`)
1. **`SetupView.tsx` (under fliken `Soundboard & Låtpooler`):**
   * **Panel "Grupper för Snabbknappar (Soundboard-kategorier)":**
     * Formulär för att skapa ny grupp (`"Namn på ny grupp (t.ex. Intro, Uppvärmning, Periodpaus)"` + knapp `+ Skapa grupp`).
     * Lista över alla grupper i `settings.soundboardGroups` med antal tillhörande knappar, inline-redigering av gruppnamn, knappar för att flytta upp (`↑`) / ner (`↓`) samt `Ta bort` (med automatisk flytt av gruppens knappar).
   * **I `"Skapa ny soundboard-knapp"` och på varje `SoundPadEditor`-kort:**
     * Kategori-`<select>` grupperas med `<optgroup label="Soundboard-grupper (Snabbknappar)">` (visar alla `settings.soundboardGroups`) och `<optgroup label="Matchhändelser (Mål & Utvisning)">` (de 4 händelsekategorierna).
     * Knappsats-badge på `SoundPadEditor` använder `getPadCategoryLabel(pad.category, settings.soundboardGroups)` så att egna gruppnamn visas korrekt överallt.
     * Snabbknapp `+ Ny grupp` direkt vid kategoriväljaren när man skapar/redigerar en knapp för att omedelbart skapa en ny grupp och välja den.
2. **`MatchView.tsx` & `App.tsx`:**
   * `App.tsx` skickar `soundboardGroups={settings.soundboardGroups}` till `MatchView`.
   * `MatchView` renderar alla grupper i `soundboardGroups`-ordning (samt eventuella icke-händelsekategorier som saknas i listan) och använder gruppens `label` som rubrik.

---

## 5. Oracle Contract (The Gate of Truth)
Verifieras av `Agent-Oracle` i Modul `11_oracle_custom_soundboard_groups` via `tests/test_unit_domain.py`, `tests/oracle_hockeyjockey.py` och `/home/ma-auto/DEV/bin/invoke-v2-gate` med `exit code 0` och `"overall_status": "VERIFIED"`.

---

## 6. Resursallokering & Sub-Agent Roster

| Roster-Profil | Tilldelad Modell & Tier (`models.json`) | Ansvarsområde |
| :--- | :--- | :--- |
| **`Agent-Logic`** | **Claude Sonnet 5.5 (Medium)** | Nivå 3 Custom Code för Modul 10 (`src/`). |

**Tilldelad Roster-Profil för denna modul:** `Agent-Logic`  
**Tilldelad Modell:** `Claude Sonnet 5.5 (Medium)`
